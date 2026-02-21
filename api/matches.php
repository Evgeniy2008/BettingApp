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
        'x-rapidapi-key: ' . API_SPORTS_KEY, // Try both headers for compatibility
        'Accept: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15); // Balanced timeout
    
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
 * Makes multiple parallel requests to API-Sports
 */
function apiSportsRequestBatch($requests) {
    $multiHandle = curl_multi_init();
    $handles = [];
    $results = [];
    
    // Create curl handles for all requests
    foreach ($requests as $key => $request) {
        $endpoint = $request['endpoint'];
        $params = $request['params'] ?? [];
        
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
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        
        curl_multi_add_handle($multiHandle, $ch);
        $handles[$key] = $ch;
    }
    
    // Execute all requests in parallel
    $running = null;
    do {
        curl_multi_exec($multiHandle, $running);
        curl_multi_select($multiHandle);
    } while ($running > 0);
    
    // Get results
    foreach ($handles as $key => $ch) {
        $response = curl_multi_getcontent($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        
        if ($error) {
            $results[$key] = ['error' => $error];
        } elseif ($httpCode === 200) {
            $data = json_decode($response, true);
            if (json_last_error() === JSON_ERROR_NONE && (!isset($data['errors']) || empty($data['errors']))) {
                $results[$key] = ['data' => $data];
            } else {
                $results[$key] = ['error' => 'Invalid response'];
            }
        } else {
            $results[$key] = ['error' => 'HTTP ' . $httpCode];
        }
        
        curl_multi_remove_handle($multiHandle, $ch);
        curl_close($ch);
    }
    
    curl_multi_close($multiHandle);
    
    return $results;
}

/**
 * Checks if a match should be filtered out based on time
 * Returns true if match should be excluded (not live and time has passed)
 */
function shouldExcludeMatchByTime($fixture) {
    // Check if match is live
    $status = $fixture['fixture']['status']['long'] ?? '';
    $isFinished = ($status === 'Match Finished' || $status === 'Match Cancelled' || $status === 'Match Postponed');
    $isLive = !$isFinished && ($fixture['fixture']['status']['elapsed'] !== null);
    
    // If match is live, don't exclude it
    if ($isLive) {
        return false;
    }
    
    // Get match date/time
    if (!isset($fixture['fixture']['date'])) {
        return false; // Can't determine, don't exclude
    }
    
    try {
        $matchDateTime = new DateTime($fixture['fixture']['date']);
        $now = new DateTime();
        
        // If match time has passed, exclude it
        if ($matchDateTime < $now) {
            return true;
        }
    } catch (Exception $e) {
        error_log('Error parsing match date: ' . $e->getMessage());
        return false; // On error, don't exclude
    }
    
    return false;
}

/**
 * Converts API-Sports fixture to our format
 */
function convertFixtureToMatch($fixture, $odds = null) {
    $matchId = (string)$fixture['fixture']['id'];
    $home = $fixture['teams']['home']['name'];
    $away = $fixture['teams']['away']['name'];
    $homeLogo = $fixture['teams']['home']['logo'] ?? null;
    $awayLogo = $fixture['teams']['away']['logo'] ?? null;
    $league = $fixture['league']['name'];
    $leagueLogo = $fixture['league']['logo'] ?? null;
    $country = $fixture['league']['country'] ?? '';
    
    // Parse date and time (keep original UTC time for client-side conversion)
    $dateTime = new DateTime($fixture['fixture']['date']);
    $startDate = $dateTime->format('d.m');
    $startTime = $dateTime->format('H:i');
    $startDateTimeISO = $dateTime->format('c'); // ISO 8601 format for client-side timezone conversion
    
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
    
    // Build outcomes array - collect ALL odds from ALL bookmakers
    $outcomes = [];
    
    // Check if odds is in live format (has 'odds' array directly) or regular format (has 'bookmakers')
    $isLiveFormat = ($odds && isset($odds['odds']) && is_array($odds['odds']));
    $isRegularFormat = ($odds && isset($odds['bookmakers']) && is_array($odds['bookmakers']));
    
    // Process live format (odds array directly)
    if ($isLiveFormat) {
        foreach ($odds['odds'] as $bet) {
            if (!isset($bet['id']) || !isset($bet['values']) || !is_array($bet['values'])) {
                continue;
            }
            
            $betId = $bet['id'];
            $betName = $bet['name'] ?? '';
            
            // Match Winner (1X2) - bet ID 1 or Fulltime Result - bet ID 59
            if ($betId == 1 || $betId == 59) {
                foreach ($bet['values'] as $value) {
                    if (!isset($value['value']) || !isset($value['odd']) || ($value['suspended'] ?? false)) continue;
                    
                    $label = $value['value'];
                    $odd = floatval($value['odd']);
                    
                    if ($label === 'Home' || $label === '1') {
                        $outcomes[] = [
                            'label' => '1',
                            'odd' => $odd,
                            'type' => '1x2',
                            'bookmaker' => null // Live format doesn't have bookmaker info
                        ];
                    } elseif ($label === 'Draw' || $label === 'X') {
                        $outcomes[] = [
                            'label' => 'X',
                            'odd' => $odd,
                            'type' => '1x2',
                            'bookmaker' => null
                        ];
                    } elseif ($label === 'Away' || $label === '2') {
                        $outcomes[] = [
                            'label' => '2',
                            'odd' => $odd,
                            'type' => '1x2',
                            'bookmaker' => null
                        ];
                    }
                }
            }
            // Goals Over/Under - bet ID 5 or Over/Under Line - bet ID 36 or Match Goals - bet ID 25
            elseif ($betId == 5 || $betId == 36 || $betId == 25) {
                foreach ($bet['values'] as $value) {
                    if (!isset($value['value']) || !isset($value['odd']) || ($value['suspended'] ?? false)) continue;
                    
                    $label = $value['value'];
                    $odd = floatval($value['odd']);
                    $handicap = $value['handicap'] ?? null;
                    
                    // Use handicap if available, otherwise extract from label
                    $valueNum = $handicap;
                    if (!$valueNum) {
                        preg_match('/(\d+\.?\d*)/', $label, $matches);
                        $valueNum = $matches[1] ?? null;
                    }
                    
                    if (stripos($label, 'Over') !== false && $valueNum) {
                        $outcomes[] = [
                            'label' => 'Тотал Б',
                            'odd' => $odd,
                            'type' => 'total',
                            'value' => $valueNum,
                            'bookmaker' => null
                        ];
                    } elseif (stripos($label, 'Under') !== false && $valueNum) {
                        $outcomes[] = [
                            'label' => 'Тотал М',
                            'odd' => $odd,
                            'type' => 'total',
                            'value' => $valueNum,
                            'bookmaker' => null
                        ];
                    }
                }
            }
            // Asian Handicap - bet ID 4 or 33
            elseif ($betId == 4 || $betId == 33) {
                foreach ($bet['values'] as $value) {
                    if (!isset($value['value']) || !isset($value['odd']) || ($value['suspended'] ?? false)) continue;
                    
                    $label = $value['value'];
                    $odd = floatval($value['odd']);
                    $handicap = $value['handicap'] ?? null;
                    
                    // Use handicap if available, otherwise extract from label
                    $valueNum = $handicap;
                    if ($valueNum === null) {
                        preg_match('/([+-]?\d+\.?\d*)/', $label, $matches);
                        $valueNum = $matches[1] ?? null;
                    }
                    
                    if (stripos($label, 'Home') !== false && $valueNum !== null) {
                        $outcomes[] = [
                            'label' => 'Фора 1',
                            'odd' => $odd,
                            'type' => 'fora',
                            'value' => $valueNum,
                            'bookmaker' => null
                        ];
                    } elseif (stripos($label, 'Away') !== false && $valueNum !== null) {
                        $outcomes[] = [
                            'label' => 'Фора 2',
                            'odd' => $odd,
                            'type' => 'fora',
                            'value' => $valueNum,
                            'bookmaker' => null
                        ];
                    }
                }
            }
            // Both Teams To Score (BTTS) - bet ID 8 or bet ID 69
            elseif ($betId == 8 || $betId == 69) {
                foreach ($bet['values'] as $value) {
                    if (!isset($value['value']) || !isset($value['odd']) || ($value['suspended'] ?? false)) continue;
                    
                    $label = $value['value'];
                    $odd = floatval($value['odd']);
                    
                    if (stripos($label, 'Yes') !== false || stripos($label, 'да') !== false) {
                        $outcomes[] = [
                            'label' => 'Обе забьют: Да',
                            'odd' => $odd,
                            'type' => 'btts',
                            'bookmaker' => null
                        ];
                    } elseif (stripos($label, 'No') !== false || stripos($label, 'нет') !== false) {
                        $outcomes[] = [
                            'label' => 'Обе забьют: Нет',
                            'odd' => $odd,
                            'type' => 'btts',
                            'bookmaker' => null
                        ];
                    }
                }
            }
            // Double Chance - bet ID 12 or bet ID 72
            elseif ($betId == 12 || $betId == 72) {
                foreach ($bet['values'] as $value) {
                    if (!isset($value['value']) || !isset($value['odd']) || ($value['suspended'] ?? false)) continue;
                    
                    $label = $value['value'];
                    $odd = floatval($value['odd']);
                    
                    // Handle different formats: 1X, 12, X2 or "Home or Draw", "Away or Draw", "Home or Away"
                    if (preg_match('/^(1X|12|X2)$/i', $label)) {
                        $outcomes[] = [
                            'label' => 'Двойной шанс: ' . strtoupper($label),
                            'odd' => $odd,
                            'type' => 'double_chance',
                            'bookmaker' => null
                        ];
                    } elseif (stripos($label, 'Home or Draw') !== false || stripos($label, '1X') !== false) {
                        $outcomes[] = [
                            'label' => 'Двойной шанс: 1X',
                            'odd' => $odd,
                            'type' => 'double_chance',
                            'bookmaker' => null
                        ];
                    } elseif (stripos($label, 'Away or Draw') !== false || stripos($label, 'X2') !== false) {
                        $outcomes[] = [
                            'label' => 'Двойной шанс: X2',
                            'odd' => $odd,
                            'type' => 'double_chance',
                            'bookmaker' => null
                        ];
                    } elseif (stripos($label, 'Home or Away') !== false || stripos($label, '12') !== false) {
                        $outcomes[] = [
                            'label' => 'Двойной шанс: 12',
                            'odd' => $odd,
                            'type' => 'double_chance',
                            'bookmaker' => null
                        ];
                    }
                }
            }
        }
    }
    // Process regular format (with bookmakers)
    elseif ($isRegularFormat) {
        // Process all bookmakers to get all available odds
        foreach ($odds['bookmakers'] as $bookmaker) {
            if (!isset($bookmaker['bets']) || !is_array($bookmaker['bets'])) {
                continue;
            }
            
            foreach ($bookmaker['bets'] as $bet) {
                if (!isset($bet['id']) || !isset($bet['values']) || !is_array($bet['values'])) {
                    continue;
                }
                
                $betId = $bet['id'];
                $betName = $bet['name'] ?? '';
                
                // Match Winner (1X2) - bet ID 1
                if ($betId == 1) {
                    foreach ($bet['values'] as $value) {
                        if (!isset($value['value']) || !isset($value['odd'])) continue;
                        
                        $label = $value['value'];
                        $odd = floatval($value['odd']);
                        
                        if ($label === 'Home' || $label === '1') {
                            $outcomes[] = [
                                'label' => '1',
                                'odd' => $odd,
                                'type' => '1x2',
                                'bookmaker' => $bookmaker['name'] ?? null
                            ];
                        } elseif ($label === 'Draw' || $label === 'X') {
                            $outcomes[] = [
                                'label' => 'X',
                                'odd' => $odd,
                                'type' => '1x2',
                                'bookmaker' => $bookmaker['name'] ?? null
                            ];
                        } elseif ($label === 'Away' || $label === '2') {
                            $outcomes[] = [
                                'label' => '2',
                                'odd' => $odd,
                                'type' => '1x2',
                                'bookmaker' => $bookmaker['name'] ?? null
                            ];
                        }
                    }
                }
                // Goals Over/Under - bet ID 5
                elseif ($betId == 5) {
                    // Add ALL totals from all bookmakers
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
                                'value' => $valueNum,
                                'bookmaker' => $bookmaker['name'] ?? null
                            ];
                        } elseif (stripos($label, 'Under') !== false && $valueNum) {
                            $outcomes[] = [
                                'label' => 'Тотал М',
                                'odd' => $odd,
                                'type' => 'total',
                                'value' => $valueNum,
                                'bookmaker' => $bookmaker['name'] ?? null
                            ];
                        }
                    }
                }
                // Asian Handicap - bet ID 4
                elseif ($betId == 4) {
                    // Add ALL handicaps from all bookmakers
                    foreach ($bet['values'] as $value) {
                        if (!isset($value['value']) || !isset($value['odd'])) continue;
                        
                        $label = $value['value'];
                        $odd = floatval($value['odd']);
                        
                        // Extract value from label like "Home -1" or "Away -1.25"
                        preg_match('/([+-]?\d+\.?\d*)/', $label, $matches);
                        $valueNum = $matches[1] ?? null;
                        
                        if (stripos($label, 'Home') !== false && $valueNum !== null) {
                            $outcomes[] = [
                                'label' => 'Фора 1',
                                'odd' => $odd,
                                'type' => 'fora',
                                'value' => $valueNum,
                                'bookmaker' => $bookmaker['name'] ?? null
                            ];
                        } elseif (stripos($label, 'Away') !== false && $valueNum !== null) {
                            $outcomes[] = [
                                'label' => 'Фора 2',
                                'odd' => $odd,
                                'type' => 'fora',
                                'value' => $valueNum,
                                'bookmaker' => $bookmaker['name'] ?? null
                            ];
                        }
                    }
                }
                // Both Teams To Score (BTTS) - bet ID 8
                elseif ($betId == 8) {
                    foreach ($bet['values'] as $value) {
                        if (!isset($value['value']) || !isset($value['odd'])) continue;
                        
                        $label = $value['value'];
                        $odd = floatval($value['odd']);
                        
                        if (stripos($label, 'Yes') !== false || stripos($label, 'да') !== false) {
                            $outcomes[] = [
                                'label' => 'Обе забьют: Да',
                                'odd' => $odd,
                                'type' => 'btts',
                                'bookmaker' => $bookmaker['name'] ?? null
                            ];
                        } elseif (stripos($label, 'No') !== false || stripos($label, 'нет') !== false) {
                            $outcomes[] = [
                                'label' => 'Обе забьют: Нет',
                                'odd' => $odd,
                                'type' => 'btts',
                                'bookmaker' => $bookmaker['name'] ?? null
                            ];
                        }
                    }
                }
                // Double Chance - bet ID 12
                elseif ($betId == 12) {
                    foreach ($bet['values'] as $value) {
                        if (!isset($value['value']) || !isset($value['odd'])) continue;
                        
                        $label = $value['value'];
                        $odd = floatval($value['odd']);
                        
                        // 1X, 12, X2
                        if (preg_match('/^(1X|12|X2)$/i', $label)) {
                            $outcomes[] = [
                                'label' => 'Двойной шанс: ' . strtoupper($label),
                                'odd' => $odd,
                                'type' => 'double_chance',
                                'bookmaker' => $bookmaker['name'] ?? null
                            ];
                        }
                    }
                }
                // Add other bet types as needed
            }
        }
        
        // Remove duplicates by keeping best odds (highest odd for each unique outcome)
        $uniqueOutcomes = [];
        foreach ($outcomes as $outcome) {
            $key = $outcome['type'] . '_' . $outcome['label'] . '_' . ($outcome['value'] ?? '');
            
            if (!isset($uniqueOutcomes[$key]) || $uniqueOutcomes[$key]['odd'] < $outcome['odd']) {
                $uniqueOutcomes[$key] = $outcome;
            }
        }
        
        $outcomes = array_values($uniqueOutcomes);
    }
    
    return [
        'matchId' => $matchId,
        'lineId' => $matchId, // Use matchId as lineId
        'home' => $home,
        'away' => $away,
        'homeLogo' => $homeLogo,
        'awayLogo' => $awayLogo,
        'league' => $league,
        'leagueLogo' => $leagueLogo,
        'leagueName' => $country ? "$country. $league" : $league,
        'startDate' => $startDate,
        'startTime' => $startTime,
        'startDateTimeISO' => $startDateTimeISO, // ISO 8601 format for timezone conversion
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
        
        if (isset($fixturesData['response']) && is_array($fixturesData['response'])) {
            // Process live matches with odds
            foreach ($fixturesData['response'] as $fixture) {
                // Filter out finished matches (FT status or Match Finished)
                $statusShort = $fixture['fixture']['status']['short'] ?? '';
                $statusLong = $fixture['fixture']['status']['long'] ?? '';
                if ($statusShort === 'FT' || $statusLong === 'Match Finished') {
                    continue;
                }
                
                // Filter out non-live matches that have already passed
                if (shouldExcludeMatchByTime($fixture)) {
                    continue;
                }
                
                $fixtureId = $fixture['fixture']['id'];
                
                // Get odds from /odds endpoint
                $oddsData = null;
                try {
                    $oddsResponse = apiSportsRequest('/odds', [
                        'fixture' => $fixtureId
                    ]);
                    if (isset($oddsResponse['response']) && !empty($oddsResponse['response'])) {
                        $oddsData = $oddsResponse['response'][0];
                    }
                } catch (Exception $e) {
                    error_log('Failed to get odds for fixture ' . $fixtureId . ': ' . $e->getMessage());
                }
                
                $match = convertFixtureToMatch($fixture, $oddsData);
                if ($match) {
                    $matches[] = $match;
                }
            }
        }
    } else {
        // Get fixtures for all days (today + 7 days)
        $allFixtures = [];
        $startDate = new DateTime($date);
        
        // Get fixtures for today and next 7 days
        for ($i = 0; $i < 8; $i++) {
            $currentDate = clone $startDate;
            $currentDate->modify("+$i days");
            $dateStr = $currentDate->format('Y-m-d');
            
            try {
                $params = ['date' => $dateStr];
                if ($league) {
                    $params['league'] = $league;
                }
                
                $fixturesData = apiSportsRequest('/fixtures', $params);
                
                if (isset($fixturesData['response']) && is_array($fixturesData['response'])) {
                    foreach ($fixturesData['response'] as $fixture) {
                        // Filter out finished matches (FT status or Match Finished)
                        $statusShort = $fixture['fixture']['status']['short'] ?? '';
                        $statusLong = $fixture['fixture']['status']['long'] ?? '';
                        if ($statusShort === 'FT' || $statusLong === 'Match Finished') {
                            continue;
                        }
                        
                        // Filter out non-live matches that have already passed
                        if (shouldExcludeMatchByTime($fixture)) {
                            continue;
                        }
                        
                        // Avoid duplicates
                        $fixtureId = $fixture['fixture']['id'];
                        if (!isset($allFixtures[$fixtureId])) {
                            $allFixtures[$fixtureId] = $fixture;
                        }
                    }
                }
            } catch (Exception $e) {
                error_log('Failed to get fixtures for date ' . $dateStr . ': ' . $e->getMessage());
            }
        }
        
        // Process fixtures efficiently:
        // - Today's matches: get odds immediately (most important)
        // - Future matches: without odds (will load on-demand when user opens details)
        $today = date('Y-m-d');
        $todayFixtures = [];
        $futureFixtures = [];
        
        foreach ($allFixtures as $fixtureId => $fixture) {
            $fixtureDate = date('Y-m-d', strtotime($fixture['fixture']['date']));
            if ($fixtureDate === $today) {
                $todayFixtures[$fixtureId] = $fixture;
            } else {
                $futureFixtures[$fixtureId] = $fixture;
            }
        }
        
        // Process today's matches WITH odds (using parallel requests for speed)
        $todayWithOdds = array_slice($todayFixtures, 0, 50, true); // First 50 with odds
        $todayWithoutOdds = array_slice($todayFixtures, 50, null, true); // Rest without odds
        
        // Prepare batch requests for odds
        // First try /odds/live for all matches, then fallback to /odds if needed
        $oddsRequests = [];
        foreach ($todayWithOdds as $fixtureId => $fixture) {
            // Check if match is live
            $isLive = !empty($fixture['fixture']['status']['elapsed']);
            $endpoint = $isLive ? '/odds/live' : '/odds';
            
            $oddsRequests[$fixtureId] = [
                'endpoint' => $endpoint,
                'params' => ['fixture' => $fixtureId]
            ];
        }
        
        // Execute all odds requests in parallel
        $oddsResults = [];
        if (!empty($oddsRequests)) {
            $oddsResults = apiSportsRequestBatch($oddsRequests);
        }
        
        // Process today's matches with odds
        foreach ($todayWithOdds as $fixtureId => $fixture) {
            // Filter out non-live matches that have already passed
            if (shouldExcludeMatchByTime($fixture)) {
                continue;
            }
            
            // Get odds from batch results
            $oddsData = null;
            if (isset($oddsResults[$fixtureId]) && isset($oddsResults[$fixtureId]['data'])) {
                $oddsResponse = $oddsResults[$fixtureId]['data'];
                if (isset($oddsResponse['response']) && !empty($oddsResponse['response'])) {
                    $oddsData = $oddsResponse['response'][0];
                }
            }
            
            $match = convertFixtureToMatch($fixture, $oddsData);
            if ($match) {
                $matches[] = $match;
            }
        }
        
        // Process rest of today's matches without odds
        foreach ($todayWithoutOdds as $fixtureId => $fixture) {
            // Filter out non-live matches that have already passed
            if (shouldExcludeMatchByTime($fixture)) {
                continue;
            }
            
            $match = convertFixtureToMatch($fixture, null);
            if ($match) {
                $matches[] = $match;
            }
        }
        
        // Process future matches WITHOUT odds (for speed)
        // Odds will be loaded when user opens match detail page
        foreach ($futureFixtures as $fixtureId => $fixture) {
            // Filter out non-live matches that have already passed
            if (shouldExcludeMatchByTime($fixture)) {
                continue;
            }
            
            $match = convertFixtureToMatch($fixture, null);
            if ($match) {
                $matches[] = $match;
            }
        }
    }
    
    // Return in the same format as the old API
    // Sort matches: live first, then by date/time
    usort($matches, function($a, $b) {
        // Live matches first
        if ($a['isLive'] && !$b['isLive']) return -1;
        if (!$a['isLive'] && $b['isLive']) return 1;
        // Then by date/time
        $dateA = strtotime($a['startDate'] . ' ' . $a['startTime']);
        $dateB = strtotime($b['startDate'] . ' ' . $b['startTime']);
        return $dateA - $dateB;
    });
    
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
