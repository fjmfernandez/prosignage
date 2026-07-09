<?php
require __DIR__ . '/../bootstrap.php';

$screen = (string)($_GET['screen'] ?? '');
$key = (string)($_GET['key'] ?? '');

if ($screen === '' || $key === '') {
    json_response(['ok' => false, 'message' => 'Parametros incompletos'], 422);
}

$payload = screen_payload_by_credentials($screen, $key);
if (!$payload) {
    json_response(['ok' => false, 'message' => 'Pantalla no encontrada'], 404);
}

json_response(['ok' => true, 'data' => $payload]);
