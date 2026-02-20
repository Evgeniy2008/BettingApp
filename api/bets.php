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
    
    // Проверка баланса
    if ($user['balance'] < $stake) {
        sendJSON(['error' => 'Insufficient balance'], 400);
    }
    
    $db = getDB();
    
    try {
        $db->beginTransaction();
        
        // Вычисляем общий коэффициент для экспресса
        $totalOdds = 1;
        $validSlipItems = [];
        foreach ($data['slip'] as $slipItem) {
            if (empty($slipItem['matchId']) || empty($slipItem['outcomeKey']) || empty($slipItem['odd'])) {
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
        
        // Определяем тип исхода (для экспресса используем тип первого)
        $outcomeType = null;
        if (in_array($firstItem['outcomeKey'], ['1', 'X', '2'])) {
            $outcomeType = '1x2';
        } elseif (strpos($firstItem['outcomeKey'], 'total') !== false) {
            $outcomeType = 'total';
        } elseif (strpos($firstItem['outcomeKey'], 'fora') !== false) {
            $outcomeType = 'fora';
        }
        
        // Формируем label для экспресса
        $outcomeLabel = $firstItem['label'] ?? $firstItem['outcomeKey'];
        if ($isExpress) {
            $outcomeLabel = 'Express (' . count($validSlipItems) . ' outcomes)';
        }
        
        // Сохраняем детали всех исходов в JSON
        $betDetails = json_encode($validSlipItems, JSON_UNESCAPED_UNICODE);
        
        // Вставляем ставку
        $stmt = $db->prepare("
            INSERT INTO bets (
                bet_id, user_id, match_id, line_id,
                match_home, match_away, match_league,
                outcome_key, outcome_label, outcome_type, outcome_value,
                odd, stake, potential_win, status, bet_details
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        ");
        
        $stmt->execute([
            $betIdValue,
            $user['id'],
            $firstItem['matchId'] ?? '',
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
            $betDetails
        ]);
        
        $createdBets = [
            [
                'id' => $betIdValue,
                'bet_db_id' => $db->lastInsertId(),
                'isExpress' => $isExpress,
                'outcomesCount' => count($validSlipItems)
            ]
        ];
        
        // Обновляем баланс пользователя
        $newBalance = $user['balance'] - $stake;
        $updateStmt = $db->prepare("
            UPDATE users 
            SET balance = ?, total_staked = total_staked + ?
            WHERE id = ?
        ");
        $updateStmt->execute([$newBalance, $stake, $user['id']]);
        
        $db->commit();
        
        sendJSON([
            'success' => true,
            'bets' => $createdBets,
            'stake' => $stake,
            'totalOdds' => $totalOdds,
            'potentialWin' => $stake * $totalOdds,
            'newBalance' => $newBalance
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
