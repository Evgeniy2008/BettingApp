<?php
require_once 'config.php';

// API-Sports configuration
define('API_SPORTS_BASE_URL', 'https://v3.football.api-sports.io');
define('API_SPORTS_KEY', 'e0159591de2cf3d1b077fc4af39fbfef');

/**
 * Makes a request to API-Sports
 */
function apiSportsRequest($endpoint, $params = []) {
    $url = API_SPORTS_BASE_URL . $endpoint;
    if (!empty($params)) {
        $url .= '?' . http_build_query($params);
    }
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'x-apisports-key: ' . API_SPORTS_KEY,
        'x-rapidapi-key: ' . API_SPORTS_KEY,
        'Accept: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        throw new Exception('API request failed: ' . $error);
    }
    
    if ($httpCode !== 200) {
        $errorData = json_decode($response, true);
        $errorMsg = isset($errorData['errors']) ? json_encode($errorData['errors']) : 'HTTP ' . $httpCode;
        throw new Exception('API returned HTTP ' . $httpCode . ': ' . $errorMsg);
    }
    
    $data = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Invalid JSON response: ' . json_last_error_msg());
    }
    
    if (isset($data['errors']) && !empty($data['errors'])) {
        throw new Exception('API errors: ' . json_encode($data['errors']));
    }
    
    return $data;
}

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

/**
 * Calculates bet result based on match fixture data
 */
function calculateBetResult($bet, $fixture) {
    if (!$fixture || !isset($fixture['fixture']) || !isset($fixture['fixture']['status'])) {
        return null; // Match data not available
    }
    
    $status = trim($fixture['fixture']['status']['long'] ?? '');
    $statusShort = trim($fixture['fixture']['status']['short'] ?? '');
    
    // Check if match is finished (either long OR short status indicates finished)
    // Match is finished if status.long === 'Match Finished' OR status.short === 'FT'
    // Also check for case-insensitive match and other possible finished statuses
    $isFinished = (
        strcasecmp($status, 'Match Finished') === 0 || 
        strcasecmp($statusShort, 'FT') === 0 ||
        strcasecmp($statusShort, 'FIN') === 0 ||
        stripos($status, 'Finished') !== false
    );
    if (!$isFinished) {
        return null; // Match not finished yet
    }
    
    // Get scores - try different possible structures from API
    $homeScore = intval($fixture['goals']['home'] ?? $fixture['score']['fulltime']['home'] ?? 0);
    $awayScore = intval($fixture['goals']['away'] ?? $fixture['score']['fulltime']['away'] ?? 0);
    $halftimeHome = intval($fixture['score']['halftime']['home'] ?? 0);
    $halftimeAway = intval($fixture['score']['halftime']['away'] ?? 0);
    
    $outcomeKey = $bet['outcome_key'];
    $outcomeType = $bet['outcome_type'] ?? '';
    $outcomeValue = $bet['outcome_value'] ?? null;
    $betDetails = !empty($bet['bet_details']) ? json_decode($bet['bet_details'], true) : null;
    
    // For express bets, check all outcomes
    if ($betDetails && is_array($betDetails) && count($betDetails) > 1) {
        $allWon = true;
        $allFinished = true;
        
        foreach ($betDetails as $item) {
            $itemFixtureId = $item['fixtureId'] ?? $item['matchId'] ?? null;
            if (!$itemFixtureId) {
                $allWon = false;
                $allFinished = false;
                continue;
            }
            
            // Get fixture for this item
            try {
                $itemFixtureData = apiSportsRequest('/fixtures', ['id' => $itemFixtureId]);
                if (!isset($itemFixtureData['response']) || empty($itemFixtureData['response'])) {
                    $allWon = false;
                    $allFinished = false;
                    continue;
                }
                $itemFixture = $itemFixtureData['response'][0];
                
                $itemStatus = trim($itemFixture['fixture']['status']['long'] ?? '');
                $itemStatusShort = trim($itemFixture['fixture']['status']['short'] ?? '');
                
                // Check if match is finished (either long OR short status indicates finished)
                // Also check for case-insensitive match and other possible finished statuses
                $itemIsFinished = (
                    strcasecmp($itemStatus, 'Match Finished') === 0 || 
                    strcasecmp($itemStatusShort, 'FT') === 0 ||
                    strcasecmp($itemStatusShort, 'FIN') === 0 ||
                    stripos($itemStatus, 'Finished') !== false
                );
                if (!$itemIsFinished) {
                    $allFinished = false;
                    return null; // Not all matches finished yet
                }
                
                $itemResult = calculateSingleOutcome($item, $itemFixture);
                if ($itemResult !== 'won') {
                    $allWon = false;
                }
            } catch (Exception $e) {
                error_log('Error checking express bet item: ' . $e->getMessage());
                $allWon = false;
                $allFinished = false;
            }
        }
        
        // Only return result if all matches are finished
        if ($allFinished) {
            return $allWon ? 'won' : 'lost';
        }
        
        return null; // Not all finished
    }
    
    // Single bet calculation
    return calculateSingleOutcome($bet, $fixture);
}

/**
 * Calculates result for a single outcome
 */
function calculateSingleOutcome($outcome, $fixture) {
    // Get scores - try different possible structures from API
    $homeScore = intval($fixture['goals']['home'] ?? $fixture['score']['fulltime']['home'] ?? 0);
    $awayScore = intval($fixture['goals']['away'] ?? $fixture['score']['fulltime']['away'] ?? 0);
    $halftimeHome = intval($fixture['score']['halftime']['home'] ?? 0);
    $halftimeAway = intval($fixture['score']['halftime']['away'] ?? 0);
    
    $outcomeKey = $outcome['outcome_key'] ?? $outcome['outcomeKey'] ?? '';
    $outcomeType = $outcome['outcome_type'] ?? $outcome['type'] ?? '';
    $outcomeValue = $outcome['outcome_value'] ?? $outcome['value'] ?? null;
    $betName = $outcome['betName'] ?? '';
    $value = $outcome['value'] ?? $outcomeValue;
    
    error_log("[CalculateSingleOutcome] outcome_key: '{$outcomeKey}', outcome_type: '{$outcomeType}', betName: '{$betName}', value: " . json_encode($value) . ", scores: {$homeScore}-{$awayScore}");
    
    // Extract value from api_ format if present (e.g., "api_1_1_Home" -> check last part "Home")
    $outcomeKeyClean = $outcomeKey;
    if (strpos($outcomeKey, 'api_') === 0) {
        $parts = explode('_', $outcomeKey);
        if (count($parts) >= 4) {
            $lastPart = $parts[count($parts) - 1]; // Get last part (e.g., "Home", "Away", "Draw")
            // Also check if it's a number (1, 2) or letter (X)
            if (in_array($lastPart, ['1', '2', 'X', 'Home', 'Away', 'Draw'])) {
                $outcomeKeyClean = $lastPart;
            }
        }
    }
    
    // Match Winner (1X2) - bet ID 1
    if ($outcomeKey === '1' || $outcomeKey === 'X' || $outcomeKey === '2' || 
        $outcomeKeyClean === '1' || $outcomeKeyClean === 'X' || $outcomeKeyClean === '2' ||
        $outcomeKeyClean === 'Home' || $outcomeKeyClean === 'Away' || $outcomeKeyClean === 'Draw' ||
        $outcomeType === '1x2' || $betName === 'Match Winner') {
        if ($outcomeKey === '1' || $outcomeKeyClean === '1' || $outcomeKeyClean === 'Home' || 
            (isset($outcome['value']) && ($outcome['value'] === 'Home' || $outcome['value'] === '1'))) {
            return ($homeScore > $awayScore) ? 'won' : 'lost';
        } elseif ($outcomeKey === 'X' || $outcomeKeyClean === 'X' || $outcomeKeyClean === 'Draw' || 
                  (isset($outcome['value']) && $outcome['value'] === 'Draw')) {
            return ($homeScore === $awayScore) ? 'won' : 'lost';
        } elseif ($outcomeKey === '2' || $outcomeKeyClean === '2' || $outcomeKeyClean === 'Away' || 
                  (isset($outcome['value']) && ($outcome['value'] === 'Away' || $outcome['value'] === '2'))) {
            return ($awayScore > $homeScore) ? 'won' : 'lost';
        }
    }
    
    // Home/Away - bet ID 2
    if ($betName === 'Home/Away') {
        if (isset($outcome['value'])) {
            if ($outcome['value'] === 'Home') {
                return ($homeScore > $awayScore) ? 'won' : 'lost';
            } elseif ($outcome['value'] === 'Away') {
                return ($awayScore > $homeScore) ? 'won' : 'lost';
            }
        }
    }
    
    // Asian Handicap - bet ID 4
    if ($outcomeType === 'fora' || $betName === 'Asian Handicap') {
        if ($value) {
            // Parse handicap value (e.g., "Home +0.5", "Away -1", etc.)
            $handicapValue = null;
            $isHome = false;
            
            if (isset($outcome['value'])) {
                $valueStr = $outcome['value'];
                if (stripos($valueStr, 'Home') !== false) {
                    $isHome = true;
                    preg_match('/([+-]?\d+\.?\d*)/', $valueStr, $matches);
                    $handicapValue = isset($matches[1]) ? floatval($matches[1]) : null;
                } elseif (stripos($valueStr, 'Away') !== false) {
                    $isHome = false;
                    preg_match('/([+-]?\d+\.?\d*)/', $valueStr, $matches);
                    $handicapValue = isset($matches[1]) ? floatval($matches[1]) : null;
                } else {
                    // Try to parse from value directly
                    preg_match('/([+-]?\d+\.?\d*)/', $valueStr, $matches);
                    $handicapValue = isset($matches[1]) ? floatval($matches[1]) : null;
                    // Check outcome_key for home/away
                    if (strpos($outcomeKey, 'fora_one') !== false || strpos($outcomeKey, '1') !== false) {
                        $isHome = true;
                    }
                }
            } else {
                // Try to parse from outcome_key
                if (strpos($outcomeKey, 'fora_one') !== false) {
                    $isHome = true;
                }
                preg_match('/([+-]?\d+\.?\d*)/', $outcomeKey . ' ' . ($value ?? ''), $matches);
                $handicapValue = isset($matches[1]) ? floatval($matches[1]) : null;
            }
            
            if ($handicapValue !== null) {
                $homeWithHandicap = $homeScore + ($isHome ? $handicapValue : -$handicapValue);
                $awayWithHandicap = $awayScore + ($isHome ? -$handicapValue : $handicapValue);
                
                if ($isHome) {
                    return ($homeWithHandicap > $awayWithHandicap) ? 'won' : 'lost';
                } else {
                    return ($awayWithHandicap > $homeWithHandicap) ? 'won' : 'lost';
                }
            }
        }
    }
    
    // Goals Over/Under - bet ID 5
    if ($outcomeType === 'total' || $betName === 'Goals Over/Under') {
        if ($value) {
            $totalValue = floatval($value);
            $totalGoals = $homeScore + $awayScore;
            
            if (isset($outcome['value'])) {
                $valueStr = $outcome['value'];
                if (stripos($valueStr, 'Over') !== false || stripos($outcomeKey, 'total_over') !== false) {
                    return ($totalGoals > $totalValue) ? 'won' : 'lost';
                } elseif (stripos($valueStr, 'Under') !== false || stripos($outcomeKey, 'total_under') !== false) {
                    return ($totalGoals < $totalValue) ? 'won' : 'lost';
                }
            } else {
                // Check outcome_key
                if (stripos($outcomeKey, 'total_over') !== false) {
                    return ($totalGoals > $totalValue) ? 'won' : 'lost';
                } elseif (stripos($outcomeKey, 'total_under') !== false) {
                    return ($totalGoals < $totalValue) ? 'won' : 'lost';
                }
            }
        }
    }
    
    // HT/FT Double - bet ID 7
    if ($betName === 'HT/FT Double') {
        if (isset($outcome['value'])) {
            $htFt = $outcome['value']; // e.g., "Home/Home", "Draw/Away"
            $parts = explode('/', $htFt);
            if (count($parts) === 2) {
                $htResult = $parts[0]; // Home, Draw, Away
                $ftResult = $parts[1];
                
                // Check halftime result
                $htHomeWins = ($halftimeHome > $halftimeAway);
                $htDraw = ($halftimeHome === $halftimeAway);
                $htAwayWins = ($halftimeAway > $halftimeHome);
                
                // Check fulltime result
                $ftHomeWins = ($homeScore > $awayScore);
                $ftDraw = ($homeScore === $awayScore);
                $ftAwayWins = ($awayScore > $homeScore);
                
                $htCorrect = false;
                $ftCorrect = false;
                
                if ($htResult === 'Home' && $htHomeWins) $htCorrect = true;
                elseif ($htResult === 'Draw' && $htDraw) $htCorrect = true;
                elseif ($htResult === 'Away' && $htAwayWins) $htCorrect = true;
                
                if ($ftResult === 'Home' && $ftHomeWins) $ftCorrect = true;
                elseif ($ftResult === 'Draw' && $ftDraw) $ftCorrect = true;
                elseif ($ftResult === 'Away' && $ftAwayWins) $ftCorrect = true;
                
                return ($htCorrect && $ftCorrect) ? 'won' : 'lost';
            }
        }
    }
    
    // Exact Score - bet ID 10
    if ($betName === 'Exact Score') {
        if (isset($outcome['value'])) {
            $scoreStr = $outcome['value']; // e.g., "2:1"
            $parts = explode(':', $scoreStr);
            if (count($parts) === 2) {
                $expectedHome = intval($parts[0]);
                $expectedAway = intval($parts[1]);
                return (($homeScore === $expectedHome) && ($awayScore === $expectedAway)) ? 'won' : 'lost';
            }
        }
    }
    
    // Both Teams To Score (BTTS) - bet ID 8
    if ($betName === 'Both Teams To Score' || $outcomeType === 'btts') {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $bothScored = ($homeScore > 0 && $awayScore > 0);
            if (stripos($valueStr, 'Yes') !== false) {
                return $bothScored ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'No') !== false) {
                return !$bothScored ? 'won' : 'lost';
            }
        }
    }
    
    // Double Chance - bet ID 12
    if ($betName === 'Double Chance' || $outcomeType === 'double_chance') {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $homeWins = ($homeScore > $awayScore);
            $draw = ($homeScore === $awayScore);
            $awayWins = ($awayScore > $homeScore);
            
            if (stripos($valueStr, '1X') !== false || stripos($valueStr, 'Home or Draw') !== false) {
                return ($homeWins || $draw) ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'X2') !== false || stripos($valueStr, 'Away or Draw') !== false) {
                return ($awayWins || $draw) ? 'won' : 'lost';
            } elseif (stripos($valueStr, '12') !== false || stripos($valueStr, 'Home or Away') !== false) {
                return ($homeWins || $awayWins) ? 'won' : 'lost';
            }
        }
    }
    
    error_log("[CalculateSingleOutcome] Unknown bet type - outcome_key: '{$outcomeKey}', outcome_type: '{$outcomeType}', betName: '{$betName}', value: " . json_encode($value));
    return null; // Unknown bet type
}

/**
 * Settles all pending/active bets for a user
 */
function settleUserBets($userId = null) {
    $db = getDB();
    
    // Initialize debug info
    $GLOBALS['settle_debug_info'] = [];
    
    // Get all active/pending bets
    $query = "SELECT * FROM bets WHERE status IN ('pending', 'active')";
    $params = [];
    
    if ($userId) {
        $query .= " AND user_id = ?";
        $params[] = $userId;
    }
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $bets = $stmt->fetchAll();
    
    error_log("[SettleBets] Found " . count($bets) . " active/pending bets" . ($userId ? " for user {$userId}" : ""));
    
    $settled = 0;
    $errors = [];
    
    foreach ($bets as $bet) {
        try {
            // Use fixture_id if available, otherwise match_id
            $fixtureId = !empty($bet['fixture_id']) ? $bet['fixture_id'] : $bet['match_id'];
            if (empty($fixtureId)) {
                error_log("[SettleBets] Bet ID: {$bet['bet_id']} - No fixture_id or match_id found");
                // Add to debug info
                if (!isset($GLOBALS['settle_debug_info'])) {
                    $GLOBALS['settle_debug_info'] = [];
                }
                $GLOBALS['settle_debug_info'][] = [
                    'bet_id' => $bet['bet_id'],
                    'fixture_id' => null,
                    'status_long' => null,
                    'status_short' => null,
                    'error' => 'No fixture_id or match_id found',
                    'is_finished' => false
                ];
                continue;
            }
            
            // Get fixture data
            try {
                $fixtureData = apiSportsRequest('/fixtures', ['id' => $fixtureId]);
            } catch (Exception $e) {
                error_log("[SettleBets] Bet ID: {$bet['bet_id']}, Fixture ID: {$fixtureId} - API Error: " . $e->getMessage());
                $errors[] = "Bet {$bet['bet_id']}: API Error - " . $e->getMessage();
                continue;
            }
            
            if (!isset($fixtureData['response']) || empty($fixtureData['response'])) {
                error_log("[SettleBets] Bet ID: {$bet['bet_id']}, Fixture ID: {$fixtureId} - Match not found in API response");
                continue; // Match not found
            }
            
            $fixture = $fixtureData['response'][0];
            $status = trim($fixture['fixture']['status']['long'] ?? '');
            $statusShort = trim($fixture['fixture']['status']['short'] ?? '');
            
            // Debug logging - also include in response for frontend console
            $statusInfo = [
                'bet_id' => $bet['bet_id'],
                'fixture_id' => $fixtureId,
                'status_long' => $status,
                'status_short' => $statusShort,
                'raw_status' => $fixture['fixture']['status'] ?? null,
                'is_finished' => false
            ];
            error_log("[SettleBets] Bet ID: {$bet['bet_id']}, Fixture ID: {$fixtureId}, Status long: '{$status}', Status short: '{$statusShort}'");
            
            // Check if match is finished (either long OR short status indicates finished)
            // Match is finished if status.long === 'Match Finished' OR status.short === 'FT'
            // Also check for case-insensitive match and other possible finished statuses
            $isFinished = (
                strcasecmp($status, 'Match Finished') === 0 || 
                strcasecmp($statusShort, 'FT') === 0 ||
                strcasecmp($statusShort, 'FIN') === 0 ||
                stripos($status, 'Finished') !== false
            );
            
            $statusInfo['is_finished'] = $isFinished;
            
            // Always add to debug info for frontend console
            if (!isset($GLOBALS['settle_debug_info'])) {
                $GLOBALS['settle_debug_info'] = [];
            }
            $GLOBALS['settle_debug_info'][] = $statusInfo;
            
            if (!$isFinished) {
                error_log("[SettleBets] Bet ID: {$bet['bet_id']} - Match not finished yet (status: '{$status}' / '{$statusShort}')");
                continue; // Match not finished
            }
            
            error_log("[SettleBets] Bet ID: {$bet['bet_id']} - Match is finished, calculating result...");
            error_log("[SettleBets] Bet data: outcome_key='{$bet['outcome_key']}', outcome_type='" . ($bet['outcome_type'] ?? 'null') . "', outcome_value='" . ($bet['outcome_value'] ?? 'null') . "'");
            
            // Add bet data to debug info
            $statusInfo['bet_data'] = [
                'outcome_key' => $bet['outcome_key'] ?? null,
                'outcome_type' => $bet['outcome_type'] ?? null,
                'outcome_value' => $bet['outcome_value'] ?? null,
                'outcome_label' => $bet['outcome_label'] ?? null
            ];
            
            // Update debug info in array before calculation
            $lastIndex = count($GLOBALS['settle_debug_info']) - 1;
            if ($lastIndex >= 0) {
                $GLOBALS['settle_debug_info'][$lastIndex] = $statusInfo;
            }
            
            // Calculate bet result
            $result = calculateBetResult($bet, $fixture);
            
            // Update debug info with calculation result
            $statusInfo['calculation_result'] = $result;
            $statusInfo['calculation_error'] = null;
            
            if ($result === null) {
                $errorMsg = "Could not calculate result - unknown bet type or missing data";
                error_log("[SettleBets] Bet ID: {$bet['bet_id']} - {$errorMsg}");
                $statusInfo['calculation_error'] = $errorMsg;
                // Update the debug info in array
                $lastIndex = count($GLOBALS['settle_debug_info']) - 1;
                if ($lastIndex >= 0) {
                    $GLOBALS['settle_debug_info'][$lastIndex] = $statusInfo;
                }
                continue; // Could not calculate
            }
            
            error_log("[SettleBets] Bet ID: {$bet['bet_id']} - Result: {$result}");
            
            // Update debug info with final result
            $statusInfo['calculation_result'] = $result;
            $lastIndex = count($GLOBALS['settle_debug_info']) - 1;
            if ($lastIndex >= 0) {
                $GLOBALS['settle_debug_info'][$lastIndex] = $statusInfo;
            }
            
            // Update bet status
            $updateStmt = $db->prepare("
                UPDATE bets 
                SET status = ?, 
                    settled_at = NOW(),
                    win_amount = CASE WHEN ? = 'won' THEN potential_win ELSE NULL END
                WHERE id = ?
            ");
            
            error_log("[SettleBets] Bet ID: {$bet['bet_id']} - Updating DB with result: '{$result}', bet DB id: {$bet['id']}");
            
            $updateStmt->execute([$result, $result, $bet['id']]);
            
            // Verify update was successful
            $rowsAffected = $updateStmt->rowCount();
            if ($rowsAffected === 0) {
                $errorMsg = "No rows updated in database";
                error_log("[SettleBets] WARNING: Bet ID: {$bet['bet_id']} (DB id: {$bet['id']}) - {$errorMsg}!");
                $statusInfo['update_error'] = $errorMsg;
                $lastIndex = count($GLOBALS['settle_debug_info']) - 1;
                if ($lastIndex >= 0) {
                    $GLOBALS['settle_debug_info'][$lastIndex] = $statusInfo;
                }
                $errors[] = "Bet {$bet['bet_id']}: Failed to update status";
                continue;
            }
            
            error_log("[SettleBets] Bet ID: {$bet['bet_id']} - Status updated successfully to '{$result}' (rows affected: {$rowsAffected})");
            
            // Update user balance if won
            if ($result === 'won') {
                $winAmount = floatval($bet['potential_win']);
                $updateBalanceStmt = $db->prepare("
                    UPDATE users 
                    SET balance = balance + ?
                    WHERE id = ?
                ");
                $updateBalanceStmt->execute([$winAmount, $bet['user_id']]);
                error_log("[SettleBets] Bet ID: {$bet['bet_id']} - User balance updated by +{$winAmount}");
            }
            
            $settled++;
        } catch (Exception $e) {
            $errorMsg = $e->getMessage();
            error_log("[SettleBets] ERROR for Bet ID: {$bet['bet_id']} - " . $errorMsg);
            $errors[] = "Bet {$bet['bet_id']}: " . $errorMsg;
        }
    }
    
    error_log("[SettleBets] Completed: {$settled} bets settled, " . count($errors) . " errors");
    
    $debugInfo = $GLOBALS['settle_debug_info'] ?? [];
    
    return [
        'settled' => $settled,
        'errors' => $errors,
        'debug' => $debugInfo
    ];
}

// Handle request
try {
    $user = checkUserAuth();
    
    error_log("[SettleBets] Request from user ID: {$user['id']}");
    
    $result = settleUserBets($user['id']);
    
    error_log("[SettleBets] Response: {$result['settled']} settled, " . count($result['errors']) . " errors");
    
    sendJSON([
        'success' => true,
        'settled' => $result['settled'],
        'errors' => $result['errors'],
        'debug' => $result['debug'] ?? []
    ]);
    
} catch (Exception $e) {
    error_log("[SettleBets] Fatal error: " . $e->getMessage());
    http_response_code(500);
    sendJSON([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
