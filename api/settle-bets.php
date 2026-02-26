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

function normalizeStatKey($key) {
    $key = strtolower(trim((string)$key));
    $key = preg_replace('/\s+/', ' ', $key);
    return $key;
}

function normalizeStatValue($value) {
    if ($value === null) {
        return 0;
    }
    if (is_string($value)) {
        $value = str_replace('%', '', $value);
        $value = trim($value);
        if ($value === '') {
            return 0;
        }
    }
    if (is_numeric($value)) {
        return floatval($value);
    }
    return 0;
}

function buildStatsMap($statsResponse, $homeTeamId, $awayTeamId) {
    $stats = [
        'home' => [],
        'away' => []
    ];

    if (!is_array($statsResponse)) {
        return $stats;
    }

    foreach ($statsResponse as $teamStats) {
        $teamId = $teamStats['team']['id'] ?? null;
        $side = ($teamId && $teamId == $homeTeamId) ? 'home' : 'away';

        if (!isset($teamStats['statistics']) || !is_array($teamStats['statistics'])) {
            continue;
        }

        foreach ($teamStats['statistics'] as $stat) {
            $type = $stat['type'] ?? '';
            $value = $stat['value'] ?? null;
            $stats[$side][normalizeStatKey($type)] = normalizeStatValue($value);
        }
    }

    return $stats;
}

function getStatValue($stats, $side, $aliases = []) {
    if (!$stats || !isset($stats[$side])) {
        return null;
    }
    foreach ($aliases as $alias) {
        $key = normalizeStatKey($alias);
        if (array_key_exists($key, $stats[$side])) {
            return $stats[$side][$key];
        }
    }
    return null;
}

function getFixtureContext($fixtureId) {
    static $cache = [];
    if (isset($cache[$fixtureId])) {
        return $cache[$fixtureId];
    }

    $context = [
        'fixture' => null,
        'events' => [],
        'stats' => [
            'home' => [],
            'away' => []
        ]
    ];

    try {
        $fixtureData = apiSportsRequest('/fixtures', ['id' => $fixtureId]);
        if (isset($fixtureData['response'][0])) {
            $context['fixture'] = $fixtureData['response'][0];
        }
    } catch (Exception $e) {
        $cache[$fixtureId] = $context;
        return $context;
    }

    try {
        $eventsData = apiSportsRequest('/fixtures/events', ['fixture' => $fixtureId]);
        if (isset($eventsData['response']) && is_array($eventsData['response'])) {
            $context['events'] = $eventsData['response'];
        }
    } catch (Exception $e) {
        $context['events'] = [];
    }

    try {
        $statsData = apiSportsRequest('/fixtures/statistics', ['fixture' => $fixtureId]);
        if (isset($statsData['response']) && is_array($statsData['response']) && $context['fixture']) {
            $homeTeamId = $context['fixture']['teams']['home']['id'] ?? null;
            $awayTeamId = $context['fixture']['teams']['away']['id'] ?? null;
            $context['stats'] = buildStatsMap($statsData['response'], $homeTeamId, $awayTeamId);
        }
    } catch (Exception $e) {
        $context['stats'] = [
            'home' => [],
            'away' => []
        ];
    }

    $cache[$fixtureId] = $context;
    return $context;
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
function calculateBetResult($bet, $fixture, $context = null) {
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
        $anyRefunded = false;
        
        foreach ($betDetails as $item) {
            $itemFixtureId = $item['fixtureId'] ?? $item['matchId'] ?? null;
            if (!$itemFixtureId) {
                $allWon = false;
                $allFinished = false;
                continue;
            }
            
            // Get fixture for this item
            try {
                $itemContext = getFixtureContext($itemFixtureId);
                if (!isset($itemContext['fixture']) || empty($itemContext['fixture'])) {
                    $allWon = false;
                    $allFinished = false;
                    continue;
                }
                $itemFixture = $itemContext['fixture'];
                
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
                
                $itemResult = calculateSingleOutcome($item, $itemFixture, $itemContext);
                if ($itemResult === null) {
                    $allWon = false;
                    $allFinished = false;
                    continue;
                }
                if ($itemResult === 'refunded') {
                    $anyRefunded = true;
                }
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
            if ($allWon && $anyRefunded) {
                return 'refunded';
            }
            return $allWon ? 'won' : 'lost';
        }
        
        return null; // Not all finished
    }
    
    // Single bet calculation
    return calculateSingleOutcome($bet, $fixture, $context);
}

/**
 * Calculates result for a single outcome
 */
function calculateSingleOutcome($outcome, $fixture, $context = null) {
    // Get scores - try different possible structures from API
    $homeScore = intval($fixture['goals']['home'] ?? $fixture['score']['fulltime']['home'] ?? 0);
    $awayScore = intval($fixture['goals']['away'] ?? $fixture['score']['fulltime']['away'] ?? 0);
    $halftimeHome = intval($fixture['score']['halftime']['home'] ?? 0);
    $halftimeAway = intval($fixture['score']['halftime']['away'] ?? 0);
    
    $events = $context['events'] ?? ($fixture['events'] ?? []);
    $stats = $context['stats'] ?? null;

    $outcomeKey = $outcome['outcome_key'] ?? $outcome['outcomeKey'] ?? '';
    $outcomeType = $outcome['outcome_type'] ?? $outcome['type'] ?? '';
    $outcomeValue = $outcome['outcome_value'] ?? $outcome['value'] ?? null;
    $betName = $outcome['betName'] ?? '';
    if (empty($betName) && !empty($outcomeType)) {
        $betName = $outcomeType;
    }
    $betNameLower = strtolower($betName);
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
        $outcomeType === '1x2' || stripos($betNameLower, 'match winner') !== false || stripos($betNameLower, 'full time result') !== false || stripos($betNameLower, '1x2') !== false) {
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
    if (stripos($betNameLower, 'home/away') !== false) {
        if (isset($outcome['value'])) {
            if ($outcome['value'] === 'Home') {
                return ($homeScore > $awayScore) ? 'won' : 'lost';
            } elseif ($outcome['value'] === 'Away') {
                return ($awayScore > $homeScore) ? 'won' : 'lost';
            }
        }
    }
    
    // Second Half Winner - bet ID 3
    if (stripos($betNameLower, 'second half winner') !== false) {
        if (isset($outcome['value'])) {
            // Second half score = fulltime - halftime
            $secondHalfHome = $homeScore - $halftimeHome;
            $secondHalfAway = $awayScore - $halftimeAway;
            
            if ($outcome['value'] === 'Home') {
                return ($secondHalfHome > $secondHalfAway) ? 'won' : 'lost';
            } elseif ($outcome['value'] === 'Draw') {
                return ($secondHalfHome === $secondHalfAway) ? 'won' : 'lost';
            } elseif ($outcome['value'] === 'Away') {
                return ($secondHalfAway > $secondHalfHome) ? 'won' : 'lost';
            }
        }
    }
    
    // Asian Handicap - bet ID 4 (Full Match / First Half)
    if ($outcomeType === 'fora' || stripos($betNameLower, 'asian handicap') !== false) {
        if ($value) {
            $valueStr = $outcome['value'] ?? $value;
            $side = null;
            if (stripos($valueStr, 'Home') !== false) {
                $side = 'home';
            } elseif (stripos($valueStr, 'Away') !== false) {
                $side = 'away';
            }
            preg_match('/([+-]?\d+\.?\d*)/', $valueStr, $matches);
            $handicapValue = isset($matches[1]) ? floatval($matches[1]) : null;
            
            if ($handicapValue !== null && $side) {
                $isFirstHalfHandicap = stripos($betNameLower, 'first half') !== false;
                $useHomeScore = $isFirstHalfHandicap ? $halftimeHome : $homeScore;
                $useAwayScore = $isFirstHalfHandicap ? $halftimeAway : $awayScore;
                $homeAdj = $useHomeScore + ($side === 'home' ? $handicapValue : 0);
                $awayAdj = $useAwayScore + ($side === 'away' ? $handicapValue : 0);
                
                if ($homeAdj === $awayAdj) {
                    return 'refunded';
                }
                if ($side === 'home') {
                    return ($homeAdj > $awayAdj) ? 'won' : 'lost';
                }
                return ($awayAdj > $homeAdj) ? 'won' : 'lost';
            }
        }
    }
    
    // Goals Over/Under - bet ID 5 (Full Match)
    if ($outcomeType === 'total' || ($betNameLower !== '' && (stripos($betNameLower, 'over/under') !== false || stripos($betNameLower, 'match goals') !== false || stripos($betNameLower, 'over/under line') !== false) && stripos($betNameLower, 'first half') === false && stripos($betNameLower, 'second half') === false && stripos($betNameLower, 'home team') === false && stripos($betNameLower, 'away team') === false)) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            // Parse value from "Over 1.5" or "Under 2.5" format
            preg_match('/(\d+\.?\d*)/', $valueStr, $matches);
            $totalValue = isset($matches[1]) ? floatval($matches[1]) : floatval($value);
            $totalGoals = $homeScore + $awayScore;
            
            if (stripos($valueStr, 'Over') !== false || stripos($outcomeKey, 'total_over') !== false) {
                return ($totalGoals > $totalValue) ? 'won' : (($totalGoals == $totalValue) ? 'refunded' : 'lost');
            } elseif (stripos($valueStr, 'Under') !== false || stripos($outcomeKey, 'total_under') !== false) {
                return ($totalGoals < $totalValue) ? 'won' : (($totalGoals == $totalValue) ? 'refunded' : 'lost');
            }
        } elseif ($value) {
            // Fallback if value is just a number
            $totalValue = floatval($value);
            $totalGoals = $homeScore + $awayScore;
            
            // Check outcome_key
            if (stripos($outcomeKey, 'total_over') !== false) {
                return ($totalGoals > $totalValue) ? 'won' : (($totalGoals == $totalValue) ? 'refunded' : 'lost');
            } elseif (stripos($outcomeKey, 'total_under') !== false) {
                return ($totalGoals < $totalValue) ? 'won' : (($totalGoals == $totalValue) ? 'refunded' : 'lost');
            }
        }
    }
    
    // Goals Over/Under First Half - bet ID 6
    if ($betName === 'Goals Over/Under First Half' || $betName === 'Goals Over/Under - First Half' || ($betNameLower !== '' && stripos($betNameLower, 'over/under') !== false && stripos($betNameLower, 'first half') !== false)) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            // Parse value from "Over 1.5" or "Under 2.5" format
            preg_match('/(\d+\.?\d*)/', $valueStr, $matches);
            $totalValue = isset($matches[1]) ? floatval($matches[1]) : floatval($value);
            $totalGoals = $halftimeHome + $halftimeAway;
            
            if (stripos($valueStr, 'Over') !== false) {
                return ($totalGoals > $totalValue) ? 'won' : (($totalGoals == $totalValue) ? 'refunded' : 'lost');
            } elseif (stripos($valueStr, 'Under') !== false) {
                return ($totalGoals < $totalValue) ? 'won' : (($totalGoals == $totalValue) ? 'refunded' : 'lost');
            }
        }
    }
    
    // Goals Over/Under Second Half - bet ID 26
    if ($betName === 'Goals Over/Under - Second Half' || $betName === 'Goals Over/Under Second Half' || ($betNameLower !== '' && stripos($betNameLower, 'over/under') !== false && stripos($betNameLower, 'second half') !== false)) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            // Parse value from "Over 1.5" or "Under 2.5" format
            preg_match('/(\d+\.?\d*)/', $valueStr, $matches);
            $totalValue = isset($matches[1]) ? floatval($matches[1]) : floatval($value);
            // Second half goals = fulltime - halftime
            $secondHalfGoals = ($homeScore + $awayScore) - ($halftimeHome + $halftimeAway);
            
            if (stripos($valueStr, 'Over') !== false) {
                return ($secondHalfGoals > $totalValue) ? 'won' : (($secondHalfGoals == $totalValue) ? 'refunded' : 'lost');
            } elseif (stripos($valueStr, 'Under') !== false) {
                return ($secondHalfGoals < $totalValue) ? 'won' : (($secondHalfGoals == $totalValue) ? 'refunded' : 'lost');
            }
        }
    }
    
    // HT/FT Double - bet ID 7
    if (stripos($betNameLower, 'ht/ft') !== false) {
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
    
    // Exact Score / Final Score - bet ID 10
    if ((stripos($betNameLower, 'exact score') !== false || stripos($betNameLower, 'correct score') !== false || stripos($betNameLower, 'final score') !== false) && stripos($betNameLower, 'first half') === false && stripos($betNameLower, 'second half') === false) {
        if (isset($outcome['value'])) {
            $scoreStr = $outcome['value']; // e.g., "2:1"
            $parts = preg_split('/[:\-]/', $scoreStr);
            if (count($parts) === 2) {
                $expectedHome = intval($parts[0]);
                $expectedAway = intval($parts[1]);
                return (($homeScore === $expectedHome) && ($awayScore === $expectedAway)) ? 'won' : 'lost';
            }
        }
    }
    
    // Both Teams To Score (BTTS) - bet ID 8
    if ((stripos($betNameLower, 'both teams') !== false && stripos($betNameLower, 'score') !== false && stripos($betNameLower, 'first half') === false && stripos($betNameLower, 'second half') === false) || $outcomeType === 'btts') {
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
    
    // Both Teams Score - First Half
    if (stripos($betNameLower, 'both teams') !== false && stripos($betNameLower, 'first half') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $bothScored = ($halftimeHome > 0 && $halftimeAway > 0);
            if (stripos($valueStr, 'Yes') !== false) {
                return $bothScored ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'No') !== false) {
                return !$bothScored ? 'won' : 'lost';
            }
        }
    }
    
    // Both Teams To Score - Second Half
    if (stripos($betNameLower, 'both teams') !== false && stripos($betNameLower, 'second half') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $secondHalfHome = $homeScore - $halftimeHome;
            $secondHalfAway = $awayScore - $halftimeAway;
            $bothScored = ($secondHalfHome > 0 && $secondHalfAway > 0);
            if (stripos($valueStr, 'Yes') !== false) {
                return $bothScored ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'No') !== false) {
                return !$bothScored ? 'won' : 'lost';
            }
        }
    }
    
    // Win to Nil - Home
    if (stripos($betNameLower, 'win to nil') !== false && stripos($betNameLower, 'home') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $homeWinsToNil = ($homeScore > $awayScore && $awayScore === 0);
            if (stripos($valueStr, 'Yes') !== false) {
                return $homeWinsToNil ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'No') !== false) {
                return !$homeWinsToNil ? 'won' : 'lost';
            }
        }
    }
    
    // Win to Nil - Away
    if (stripos($betNameLower, 'win to nil') !== false && stripos($betNameLower, 'away') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $awayWinsToNil = ($awayScore > $homeScore && $homeScore === 0);
            if (stripos($valueStr, 'Yes') !== false) {
                return $awayWinsToNil ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'No') !== false) {
                return !$awayWinsToNil ? 'won' : 'lost';
            }
        }
    }
    
    // First Half Winner
    if (stripos($betNameLower, 'first half winner') !== false) {
        if (isset($outcome['value'])) {
            if ($outcome['value'] === 'Home') {
                return ($halftimeHome > $halftimeAway) ? 'won' : 'lost';
            } elseif ($outcome['value'] === 'Draw') {
                return ($halftimeHome === $halftimeAway) ? 'won' : 'lost';
            } elseif ($outcome['value'] === 'Away') {
                return ($halftimeAway > $halftimeHome) ? 'won' : 'lost';
            }
        }
    }
    
    // Win Both Halves
    if (stripos($betNameLower, 'win both halves') !== false) {
        if (isset($outcome['value'])) {
            $htHomeWins = ($halftimeHome > $halftimeAway);
            $htAwayWins = ($halftimeAway > $halftimeHome);
            $ftHomeWins = ($homeScore > $awayScore);
            $ftAwayWins = ($awayScore > $homeScore);
            
            if ($outcome['value'] === 'Home') {
                return ($htHomeWins && $ftHomeWins) ? 'won' : 'lost';
            } elseif ($outcome['value'] === 'Away') {
                return ($htAwayWins && $ftAwayWins) ? 'won' : 'lost';
            }
        }
    }
    
    // Total - Home (Home team total goals)
    if (stripos($betNameLower, 'total - home') !== false || stripos($betNameLower, 'home team goals') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            preg_match('/(\d+\.?\d*)/', $valueStr, $matches);
            $totalValue = isset($matches[1]) ? floatval($matches[1]) : floatval($value);
            
            if (stripos($valueStr, 'Over') !== false) {
                return ($homeScore > $totalValue) ? 'won' : (($homeScore == $totalValue) ? 'refunded' : 'lost');
            } elseif (stripos($valueStr, 'Under') !== false) {
                return ($homeScore < $totalValue) ? 'won' : (($homeScore == $totalValue) ? 'refunded' : 'lost');
            }
        }
    }
    
    // Total - Away (Away team total goals)
    if (stripos($betNameLower, 'total - away') !== false || stripos($betNameLower, 'away team goals') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            preg_match('/(\d+\.?\d*)/', $valueStr, $matches);
            $totalValue = isset($matches[1]) ? floatval($matches[1]) : floatval($value);
            
            if (stripos($valueStr, 'Over') !== false) {
                return ($awayScore > $totalValue) ? 'won' : (($awayScore == $totalValue) ? 'refunded' : 'lost');
            } elseif (stripos($valueStr, 'Under') !== false) {
                return ($awayScore < $totalValue) ? 'won' : (($awayScore == $totalValue) ? 'refunded' : 'lost');
            }
        }
    }
    
    // Double Chance - First Half
    if (stripos($betNameLower, 'double chance') !== false && stripos($betNameLower, 'first half') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $htHomeWins = ($halftimeHome > $halftimeAway);
            $htDraw = ($halftimeHome === $halftimeAway);
            $htAwayWins = ($halftimeAway > $halftimeHome);
            $valueStrNorm = str_replace(' ', '', $valueStr);
            $parts = array_map('trim', explode('/', $valueStr));
            
            if (stripos($valueStr, '1X') !== false || stripos($valueStr, 'Home or Draw') !== false || $valueStrNorm === 'Home/Draw' || (count($parts) === 2 && in_array('Home', $parts) && in_array('Draw', $parts))) {
                return ($htHomeWins || $htDraw) ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'X2') !== false || stripos($valueStr, 'Away or Draw') !== false || $valueStrNorm === 'Draw/Away' || (count($parts) === 2 && in_array('Draw', $parts) && in_array('Away', $parts))) {
                return ($htAwayWins || $htDraw) ? 'won' : 'lost';
            } elseif (stripos($valueStr, '12') !== false || stripos($valueStr, 'Home or Away') !== false || $valueStrNorm === 'Home/Away' || (count($parts) === 2 && in_array('Home', $parts) && in_array('Away', $parts))) {
                return ($htHomeWins || $htAwayWins) ? 'won' : 'lost';
            }
        }
    }
    
    // Double Chance - Second Half
    if (stripos($betNameLower, 'double chance') !== false && stripos($betNameLower, 'second half') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $secondHalfHome = $homeScore - $halftimeHome;
            $secondHalfAway = $awayScore - $halftimeAway;
            $shHomeWins = ($secondHalfHome > $secondHalfAway);
            $shDraw = ($secondHalfHome === $secondHalfAway);
            $shAwayWins = ($secondHalfAway > $secondHalfHome);
            $valueStrNorm = str_replace(' ', '', $valueStr);
            $parts = array_map('trim', explode('/', $valueStr));
            
            if (stripos($valueStr, '1X') !== false || stripos($valueStr, 'Home or Draw') !== false || $valueStrNorm === 'Home/Draw' || (count($parts) === 2 && in_array('Home', $parts) && in_array('Draw', $parts))) {
                return ($shHomeWins || $shDraw) ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'X2') !== false || stripos($valueStr, 'Away or Draw') !== false || $valueStrNorm === 'Draw/Away' || (count($parts) === 2 && in_array('Draw', $parts) && in_array('Away', $parts))) {
                return ($shAwayWins || $shDraw) ? 'won' : 'lost';
            } elseif (stripos($valueStr, '12') !== false || stripos($valueStr, 'Home or Away') !== false || $valueStrNorm === 'Home/Away' || (count($parts) === 2 && in_array('Home', $parts) && in_array('Away', $parts))) {
                return ($shHomeWins || $shAwayWins) ? 'won' : 'lost';
            }
        }
    }
    
    // Handicap Result (European Handicap)
    if (stripos($betNameLower, 'handicap result') !== false || stripos($betNameLower, '3-way handicap') !== false || stripos($betNameLower, '3 way handicap') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            // Parse format like "Home -1", "Draw +1", "Away -2"
            preg_match('/(Home|Draw|Away)\s*([+-]?\d+\.?\d*)/i', $valueStr, $matches);
            if (count($matches) === 3) {
                $team = ucfirst(strtolower($matches[1]));
                $handicap = floatval($matches[2]);
                
                $homeAdj = $homeScore + $handicap;
                $awayAdj = $awayScore;
                
                if ($team === 'Home') {
                    return ($homeAdj > $awayAdj) ? 'won' : 'lost';
                } elseif ($team === 'Draw') {
                    return ($homeAdj === $awayAdj) ? 'won' : 'lost';
                } elseif ($team === 'Away') {
                    return ($homeAdj < $awayAdj) ? 'won' : 'lost';
                }
            }
        }
    }
    
    // Correct Score - First Half
    if (stripos($betNameLower, 'correct score') !== false && stripos($betNameLower, 'first half') !== false) {
        if (isset($outcome['value'])) {
            $scoreStr = $outcome['value']; // e.g., "1:0"
            $parts = preg_split('/[:\-]/', $scoreStr);
            if (count($parts) === 2) {
                $expectedHome = intval($parts[0]);
                $expectedAway = intval($parts[1]);
                return (($halftimeHome === $expectedHome) && ($halftimeAway === $expectedAway)) ? 'won' : 'lost';
            }
        }
    }
    
    // Odd/Even
    if (stripos($betNameLower, 'odd/even') !== false && stripos($betNameLower, 'first half') === false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $totalGoals = $homeScore + $awayScore;
            $isOdd = ($totalGoals % 2 === 1);
            
            if (stripos($valueStr, 'Odd') !== false) {
                return $isOdd ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'Even') !== false) {
                return !$isOdd ? 'won' : 'lost';
            }
        }
    }
    
    // Odd/Even - First Half
    if (stripos($betNameLower, 'odd/even') !== false && stripos($betNameLower, 'first half') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $totalGoals = $halftimeHome + $halftimeAway;
            $isOdd = ($totalGoals % 2 === 1);
            
            if (stripos($valueStr, 'Odd') !== false) {
                return $isOdd ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'Even') !== false) {
                return !$isOdd ? 'won' : 'lost';
            }
        }
    }
    
    // Highest Scoring Half
    if (stripos($betNameLower, 'highest scoring half') !== false) {
        if (isset($outcome['value'])) {
            $firstHalfGoals = $halftimeHome + $halftimeAway;
            $secondHalfGoals = ($homeScore + $awayScore) - $firstHalfGoals;
            
            if ($outcome['value'] === 'First Half') {
                return ($firstHalfGoals > $secondHalfGoals) ? 'won' : 'lost';
            } elseif ($outcome['value'] === 'Second Half') {
                return ($secondHalfGoals > $firstHalfGoals) ? 'won' : 'lost';
            } elseif ($outcome['value'] === 'Draw' || stripos($outcome['value'], 'Equal') !== false) {
                return ($firstHalfGoals === $secondHalfGoals) ? 'won' : 'lost';
            }
        }
    }
    
    // Double Chance - bet ID 12
    if (stripos($betNameLower, 'double chance') !== false || $outcomeType === 'double_chance') {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $homeWins = ($homeScore > $awayScore);
            $draw = ($homeScore === $awayScore);
            $awayWins = ($awayScore > $homeScore);
            $valueStrNorm = str_replace(' ', '', $valueStr);
            $parts = array_map('trim', explode('/', $valueStr));
            
            if (stripos($valueStr, '1X') !== false || stripos($valueStr, 'Home or Draw') !== false || $valueStrNorm === 'Home/Draw' || (count($parts) === 2 && in_array('Home', $parts) && in_array('Draw', $parts))) {
                return ($homeWins || $draw) ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'X2') !== false || stripos($valueStr, 'Away or Draw') !== false || $valueStrNorm === 'Draw/Away' || (count($parts) === 2 && in_array('Draw', $parts) && in_array('Away', $parts))) {
                return ($awayWins || $draw) ? 'won' : 'lost';
            } elseif (stripos($valueStr, '12') !== false || stripos($valueStr, 'Home or Away') !== false || $valueStrNorm === 'Home/Away' || (count($parts) === 2 && in_array('Home', $parts) && in_array('Away', $parts))) {
                return ($homeWins || $awayWins) ? 'won' : 'lost';
            }
        }
    }
    
    // Team To Score First - requires events from fixture
    if (stripos($betNameLower, 'team to score first') !== false || stripos($betNameLower, '1st goal') !== false || stripos($betNameLower, 'first goal') !== false) {
        if (isset($outcome['value']) && is_array($events) && !empty($events)) {
            $homeTeamId = $fixture['teams']['home']['id'] ?? null;
            $awayTeamId = $fixture['teams']['away']['id'] ?? null;
            $valueStr = $outcome['value'];
            if ($valueStr === '1') $valueStr = 'Home';
            if ($valueStr === '2') $valueStr = 'Away';
            if (stripos($valueStr, 'no goal') !== false) $valueStr = 'Draw';
            
            // Find first goal
            $firstGoal = null;
            $minTime = PHP_INT_MAX;
            foreach ($events as $event) {
                if (isset($event['type']) && $event['type'] === 'Goal' && isset($event['time']['elapsed'])) {
                    $time = intval($event['time']['elapsed']);
                    if ($time < $minTime) {
                        $minTime = $time;
                        $firstGoal = $event;
                    }
                }
            }
            
            if ($firstGoal && isset($firstGoal['team']['id'])) {
                $firstGoalTeamId = $firstGoal['team']['id'];
                if ($valueStr === 'Home' && $firstGoalTeamId == $homeTeamId) {
                    return 'won';
                } elseif ($valueStr === 'Away' && $firstGoalTeamId == $awayTeamId) {
                    return 'won';
                } elseif ($valueStr === 'Draw' && $homeScore === 0 && $awayScore === 0) {
                    return 'won';
                } else {
                    return 'lost';
                }
            } elseif ($valueStr === 'Draw' && $homeScore === 0 && $awayScore === 0) {
                return 'won';
            } else {
                return 'lost';
            }
        }
    }
    
    // Team To Score Last - requires events from fixture
    if (stripos($betNameLower, 'team to score last') !== false || stripos($betNameLower, 'last team to score') !== false) {
        if (isset($outcome['value']) && is_array($events) && !empty($events)) {
            $homeTeamId = $fixture['teams']['home']['id'] ?? null;
            $awayTeamId = $fixture['teams']['away']['id'] ?? null;
            $valueStr = $outcome['value'];
            if ($valueStr === '1') $valueStr = 'Home';
            if ($valueStr === '2') $valueStr = 'Away';
            if (stripos($valueStr, 'no goal') !== false) $valueStr = 'Draw';
            
            // Find last goal
            $lastGoal = null;
            $maxTime = -1;
            foreach ($events as $event) {
                if (isset($event['type']) && $event['type'] === 'Goal' && isset($event['time']['elapsed'])) {
                    $time = intval($event['time']['elapsed']);
                    if ($time > $maxTime) {
                        $maxTime = $time;
                        $lastGoal = $event;
                    }
                }
            }
            
            if ($lastGoal && isset($lastGoal['team']['id'])) {
                $lastGoalTeamId = $lastGoal['team']['id'];
                if ($valueStr === 'Home' && $lastGoalTeamId == $homeTeamId) {
                    return 'won';
                } elseif ($valueStr === 'Away' && $lastGoalTeamId == $awayTeamId) {
                    return 'won';
                } elseif ($valueStr === 'Draw' && $homeScore === 0 && $awayScore === 0) {
                    return 'won';
                } else {
                    return 'lost';
                }
            } elseif ($valueStr === 'Draw' && $homeScore === 0 && $awayScore === 0) {
                return 'won';
            } else {
                return 'lost';
            }
        }
    }
    
    // Results/Both Teams Score - combined bet (e.g., "Home/Yes", "Draw/No")
    if (stripos($betNameLower, 'results/both teams score') !== false || stripos($betNameLower, 'result / both teams') !== false || stripos($betNameLower, 'result/both teams') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $parts = explode('/', $valueStr);
            if (count($parts) === 2) {
                $resultPart = trim($parts[0]); // Home, Draw, Away
                $bttsPart = trim($parts[1]); // Yes, No
                
                // Check result
                $resultCorrect = false;
                if ($resultPart === 'Home' && $homeScore > $awayScore) $resultCorrect = true;
                elseif ($resultPart === 'Draw' && $homeScore === $awayScore) $resultCorrect = true;
                elseif ($resultPart === 'Away' && $awayScore > $homeScore) $resultCorrect = true;
                
                // Check both teams scored
                $bothScored = ($homeScore > 0 && $awayScore > 0);
                $bttsCorrect = false;
                if ($bttsPart === 'Yes' && $bothScored) $bttsCorrect = true;
                elseif ($bttsPart === 'No' && !$bothScored) $bttsCorrect = true;
                
                return ($resultCorrect && $bttsCorrect) ? 'won' : 'lost';
            }
        }
    }
    
    // Result/Total Goals - combined bet (e.g., "Home/Over 1.5", "Draw/Under 2.5")
    if (stripos($betNameLower, 'result/total goals') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $parts = explode('/', $valueStr);
            if (count($parts) === 2) {
                $resultPart = trim($parts[0]); // Home, Draw, Away
                $totalPart = trim($parts[1]); // Over 1.5, Under 2.5, etc.
                
                // Check result
                $resultCorrect = false;
                if ($resultPart === 'Home' && $homeScore > $awayScore) $resultCorrect = true;
                elseif ($resultPart === 'Draw' && $homeScore === $awayScore) $resultCorrect = true;
                elseif ($resultPart === 'Away' && $awayScore > $homeScore) $resultCorrect = true;
                
                // Check total goals
                preg_match('/(\d+\.?\d*)/', $totalPart, $matches);
                $totalValue = isset($matches[1]) ? floatval($matches[1]) : 0;
                $totalGoals = $homeScore + $awayScore;
                
                if ($totalGoals == $totalValue) {
                    return 'refunded';
                }
                $totalCorrect = false;
                if (stripos($totalPart, 'Over') !== false && $totalGoals > $totalValue) $totalCorrect = true;
                elseif (stripos($totalPart, 'Under') !== false && $totalGoals < $totalValue) $totalCorrect = true;
                
                return ($resultCorrect && $totalCorrect) ? 'won' : 'lost';
            }
        }
    }
    
    // Correct Score - Second Half
    if (stripos($betNameLower, 'correct score') !== false && stripos($betNameLower, 'second half') !== false) {
        if (isset($outcome['value'])) {
            $scoreStr = $outcome['value']; // e.g., "1:0"
            $parts = preg_split('/[:\-]/', $scoreStr);
            if (count($parts) === 2) {
                $expectedHome = intval($parts[0]);
                $expectedAway = intval($parts[1]);
                // Second half score = fulltime - halftime
                $secondHalfHome = $homeScore - $halftimeHome;
                $secondHalfAway = $awayScore - $halftimeAway;
                return (($secondHalfHome === $expectedHome) && ($secondHalfAway === $expectedAway)) ? 'won' : 'lost';
            }
        }
    }
    
    // Home Team Exact Goals Number
    if (stripos($betNameLower, 'home team exact goals number') !== false || stripos($betNameLower, 'how many goals will home team score') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            if ($valueStr === '0' || stripos($valueStr, 'no goal') !== false) {
                return ($homeScore === 0) ? 'won' : 'lost';
            } elseif ($valueStr === '1') {
                return ($homeScore === 1) ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'more') !== false || stripos($valueStr, '2+') !== false) {
                preg_match('/(\d+)/', $valueStr, $matches);
                $minGoals = isset($matches[1]) ? intval($matches[1]) : 2;
                return ($homeScore >= $minGoals) ? 'won' : 'lost';
            } else {
                $expectedGoals = intval($valueStr);
                return ($homeScore === $expectedGoals) ? 'won' : 'lost';
            }
        }
    }
    
    // Away Team Exact Goals Number
    if (stripos($betNameLower, 'away team exact goals number') !== false || stripos($betNameLower, 'how many goals will away team score') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            if ($valueStr === '0' || stripos($valueStr, 'no goal') !== false) {
                return ($awayScore === 0) ? 'won' : 'lost';
            } elseif ($valueStr === '1') {
                return ($awayScore === 1) ? 'won' : 'lost';
            } elseif (stripos($valueStr, 'more') !== false || stripos($valueStr, '2+') !== false) {
                preg_match('/(\d+)/', $valueStr, $matches);
                $minGoals = isset($matches[1]) ? intval($matches[1]) : 2;
                return ($awayScore >= $minGoals) ? 'won' : 'lost';
            } else {
                $expectedGoals = intval($valueStr);
                return ($awayScore === $expectedGoals) ? 'won' : 'lost';
            }
        }
    }

    // Statistics-based markets (corners, cards, fouls, shots)
    if ($stats && is_array($stats)) {
        $homeCorners = getStatValue($stats, 'home', ['Corner Kicks', 'Corners']);
        $awayCorners = getStatValue($stats, 'away', ['Corner Kicks', 'Corners']);
        $homeFouls = getStatValue($stats, 'home', ['Fouls']);
        $awayFouls = getStatValue($stats, 'away', ['Fouls']);
        $homeShotsOnTarget = getStatValue($stats, 'home', ['Shots on Goal', 'Shots on Target']);
        $awayShotsOnTarget = getStatValue($stats, 'away', ['Shots on Goal', 'Shots on Target']);
        $homeTotalShots = getStatValue($stats, 'home', ['Total Shots']);
        $awayTotalShots = getStatValue($stats, 'away', ['Total Shots']);
        $homeYellow = getStatValue($stats, 'home', ['Yellow Cards']);
        $awayYellow = getStatValue($stats, 'away', ['Yellow Cards']);
        $homeRed = getStatValue($stats, 'home', ['Red Cards']);
        $awayRed = getStatValue($stats, 'away', ['Red Cards']);

        $homeCards = ($homeYellow ?? 0) + ($homeRed ?? 0);
        $awayCards = ($awayYellow ?? 0) + ($awayRed ?? 0);

        $valueStr = $outcome['value'] ?? '';

        // Red Card In The Match (first half/full match)
        if (stripos($betNameLower, 'red card') !== false) {
            if (is_array($events) && !empty($events)) {
                $redCount = 0;
                foreach ($events as $event) {
                    $type = $event['type'] ?? '';
                    $detail = strtolower($event['detail'] ?? '');
                    $time = intval($event['time']['elapsed'] ?? 0);
                    if ($type === 'Card' && (strpos($detail, 'red') !== false || strpos($detail, 'second yellow') !== false)) {
                        if (stripos($betNameLower, '1st half') !== false && $time > 45) {
                            continue;
                        }
                        $redCount++;
                    }
                }
                if (stripos($valueStr, 'Yes') !== false) return ($redCount > 0) ? 'won' : 'lost';
                if (stripos($valueStr, 'No') !== false) return ($redCount === 0) ? 'won' : 'lost';
            } elseif (stripos($betNameLower, '1st half') === false) {
                $redTotal = ($homeRed ?? 0) + ($awayRed ?? 0);
                if (stripos($valueStr, 'Yes') !== false) return ($redTotal > 0) ? 'won' : 'lost';
                if (stripos($valueStr, 'No') !== false) return ($redTotal === 0) ? 'won' : 'lost';
            }
        }

        // Cards Over/Under
        if (stripos($betNameLower, 'cards over/under') !== false || stripos($betNameLower, 'cards over under') !== false) {
            if ($valueStr !== '') {
                preg_match('/(\d+\.?\d*)/', $valueStr, $matches);
                $totalValue = isset($matches[1]) ? floatval($matches[1]) : 0;
                $totalCards = $homeCards + $awayCards;
                if (stripos($valueStr, 'Over') !== false) return ($totalCards > $totalValue) ? 'won' : (($totalCards == $totalValue) ? 'refunded' : 'lost');
                if (stripos($valueStr, 'Under') !== false) return ($totalCards < $totalValue) ? 'won' : (($totalCards == $totalValue) ? 'refunded' : 'lost');
            }
        }

        // Cards Asian Handicap
        if (stripos($betNameLower, 'cards asian handicap') !== false) {
            if ($valueStr !== '') {
                preg_match('/(Home|Away)\s*([+-]?\d+\.?\d*)/i', $valueStr, $matches);
                if (count($matches) === 3) {
                    $side = strtolower($matches[1]);
                    $handicap = floatval($matches[2]);
                    $homeAdj = $homeCards + ($side === 'home' ? $handicap : 0);
                    $awayAdj = $awayCards + ($side === 'away' ? $handicap : 0);
                    if ($homeAdj === $awayAdj) return 'refunded';
                    return ($side === 'home') ? (($homeAdj > $awayAdj) ? 'won' : 'lost') : (($awayAdj > $homeAdj) ? 'won' : 'lost');
                }
            }
        }

        // Home/Away Team Total Cards
        if (stripos($betNameLower, 'home team total cards') !== false || stripos($betNameLower, 'away team total cards') !== false) {
            $teamCards = (stripos($betNameLower, 'home') !== false) ? $homeCards : $awayCards;
            if ($valueStr !== '') {
                preg_match('/(\d+\.?\d*)/', $valueStr, $matches);
                $totalValue = isset($matches[1]) ? floatval($matches[1]) : 0;
                if (stripos($valueStr, 'Over') !== false) return ($teamCards > $totalValue) ? 'won' : (($teamCards == $totalValue) ? 'refunded' : 'lost');
                if (stripos($valueStr, 'Under') !== false) return ($teamCards < $totalValue) ? 'won' : (($teamCards == $totalValue) ? 'refunded' : 'lost');
            }
        }

        // Corners Over/Under (full match only)
        if (stripos($betNameLower, 'corners over/under') !== false || stripos($betNameLower, 'corners over under') !== false || (stripos($betNameLower, 'total corners') !== false && stripos($betNameLower, '1st half') === false && stripos($betNameLower, '2nd half') === false)) {
            if ($valueStr !== '' && $homeCorners !== null && $awayCorners !== null) {
                preg_match('/(\d+\.?\d*)/', $valueStr, $matches);
                $totalValue = isset($matches[1]) ? floatval($matches[1]) : 0;
                $totalCorners = $homeCorners + $awayCorners;
                if (stripos($valueStr, 'Over') !== false) return ($totalCorners > $totalValue) ? 'won' : (($totalCorners == $totalValue) ? 'refunded' : 'lost');
                if (stripos($valueStr, 'Under') !== false) return ($totalCorners < $totalValue) ? 'won' : (($totalCorners == $totalValue) ? 'refunded' : 'lost');
            }
        }

        // Home/Away Corners Over/Under
        if (stripos($betNameLower, 'home corners over/under') !== false || stripos($betNameLower, 'home total corners') !== false || stripos($betNameLower, 'away corners over/under') !== false || stripos($betNameLower, 'away total corners') !== false) {
            $teamCorners = (stripos($betNameLower, 'home') !== false) ? $homeCorners : $awayCorners;
            if ($valueStr !== '' && $teamCorners !== null) {
                preg_match('/(\d+\.?\d*)/', $valueStr, $matches);
                $totalValue = isset($matches[1]) ? floatval($matches[1]) : 0;
                if (stripos($valueStr, 'Over') !== false) return ($teamCorners > $totalValue) ? 'won' : (($teamCorners == $totalValue) ? 'refunded' : 'lost');
                if (stripos($valueStr, 'Under') !== false) return ($teamCorners < $totalValue) ? 'won' : (($teamCorners == $totalValue) ? 'refunded' : 'lost');
            }
        }

        // Corners 1x2
        if (stripos($betNameLower, 'corners 1x2') !== false) {
            if ($homeCorners !== null && $awayCorners !== null && $valueStr !== '') {
                if ($valueStr === 'Home') return ($homeCorners > $awayCorners) ? 'won' : 'lost';
                if ($valueStr === 'Draw') return ($homeCorners == $awayCorners) ? 'won' : 'lost';
                if ($valueStr === 'Away') return ($awayCorners > $homeCorners) ? 'won' : 'lost';
            }
        }

        // Corners Asian Handicap
        if (stripos($betNameLower, 'corners asian handicap') !== false) {
            if ($valueStr !== '' && $homeCorners !== null && $awayCorners !== null) {
                preg_match('/(Home|Away)\s*([+-]?\d+\.?\d*)/i', $valueStr, $matches);
                if (count($matches) === 3) {
                    $side = strtolower($matches[1]);
                    $handicap = floatval($matches[2]);
                    $homeAdj = $homeCorners + ($side === 'home' ? $handicap : 0);
                    $awayAdj = $awayCorners + ($side === 'away' ? $handicap : 0);
                    if ($homeAdj === $awayAdj) return 'refunded';
                    return ($side === 'home') ? (($homeAdj > $awayAdj) ? 'won' : 'lost') : (($awayAdj > $homeAdj) ? 'won' : 'lost');
                }
            }
        }

        // Fouls 1x2
        if (stripos($betNameLower, 'fouls') !== false && stripos($betNameLower, '1x2') !== false) {
            if ($homeFouls !== null && $awayFouls !== null && $valueStr !== '') {
                if ($valueStr === 'Home') return ($homeFouls > $awayFouls) ? 'won' : 'lost';
                if ($valueStr === 'Draw') return ($homeFouls == $awayFouls) ? 'won' : 'lost';
                if ($valueStr === 'Away') return ($awayFouls > $homeFouls) ? 'won' : 'lost';
            }
        }

        // Shots on Target 1x2 / Handicap
        if (stripos($betNameLower, 'shotontarget') !== false || stripos($betNameLower, 'shots on target') !== false) {
            if (stripos($betNameLower, 'handicap') !== false) {
                if ($valueStr !== '' && $homeShotsOnTarget !== null && $awayShotsOnTarget !== null) {
                    preg_match('/(Home|Away)\s*([+-]?\d+\.?\d*)/i', $valueStr, $matches);
                    if (count($matches) === 3) {
                        $side = strtolower($matches[1]);
                        $handicap = floatval($matches[2]);
                        $homeAdj = $homeShotsOnTarget + ($side === 'home' ? $handicap : 0);
                        $awayAdj = $awayShotsOnTarget + ($side === 'away' ? $handicap : 0);
                        if ($homeAdj === $awayAdj) return 'refunded';
                        return ($side === 'home') ? (($homeAdj > $awayAdj) ? 'won' : 'lost') : (($awayAdj > $homeAdj) ? 'won' : 'lost');
                    }
                }
            } elseif (stripos($betNameLower, '1x2') !== false && $valueStr !== '') {
                if ($homeShotsOnTarget !== null && $awayShotsOnTarget !== null) {
                    if ($valueStr === 'Home') return ($homeShotsOnTarget > $awayShotsOnTarget) ? 'won' : 'lost';
                    if ($valueStr === 'Draw') return ($homeShotsOnTarget == $awayShotsOnTarget) ? 'won' : 'lost';
                    if ($valueStr === 'Away') return ($awayShotsOnTarget > $homeShotsOnTarget) ? 'won' : 'lost';
                }
            }
        }

        // Total Shots (Over/Under or 1x2)
        if (stripos($betNameLower, 'total shots') !== false) {
            if ($homeTotalShots !== null && $awayTotalShots !== null && $valueStr !== '') {
                $totalShots = $homeTotalShots + $awayTotalShots;
                if (stripos($valueStr, 'Over') !== false || stripos($valueStr, 'Under') !== false) {
                    preg_match('/(\d+\.?\d*)/', $valueStr, $matches);
                    $totalValue = isset($matches[1]) ? floatval($matches[1]) : 0;
                    if (stripos($valueStr, 'Over') !== false) return ($totalShots > $totalValue) ? 'won' : (($totalShots == $totalValue) ? 'refunded' : 'lost');
                    if (stripos($valueStr, 'Under') !== false) return ($totalShots < $totalValue) ? 'won' : (($totalShots == $totalValue) ? 'refunded' : 'lost');
                } else {
                    if ($valueStr === 'Home') return ($homeTotalShots > $awayTotalShots) ? 'won' : 'lost';
                    if ($valueStr === 'Draw') return ($homeTotalShots == $awayTotalShots) ? 'won' : 'lost';
                    if ($valueStr === 'Away') return ($awayTotalShots > $homeTotalShots) ? 'won' : 'lost';
                }
            }
        }

        // Corners Odd/Even
        if (stripos($betNameLower, 'corners') !== false && stripos($betNameLower, 'odd/even') !== false) {
            if ($homeCorners !== null && $awayCorners !== null && $valueStr !== '') {
                $totalCorners = $homeCorners + $awayCorners;
                $isOdd = ((int)$totalCorners % 2) === 1;
                if (stripos($valueStr, 'Odd') !== false) return $isOdd ? 'won' : 'lost';
                if (stripos($valueStr, 'Even') !== false) return !$isOdd ? 'won' : 'lost';
            }
        }
    }

    // Draw No Bet
    if (stripos($betNameLower, 'draw no bet') !== false) {
        if (isset($outcome['value'])) {
            if ($homeScore === $awayScore) {
                return 'refunded';
            }
            if ($outcome['value'] === 'Home') {
                return ($homeScore > $awayScore) ? 'won' : 'lost';
            } elseif ($outcome['value'] === 'Away') {
                return ($awayScore > $homeScore) ? 'won' : 'lost';
            }
        }
    }

    // Clean Sheet (Home/Away)
    if (stripos($betNameLower, 'home team clean sheet') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $homeCleanSheet = ($awayScore === 0);
            if (stripos($valueStr, 'Yes') !== false) return $homeCleanSheet ? 'won' : 'lost';
            if (stripos($valueStr, 'No') !== false) return !$homeCleanSheet ? 'won' : 'lost';
        }
    }

    if (stripos($betNameLower, 'away team clean sheet') !== false) {
        if (isset($outcome['value'])) {
            $valueStr = $outcome['value'];
            $awayCleanSheet = ($homeScore === 0);
            if (stripos($valueStr, 'Yes') !== false) return $awayCleanSheet ? 'won' : 'lost';
            if (stripos($valueStr, 'No') !== false) return !$awayCleanSheet ? 'won' : 'lost';
        }
    }

    // Team Score a Goal (2nd Half)
    if (stripos($betNameLower, 'home team score a goal') !== false && (stripos($betNameLower, '2nd half') !== false || stripos($betNameLower, 'second half') !== false)) {
        if (isset($outcome['value'])) {
            $secondHalfHome = $homeScore - $halftimeHome;
            $homeScoredSecondHalf = ($secondHalfHome > 0);
            if (stripos($outcome['value'], 'Yes') !== false) return $homeScoredSecondHalf ? 'won' : 'lost';
            if (stripos($outcome['value'], 'No') !== false) return !$homeScoredSecondHalf ? 'won' : 'lost';
        }
    }

    if (stripos($betNameLower, 'away team score a goal') !== false && (stripos($betNameLower, '2nd half') !== false || stripos($betNameLower, 'second half') !== false)) {
        if (isset($outcome['value'])) {
            $secondHalfAway = $awayScore - $halftimeAway;
            $awayScoredSecondHalf = ($secondHalfAway > 0);
            if (stripos($outcome['value'], 'Yes') !== false) return $awayScoredSecondHalf ? 'won' : 'lost';
            if (stripos($outcome['value'], 'No') !== false) return !$awayScoredSecondHalf ? 'won' : 'lost';
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
            
            // Get fixture context (fixture + events + stats)
            try {
                $context = getFixtureContext($fixtureId);
            } catch (Exception $e) {
                error_log("[SettleBets] Bet ID: {$bet['bet_id']}, Fixture ID: {$fixtureId} - API Error: " . $e->getMessage());
                $errors[] = "Bet {$bet['bet_id']}: API Error - " . $e->getMessage();
                continue;
            }
            
            if (!isset($context['fixture']) || empty($context['fixture'])) {
                error_log("[SettleBets] Bet ID: {$bet['bet_id']}, Fixture ID: {$fixtureId} - Match not found in API response");
                continue; // Match not found
            }
            
            $fixture = $context['fixture'];
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
            $result = calculateBetResult($bet, $fixture, $context);
            
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
                    win_amount = CASE WHEN ? = 'won' THEN potential_win WHEN ? = 'refunded' THEN stake ELSE NULL END
                WHERE id = ?
            ");
            
            error_log("[SettleBets] Bet ID: {$bet['bet_id']} - Updating DB with result: '{$result}', bet DB id: {$bet['id']}");
            
            $updateStmt->execute([$result, $result, $result, $bet['id']]);
            
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
            
            // Update user balance if won or refunded
            if ($result === 'won') {
                $winAmount = floatval($bet['potential_win']);
                $updateBalanceStmt = $db->prepare("
                    UPDATE users 
                    SET balance = balance + ?
                    WHERE id = ?
                ");
                $updateBalanceStmt->execute([$winAmount, $bet['user_id']]);
                error_log("[SettleBets] Bet ID: {$bet['bet_id']} - User balance updated by +{$winAmount}");
            } elseif ($result === 'refunded') {
                $refundAmount = floatval($bet['stake']);
                $updateBalanceStmt = $db->prepare("
                    UPDATE users 
                    SET balance = balance + ?
                    WHERE id = ?
                ");
                $updateBalanceStmt->execute([$refundAmount, $bet['user_id']]);
                error_log("[SettleBets] Bet ID: {$bet['bet_id']} - User balance refunded by +{$refundAmount}");
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
