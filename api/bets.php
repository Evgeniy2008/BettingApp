<?php
require_once 'config.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? $_SERVER['REQUEST_URI'] ?? '';

// Получение ID ставки из пути или query параметра
$betId = $_GET['bet_id'] ?? null;
if (preg_match('#/([A-Z0-9-]+)$#', $path, $matches)) {
    $betId = $matches[1];
}

// Создание ставки
if ($method === 'POST' && empty($betId)) {
    $user = checkUserAuth();
    $data = getRequestData();
    
    // Валидация данных
    if (empty($data['slip']) || !is_array($data['slip']) || count($data['slip']) === 0) {
        sendJSON(['error' => 'Betslip is empty'], 400);
    }
    
    if (empty($data['stake']) || !is_numeric($data['stake']) || $data['stake'] <= 0) {
        sendJSON(['error' => 'Invalid stake amount'], 400);
    }
    
    $stake = floatval($data['stake']);
    
    $db = getDB();
    
    // Получаем актуальные данные пользователя (баланс, кредитный лимит, долг)
    $userStmt = $db->prepare("SELECT balance, credit_limit, current_debt FROM users WHERE id = ?");
    $userStmt->execute([$user['id']]);
    $userData = $userStmt->fetch();
    
    if (!$userData) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    $balance = floatval($userData['balance']);
    $creditLimit = floatval($userData['credit_limit'] ?? 0);
    $currentDebt = floatval($userData['current_debt'] ?? 0);
    
    // Вычисляем доступные средства (баланс + доступный кредит)
    $availableCredit = max(0, $creditLimit - $currentDebt); // Доступный кредит = лимит - текущий долг
    $totalAvailable = $balance + $availableCredit;
    
    // Проверка достаточности средств
    if ($totalAvailable < $stake) {
        sendJSON([
            'error' => 'Insufficient funds',
            'balance' => $balance,
            'available_credit' => $availableCredit,
            'total_available' => $totalAvailable,
            'required' => $stake
        ], 400);
    }
    
    // Вычисляем, сколько списать с баланса и сколько с кредита
    $amountFromBalance = min($balance, $stake); // Списываем с баланса сколько есть, но не больше ставки
    $amountFromCredit = $stake - $amountFromBalance; // Остаток списываем с кредита
    
    // Вычисляем новые значения
    $newBalance = $balance - $amountFromBalance;
    $newCurrentDebt = $currentDebt + $amountFromCredit; // Увеличиваем долг на сумму, взятую в кредит
    // credit_limit не меняется, меняется только current_debt
    
    try {
        $db->beginTransaction();
        
        // Вычисляем общий коэффициент для экспресса
        $totalOdds = 1;
        $validSlipItems = [];
        foreach ($data['slip'] as $slipItem) {
            // Accept both old format (outcomeKey) and new format (from API with bookmakerId, betId, value)
            if (empty($slipItem['matchId']) || empty($slipItem['odd'])) {
                continue;
            }
            // New format: must have bookmakerId, betId, value
            // Old format: must have outcomeKey
            if (empty($slipItem['outcomeKey']) && (empty($slipItem['bookmakerId']) || empty($slipItem['betId']))) {
                continue;
            }
            $validSlipItems[] = $slipItem;
            $totalOdds *= floatval($slipItem['odd']);
        }
        
        if (empty($validSlipItems)) {
            sendJSON(['error' => 'No valid outcomes in betslip'], 400);
        }
        
        // Создаем одну ставку (экспресс, если несколько исходов)
        // Используем первый исход для основной информации
        $firstItem = $validSlipItems[0];
        $isExpress = count($validSlipItems) > 1;
        
        // Генерируем уникальный ID ставки
        $betIdValue = 'BET-' . strtoupper(substr(generateUUID(), 0, 8));
        
        // Проверяем уникальность
        $checkStmt = $db->prepare("SELECT id FROM bets WHERE bet_id = ?");
        $checkStmt->execute([$betIdValue]);
        while ($checkStmt->fetch()) {
            $betIdValue = 'BET-' . strtoupper(substr(generateUUID(), 0, 8));
            $checkStmt->execute([$betIdValue]);
        }
        
        $potentialWin = $stake * $totalOdds;
        
        // Определяем тип исхода из API данных
        $outcomeType = null;
        if (isset($firstItem['betName'])) {
            // Use bet name from API
            $outcomeType = $firstItem['betName'];
        } elseif (in_array($firstItem['outcomeKey'], ['1', 'X', '2'])) {
            $outcomeType = '1x2';
        } elseif (strpos($firstItem['outcomeKey'], 'total') !== false) {
            $outcomeType = 'total';
        } elseif (strpos($firstItem['outcomeKey'], 'fora') !== false) {
            $outcomeType = 'fora';
        }
        
        // Формируем label из API данных (bookmaker - bet name: value)
        $outcomeLabel = $firstItem['label'] ?? $firstItem['outcomeKey'];
        if (isset($firstItem['bookmakerName']) && isset($firstItem['betName']) && isset($firstItem['value'])) {
            $outcomeLabel = $firstItem['bookmakerName'] . ' - ' . $firstItem['betName'] . ': ' . $firstItem['value'];
        } elseif (isset($firstItem['bookmakerName']) && isset($firstItem['betName'])) {
            $outcomeLabel = $firstItem['bookmakerName'] . ' - ' . $firstItem['betName'];
        }
        
        if ($isExpress) {
            $outcomeLabel = 'Express (' . count($validSlipItems) . ' outcomes)';
        }
        
        // Сохраняем детали всех исходов в JSON
        $betDetails = json_encode($validSlipItems, JSON_UNESCAPED_UNICODE);
        
        // Get fixture_id from first item (use fixtureId if available, otherwise matchId)
        $fixtureId = $firstItem['fixtureId'] ?? $firstItem['matchId'] ?? '';
        $matchId = $firstItem['matchId'] ?? '';
        
        // Set initial status to 'active' (will be checked and settled automatically)
        $initialStatus = 'active';
        
        // Вставляем ставку
        // Check if fixture_id column exists, if not use match_id for both
        try {
            $checkColumn = $db->query("SHOW COLUMNS FROM bets LIKE 'fixture_id'");
            $hasFixtureId = $checkColumn->rowCount() > 0;
        } catch (Exception $e) {
            $hasFixtureId = false;
        }
        
        if ($hasFixtureId) {
            $stmt = $db->prepare("
                INSERT INTO bets (
                    bet_id, user_id, match_id, fixture_id, line_id,
                    match_home, match_away, match_league,
                    outcome_key, outcome_label, outcome_type, outcome_value,
                    odd, stake, potential_win, status, bet_details
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            $stmt->execute([
                $betIdValue,
                $user['id'],
                $matchId,
                $fixtureId, // Save fixture_id for API calls
                $firstItem['lineId'] ?? null,
                $firstItem['home'] ?? '',
                $firstItem['away'] ?? '',
                $firstItem['leagueName'] ?? null,
                $firstItem['outcomeKey'],
                $outcomeLabel,
                $outcomeType,
                $firstItem['value'] ?? null,
                $totalOdds, // Общий коэффициент для экспресса
                $stake,
                $potentialWin,
                $initialStatus,
                $betDetails
            ]);
        } else {
            // Fallback if fixture_id column doesn't exist yet
            $stmt = $db->prepare("
                INSERT INTO bets (
                    bet_id, user_id, match_id, line_id,
                    match_home, match_away, match_league,
                    outcome_key, outcome_label, outcome_type, outcome_value,
                    odd, stake, potential_win, status, bet_details
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            $stmt->execute([
                $betIdValue,
                $user['id'],
                $matchId,
                $firstItem['lineId'] ?? null,
                $firstItem['home'] ?? '',
                $firstItem['away'] ?? '',
                $firstItem['leagueName'] ?? null,
                $firstItem['outcomeKey'],
                $outcomeLabel,
                $outcomeType,
                $firstItem['value'] ?? null,
                $totalOdds,
                $stake,
                $potentialWin,
                $initialStatus,
                $betDetails
            ]);
        }
        
        $createdBets = [
            [
                'id' => $betIdValue,
                'bet_db_id' => $db->lastInsertId(),
                'isExpress' => $isExpress,
                'outcomesCount' => count($validSlipItems)
            ]
        ];
        
        // Обновляем баланс пользователя, кредитный долг и общую сумму ставок
        $updateStmt = $db->prepare("
            UPDATE users 
            SET balance = ?, 
                current_debt = ?,
                total_staked = total_staked + ?
            WHERE id = ?
        ");
        $updateStmt->execute([$newBalance, $newCurrentDebt, $stake, $user['id']]);
        
        $db->commit();
        
        sendJSON([
            'success' => true,
            'bets' => $createdBets,
            'stake' => $stake,
            'totalOdds' => $totalOdds,
            'potentialWin' => $stake * $totalOdds,
            'newBalance' => $newBalance,
            'amountFromBalance' => $amountFromBalance,
            'amountFromCredit' => $amountFromCredit,
            'newCurrentDebt' => $newCurrentDebt
        ]);
        
    } catch (Exception $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to place bet: ' . $e->getMessage()], 500);
    }
}

// Получение списка ставок пользователя
if ($method === 'GET' && empty($betId)) {
    $user = checkUserAuth();
    $db = getDB();
    
    $status = $_GET['status'] ?? null;
    $limit = intval($_GET['limit'] ?? 100);
    $offset = intval($_GET['offset'] ?? 0);
    
    $query = "SELECT * FROM bets WHERE user_id = ?";
    $params = [$user['id']];
    
    if ($status && in_array($status, ['pending', 'active', 'won', 'lost', 'cancelled', 'refunded'])) {
        $query .= " AND status = ?";
        $params[] = $status;
    }
    
    $query .= " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    $params[] = $limit;
    $params[] = $offset;
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $bets = $stmt->fetchAll();
    
    // Форматируем данные для фронтенда
    $formattedBets = array_map(function($bet) {
        $betDetails = null;
        $matches = [];
        $isExpress = false;
        
        // Парсим bet_details для экспресс-ставок
        if (!empty($bet['bet_details'])) {
            $betDetails = json_decode($bet['bet_details'], true);
            if (is_array($betDetails) && count($betDetails) > 1) {
                $isExpress = true;
                // Формируем массив всех матчей из экспресса
                foreach ($betDetails as $item) {
                    $matches[] = [
                        'home' => $item['home'] ?? '',
                        'away' => $item['away'] ?? '',
                        'league' => $item['leagueName'] ?? '',
                        'outcome' => [
                            'label' => $item['label'] ?? $item['outcomeKey'] ?? '',
                            'odd' => floatval($item['odd'] ?? 0),
                            'key' => $item['outcomeKey'] ?? '',
                            'value' => $item['value'] ?? null
                        ]
                    ];
                }
            }
        }
        
        // Если не экспресс, добавляем основной матч
        if (!$isExpress) {
            $matches[] = [
                'home' => $bet['match_home'],
                'away' => $bet['match_away'],
                'league' => $bet['match_league'],
                'outcome' => [
                    'label' => $bet['outcome_label'],
                    'odd' => floatval($bet['odd']),
                    'key' => $bet['outcome_key'],
                    'value' => $bet['outcome_value']
                ]
            ];
        }
        
        return [
            'id' => $bet['bet_id'],
            'status' => $bet['status'],
            'match' => [
                'home' => $bet['match_home'],
                'away' => $bet['match_away'],
                'league' => $bet['match_league']
            ],
            'matches' => $matches, // Все матчи из экспресса
            'isExpress' => $isExpress,
            'outcome' => [
                'label' => $bet['outcome_label'],
                'odd' => floatval($bet['odd']),
                'type' => $bet['outcome_type'],
                'value' => $bet['outcome_value']
            ],
            'stake' => floatval($bet['stake']),
            'potentialWin' => floatval($bet['potential_win']),
            'winAmount' => $bet['win_amount'] ? floatval($bet['win_amount']) : null,
            'createdAt' => $bet['created_at'],
            'settledAt' => $bet['settled_at'],
            'cancelledAt' => $bet['cancelled_at']
        ];
    }, $bets);
    
    sendJSON([
        'success' => true,
        'bets' => $formattedBets,
        'count' => count($formattedBets)
    ]);
}

// Получение детальной информации о ставке
if ($method === 'GET' && !empty($betId)) {
    $user = checkUserAuth();
    $db = getDB();
    
    $stmt = $db->prepare("SELECT * FROM bets WHERE bet_id = ? AND user_id = ?");
    $stmt->execute([$betId, $user['id']]);
    $bet = $stmt->fetch();
    
    if (!$bet) {
        sendJSON(['error' => 'Bet not found'], 404);
    }
    
    sendJSON([
        'success' => true,
        'bet' => [
            'id' => $bet['bet_id'],
            'status' => $bet['status'],
            'match' => [
                'id' => $bet['match_id'],
                'lineId' => $bet['line_id'],
                'home' => $bet['match_home'],
                'away' => $bet['match_away'],
                'league' => $bet['match_league']
            ],
            'outcome' => [
                'key' => $bet['outcome_key'],
                'label' => $bet['outcome_label'],
                'type' => $bet['outcome_type'],
                'value' => $bet['outcome_value'],
                'odd' => floatval($bet['odd'])
            ],
            'stake' => floatval($bet['stake']),
            'potentialWin' => floatval($bet['potential_win']),
            'winAmount' => $bet['win_amount'] ? floatval($bet['win_amount']) : null,
            'createdAt' => $bet['created_at'],
            'settledAt' => $bet['settled_at'],
            'cancelledAt' => $bet['cancelled_at'],
            'adminNotes' => $bet['admin_notes']
        ]
    ]);
}

sendJSON(['error' => 'Invalid request'], 400);
