<?php
require __DIR__ . '/../bootstrap.php';

$screen = (string)($_GET['screen'] ?? '');
$key = (string)($_GET['key'] ?? '');

if ($screen === '' || $key === '') {
    json_response(['ok' => false, 'message' => 'Parametros incompletos'], 422);
}

$st = $db->prepare("SELECT id FROM screens WHERE public_id = ? AND player_key = ? LIMIT 1");
$st->execute([$screen, $key]);
$screenRow = $st->fetch();
if (!$screenRow) {
    json_response(['ok' => false, 'message' => 'Pantalla no encontrada'], 404);
}

$cmdSt = $db->prepare(
    "SELECT *
     FROM screen_commands
     WHERE screen_id = ? AND status_name = 'pending'
     ORDER BY id ASC
     LIMIT 1"
);
$cmdSt->execute([(int)$screenRow['id']]);
$command = $cmdSt->fetch();

if (!$command) {
    json_response(['ok' => true, 'command' => null]);
}

if (empty($command['delivered_at'])) {
    $db->prepare("UPDATE screen_commands SET delivered_at = NOW() WHERE id = ?")->execute([(int)$command['id']]);
}

$payload = parse_json_array($command['payload_json'] ?? null, []);
$payload['id'] = (int)$command['id'];
$payload['action'] = $command['action_name'];

json_response(['ok' => true, 'command' => $payload]);
