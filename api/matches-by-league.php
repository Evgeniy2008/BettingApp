<?php
require_once 'config.php';
require_once 'matches.php'; // Use functions from matches.php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get league ID from query parameter
$leagueId = $_GET['league'] ?? null;

if (!$leagueId) {
    sendJSON(['error' => 'League ID is required'], 400);
}

// Extract API league ID from format "api-{leagueId}"
$apiLeagueId = $leagueId;
if (strpos($leagueId, 'api-') === 0) {
    $apiLeagueId = substr($leagueId, 4);
}

// Validate league ID is numeric
if (!is_numeric($apiLeagueId)) {
    sendJSON(['error' => 'Invalid league ID format'], 400);
}

try {
    // Get current date and next 7 days
    $today = new DateTime();
    $allMatches = [];
    
    // Get fixtures for today and next 7 days
    for ($i = 0; $i < 8; $i++) {
        $date = clone $today;
        $date->modify("+$i days");
        $dateStr = $date->format('Y-m-d');
        
        try {
            $params = [
                'league' => (int)$apiLeagueId,
                'date' => $dateStr,
                'timezone' => 'UTC'
            ];
            
            $fixturesData = apiSportsRequest('/fixtures', $params);
            
            if (isset($fixturesData['response']) && is_array($fixturesData['response'])) {
                foreach ($fixturesData['response'] as $fixture) {
                    $fixtureId = (string)$fixture['fixture']['id'];
                    if (!isset($allMatches[$fixtureId])) {
                        $allMatches[$fixtureId] = $fixture;
                    }
                }
            }
        } catch (Exception $e) {
            error_log('Failed to get fixtures for date ' . $dateStr . ' and league ' . $apiLeagueId . ': ' . $e->getMessage());
            continue;
        }
    }
    
    // If no matches found, return empty array instead of error
    if (empty($allMatches)) {
        sendJSON([
            'ok' => true,
            'matches' => [],
            'count' => 0,
            'message' => 'No matches found for this league'
        ]);
    }
    
    // Convert fixtures to match format
    $matches = [];
    foreach ($allMatches as $fixture) {
        // Get odds for this fixture
        $odds = null;
        try {
            $oddsData = apiSportsRequest('/odds', [
                'fixture' => $fixture['fixture']['id'],
                'bookmaker' => 8 // Bet365
            ]);
            if (isset($oddsData['response']) && !empty($oddsData['response'])) {
                $odds = $oddsData['response'][0];
            }
        } catch (Exception $e) {
            // Continue without odds
        }
        
        $match = convertFixtureToMatch($fixture, $odds);
        // Add league ID and country from API Sports
        $match['leagueId'] = (string)$fixture['league']['id'];
        $match['country'] = $fixture['league']['country'] ?? '';
        $match['leagueLogo'] = $fixture['league']['logo'] ?? null;
        $matches[] = $match;
    }
    
    sendJSON([
        'ok' => true,
        'matches' => $matches,
        'count' => count($matches)
    ]);
    
} catch (Exception $e) {
    error_log('Error getting matches by league: ' . $e->getMessage());
    sendJSON(['error' => $e->getMessage()], 500);
}
