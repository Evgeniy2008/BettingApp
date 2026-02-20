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

try {
    // Get fixture ID from request
    $fixtureId = $_GET['fixture'] ?? $_GET['matchId'] ?? null;
    
    if (!$fixtureId) {
        sendJSON([
            'ok' => false,
            'error' => 'Fixture ID is required'
        ], 400);
    }
    
    // Get fixture details
    $fixturesData = apiSportsRequest('/fixtures', [
        'id' => $fixtureId
    ]);
    
    if (!isset($fixturesData['response']) || empty($fixturesData['response'])) {
        sendJSON([
            'ok' => false,
            'error' => 'Fixture not found'
        ], 404);
    }
    
    $fixture = $fixturesData['response'][0];
    
    // Get all odds from all bookmakers
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
    
    // Build match info
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
    
    if ($isLive || $isFinished) {
        $liveTime = $fixture['fixture']['status']['elapsed'] ?? null;
        if ($liveTime !== null) {
            $liveTime = $liveTime . "'";
        }
        $livePeriod = $fixture['fixture']['status']['short'] ?? null;
        if (isset($fixture['goals']['home']) && isset($fixture['goals']['away'])) {
            $score = [
                'home' => (int)$fixture['goals']['home'],
                'away' => (int)$fixture['goals']['away']
            ];
        }
    }
    
    // Build all odds from all bookmakers
    $allOdds = [];
    
    if ($oddsData && isset($oddsData['bookmakers']) && is_array($oddsData['bookmakers'])) {
        foreach ($oddsData['bookmakers'] as $bookmaker) {
            $bookmakerId = $bookmaker['id'] ?? null;
            $bookmakerName = $bookmaker['name'] ?? 'Unknown';
            
            if (!isset($bookmaker['bets']) || !is_array($bookmaker['bets'])) {
                continue;
            }
            
            $bookmakerOdds = [
                'id' => $bookmakerId,
                'name' => $bookmakerName,
                'bets' => []
            ];
            
            foreach ($bookmaker['bets'] as $bet) {
                if (!isset($bet['id']) || !isset($bet['name']) || !isset($bet['values']) || !is_array($bet['values'])) {
                    continue;
                }
                
                $betData = [
                    'id' => $bet['id'],
                    'name' => $bet['name'],
                    'values' => []
                ];
                
                foreach ($bet['values'] as $value) {
                    if (!isset($value['value']) || !isset($value['odd'])) {
                        continue;
                    }
                    
                    $betData['values'][] = [
                        'value' => $value['value'],
                        'odd' => floatval($value['odd'])
                    ];
                }
                
                if (!empty($betData['values'])) {
                    $bookmakerOdds['bets'][] = $betData;
                }
            }
            
            if (!empty($bookmakerOdds['bets'])) {
                $allOdds[] = $bookmakerOdds;
            }
        }
    }
    
    // Return match detail with all odds
    sendJSON([
        'ok' => true,
        'match' => [
            'matchId' => $matchId,
            'home' => $home,
            'away' => $away,
            'league' => $league,
            'leagueName' => $country ? "$country. $league" : $league,
            'startDate' => $startDate,
            'startTime' => $startTime,
            'isLive' => $isLive,
            'isFinished' => $isFinished,
            'liveTime' => $liveTime,
            'livePeriod' => $livePeriod,
            'score' => $score,
            'status' => $status
        ],
        'odds' => $allOdds,
        'meta' => [
            'bookmakerCount' => count($allOdds),
            'fetchedAt' => date('c')
        ]
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    sendJSON([
        'ok' => false,
        'error' => $e->getMessage()
    ]);
}
