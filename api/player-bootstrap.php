<?php
require __DIR__ . '/../bootstrap.php';

$screen = (string)($_GET['screen'] ?? '');
$key = (string)($_GET['key'] ?? '');
header('Cache-Control: no-store, private');

if ($screen === '' || $key === '') {
    json_response(['ok' => false, 'message' => 'Parametros incompletos'], 422);
}

$payload = screen_payload_by_credentials($screen, $key);
if (!$payload) {
    json_response(['ok' => false, 'message' => 'Pantalla no encontrada'], 404);
}

$knownRevision = (string)($_GET['revision'] ?? '');
if ($knownRevision !== '' && hash_equals($payload['revision'], $knownRevision)) {
    json_response(['ok' => true, 'unchanged' => true, 'revision' => $payload['revision']]);
}

json_response(['ok' => true, 'data' => $payload]);
