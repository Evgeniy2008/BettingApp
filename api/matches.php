<?php
require_once 'config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// API-Sports configuration
define('API_SPORTS_BASE_URL', 'https://v3.football.api-sports.io');
define('API_SPORTS_KEY', '52da50550958ad43c690929166dd548d');

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
        'x-rapidapi-key: ' . API_SPORTS_KEY,
        'x-rapidapi-host: v3.football.api-sports.io',
        'Accept: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
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
    
    // Check for API errors
    if (isset($data['errors']) && !empty($data['errors'])) {
        throw new Exception('API errors: ' . json_encode($data['errors']));
    }
    
    return $data;
}

/**
 * Converts API-Sports fixture to our format
 */
function convertFixtureToMatch($fixture, $odds = null) {
    $matchId = (string)$fixture['fixture']['id'];
    $home = $fixture['teams']['home']['name'];
    $away = $fixture['teams']['away']['name'];
    $league = $fixture['league']['name'];
    $country = $fixture['league']['country'] ?? '';
    
    // Parse date and time
    $dateTime = new DateTime($fixture['fixture']['date']);
    $startDate = $dateTime->format('d.m');
    $startTime = $dateTime->format('H:i');
    
    // Check if match is live or finished
    $status = $fixture['fixture']['status']['long'] ?? '';
    $isFinished = ($status === 'Match Finished' || $status === 'Match Cancelled' || $status === 'Match Postponed');
    $isLive = !$isFinished && ($fixture['fixture']['status']['elapsed'] !== null);
    
    $liveTime = null;
    $livePeriod = null;
    $score = null;
    
    if ($isLive) {
        $liveTime = $fixture['fixture']['status']['elapsed'] . "'";
        $livePeriod = $fixture['fixture']['status']['short'] ?? null;
        if (isset($fixture['goals']['home']) && isset($fixture['goals']['away'])) {
            $score = [
                'home' => (int)$fixture['goals']['home'],
                'away' => (int)$fixture['goals']['away']
            ];
        }
    }
    
    // Build outcomes array
    $outcomes = [];
    
    // Add outcomes from odds
    if ($odds && isset($odds['bookmakers']) && is_array($odds['bookmakers'])) {
        // Try to find Bet365 first (id: 8), then use first available bookmaker
        $bookmaker = null;
        foreach ($odds['bookmakers'] as $bm) {
            if (isset($bm['id']) && $bm['id'] == 8) {
                $bookmaker = $bm;
                break;
            }
        }
        if (!$bookmaker && !empty($odds['bookmakers'])) {
            $bookmaker = $odds['bookmakers'][0];
        }
        
        if ($bookmaker && isset($bookmaker['bets']) && is_array($bookmaker['bets'])) {
            foreach ($bookmaker['bets'] as $bet) {
                if (!isset($bet['id']) || !isset($bet['values']) || !is_array($bet['values'])) {
                    continue;
                }
                
                // Match Winner (1X2) - bet ID 1
                if ($bet['id'] == 1) {
                    foreach ($bet['values'] as $value) {
                        if (!isset($value['value']) || !isset($value['odd'])) continue;
                        
                        $label = $value['value'];
                        $odd = floatval($value['odd']);
                        
                        if ($label === 'Home' || $label === '1') {
                            $outcomes[] = [
                                'label' => '1',
                                'odd' => $odd,
                                'type' => '1x2'
                            ];
                        } elseif ($label === 'Draw' || $label === 'X') {
                            $outcomes[] = [
                                'label' => 'X',
                                'odd' => $odd,
                                'type' => '1x2'
                            ];
                        } elseif ($label === 'Away' || $label === '2') {
                            $outcomes[] = [
                                'label' => '2',
                                'odd' => $odd,
                                'type' => '1x2'
                            ];
                        }
                    }
                }
                // Goals Over/Under - bet ID 5
                elseif ($bet['id'] == 5) {
                    // Add all totals (not just 2.5)
                    foreach ($bet['values'] as $value) {
                        if (!isset($value['value']) || !isset($value['odd'])) continue;
                        
                        $label = $value['value'];
                        $odd = floatval($value['odd']);
                        
                        // Extract value from label like "Over 2.5" or "Under 3.5"
                        preg_match('/(\d+\.?\d*)/', $label, $matches);
                        $valueNum = $matches[1] ?? null;
                        
                        if (stripos($label, 'Over') !== false && $valueNum) {
                            $outcomes[] = [
                                'label' => 'Тотал Б',
                                'odd' => $odd,
                                'type' => 'total',
                                'value' => $valueNum
                            ];
                        } elseif (stripos($label, 'Under') !== false && $valueNum) {
                            $outcomes[] = [
                                'label' => 'Тотал М',
                                'odd' => $odd,
                                'type' => 'total',
                                'value' => $valueNum
                            ];
                        }
                    }
                }
                // Asian Handicap - bet ID 4
                elseif ($bet['id'] == 4) {
                    // Find the most common handicap (usually -1 or 0)
                    foreach ($bet['values'] as $value) {
                        if (!isset($value['value']) || !isset($value['odd'])) continue;
                        
                        $label = $value['value'];
                        $odd = floatval($value['odd']);
                        
                        // Extract value from label like "Home -1" or "Away -1.25"
                        preg_match('/([+-]?\d+\.?\d*)/', $label, $matches);
                        $valueNum = $matches[1] ?? null;
                        
                        if (stripos($label, 'Home') !== false) {
                            $outcomes[] = [
                                'label' => 'Фора 1',
                                'odd' => $odd,
                                'type' => 'fora',
                                'value' => $valueNum
                            ];
                        } elseif (stripos($label, 'Away') !== false) {
                            $outcomes[] = [
                                'label' => 'Фора 2',
                                'odd' => $odd,
                                'type' => 'fora',
                                'value' => $valueNum
                            ];
                        }
                    }
                }
            }
        }
    }
    
    return [
        'matchId' => $matchId,
        'lineId' => $matchId, // Use matchId as lineId
        'home' => $home,
        'away' => $away,
        'league' => $league,
        'leagueName' => $country ? "$country. $league" : $league,
        'startDate' => $startDate,
        'startTime' => $startTime,
        'isLive' => $isLive,
        'liveTime' => $liveTime,
        'livePeriod' => $livePeriod,
        'score' => $score,
        'outcomes' => $outcomes,
        'detailUrl' => null // API-Sports doesn't have detail pages
    ];
}

try {
    // Get parameters
    $date = $_GET['date'] ?? date('Y-m-d'); // Today by default
    $league = $_GET['league'] ?? null;
    $live = isset($_GET['live']) && $_GET['live'] === 'true';
    
    $matches = [];
    
    // Get fixtures
    if ($live) {
        // Get live fixtures
        $fixturesData = apiSportsRequest('/fixtures', [
            'live' => 'all'
        ]);
    } else {
        // Get fixtures for specific date (today and next few days)
        $params = ['date' => $date];
        if ($league) {
            $params['league'] = $league;
        }
        $fixturesData = apiSportsRequest('/fixtures', $params);
    }
    
    if (isset($fixturesData['response']) && is_array($fixturesData['response'])) {
        // Show ALL matches (including finished ones)
        foreach ($fixturesData['response'] as $fixture) {
            $fixtureId = $fixture['fixture']['id'];
            
            // Get odds for this fixture
            $oddsData = null;
            try {
                $oddsResponse = apiSportsRequest('/odds', [
                    'fixture' => $fixtureId
                ]);
                if (isset($oddsResponse['response']) && !empty($oddsResponse['response'])) {
                    $oddsData = $oddsResponse['response'][0];
                }
            } catch (Exception $e) {
                // If odds fail, continue without them
                error_log('Failed to get odds for fixture ' . $fixtureId . ': ' . $e->getMessage());
            }
            
            $match = convertFixtureToMatch($fixture, $oddsData);
            if ($match) {
                // Add all matches, even if they don't have odds
                $matches[] = $match;
            }
        }
    }
    
    // Return in the same format as the old API
    sendJSON([
        'source' => 'api-sports',
        'matches' => $matches,
        'meta' => [
            'parsedAt' => date('c'),
            'matchCount' => count($matches),
            'date' => $date
        ]
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    sendJSON([
        'ok' => false,
        'error' => $e->getMessage()
    ]);
}
