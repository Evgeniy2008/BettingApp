<?php
require_once 'config.php';

// API-Sports configuration
define('API_SPORTS_BASE_URL', 'https://v3.football.api-sports.io');
define('API_SPORTS_KEY', 'e0159591de2cf3d1b077fc4af39fbfef');

/**
 * Makes a request to API-Sports
 */
function apiSportsRequest($endpoint) {
    $url = API_SPORTS_BASE_URL . $endpoint;
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'x-apisports-key: ' . API_SPORTS_KEY,
        'x-rapidapi-key: ' . API_SPORTS_KEY,
    ]);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        return ['error' => 'API request failed', 'code' => $httpCode];
    }
    
    return json_decode($response, true);
}

// Get leagues for a specific country
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['country'])) {
    $country = $_GET['country'];
    $result = apiSportsRequest('/leagues?country=' . urlencode($country));
    
    if (isset($result['error'])) {
        sendJSON($result, 500);
    }
    
    sendJSON([
        'ok' => true,
        'leagues' => $result['response'] ?? []
    ]);
}

sendJSON(['error' => 'Country parameter is required'], 400);
