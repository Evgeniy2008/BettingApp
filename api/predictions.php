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
    
    // Get predictions from API-Sports
    $predictionsData = apiSportsRequest('/predictions', [
        'fixture' => $fixtureId
    ]);
    
    if (!isset($predictionsData['response']) || empty($predictionsData['response'])) {
        sendJSON([
            'ok' => false,
            'error' => 'Predictions not found for this fixture'
        ], 404);
    }
    
    // Return predictions data in the expected format
    sendJSON([
        'ok' => true,
        'response' => $predictionsData['response'],
        'meta' => [
            'results' => $predictionsData['results'] ?? 0,
            'paging' => $predictionsData['paging'] ?? null,
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
