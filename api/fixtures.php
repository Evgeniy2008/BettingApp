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
        'x-rapidapi-key: ' . API_SPORTS_KEY,
        'Accept: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    
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

try {
    // Get league ID from request
    $leagueId = $_GET['league'] ?? $_GET['id'] ?? null;
    $season = $_GET['season'] ?? date('Y'); // Default to current year
    $date = $_GET['date'] ?? null; // Optional date filter
    
    if (!$leagueId) {
        sendJSON([
            'ok' => false,
            'error' => 'League ID is required'
        ], 400);
    }
    
    // Build parameters for fixtures API
    $params = [
        'league' => $leagueId,
        'season' => $season
    ];
    
    // Add date filter if provided
    if ($date) {
        $params['date'] = $date;
    }
    
    // Get fixtures from API-Sports
    $fixturesData = apiSportsRequest('/fixtures', $params);
    
    if (!isset($fixturesData['response']) || empty($fixturesData['response'])) {
        sendJSON([
            'ok' => true,
            'matches' => []
        ]);
    }
    
    // Convert fixtures to match format
    $matches = [];
    foreach ($fixturesData['response'] as $fixture) {
        $fixtureData = $fixture['fixture'];
        $leagueData = $fixture['league'];
        $teams = $fixture['teams'];
        $goals = $fixture['goals'] ?? null;
        $score = $fixture['score'] ?? null;
        
        // Check if match is live or finished
        $status = $fixtureData['status']['long'] ?? '';
        $isFinished = ($status === 'Match Finished' || $status === 'Match Cancelled' || $status === 'Match Postponed');
        $isLive = !$isFinished && ($fixtureData['status']['elapsed'] !== null);
        
        // Format date and time
        $dateTime = new DateTime($fixtureData['date']);
        $startDate = $dateTime->format('d.m');
        $startTime = $dateTime->format('H:i');
        $startDateTimeISO = $dateTime->format('c');
        
        // Get live time and score if available
        $liveTime = null;
        $livePeriod = null;
        $matchScore = null;
        
        if ($isLive || $isFinished) {
            $liveTime = $fixtureData['status']['elapsed'] ?? null;
            if ($liveTime !== null) {
                $liveTime = $liveTime . "'";
            }
            $livePeriod = $fixtureData['status']['short'] ?? null;
            if ($goals && isset($goals['home']) && isset($goals['away'])) {
                $matchScore = [
                    'home' => (int)$goals['home'],
                    'away' => (int)$goals['away']
                ];
            }
        }
        
        // Build league name
        $leagueName = $leagueData['country'] ? $leagueData['country'] . '. ' . $leagueData['name'] : $leagueData['name'];
        
        $match = [
            'matchId' => (string)$fixtureData['id'],
            'lineId' => (string)$fixtureData['id'],
            'league' => (string)$leagueData['id'],
            'leagueName' => $leagueName,
            'leagueLogo' => $leagueData['logo'] ?? null,
            'home' => $teams['home']['name'],
            'away' => $teams['away']['name'],
            'homeLogo' => $teams['home']['logo'] ?? null,
            'awayLogo' => $teams['away']['logo'] ?? null,
            'startDate' => $startDate,
            'startTime' => $startTime,
            'startDateTimeISO' => $startDateTimeISO,
            'isLive' => $isLive,
            'isFinished' => $isFinished,
            'liveTime' => $liveTime,
            'livePeriod' => $livePeriod,
            'score' => $matchScore,
            'status' => $status,
            'outcomes' => [] // Will be populated from predictions if needed
        ];
        
        $matches[] = $match;
    }
    
    sendJSON([
        'ok' => true,
        'matches' => $matches
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    sendJSON([
        'ok' => false,
        'error' => $e->getMessage()
    ]);
}
