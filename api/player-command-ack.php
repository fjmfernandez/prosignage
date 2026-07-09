<?php
require __DIR__ . '/../bootstrap.php';

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    json_response(['ok' => false, 'message' => 'Method not allowed'], 405);
}

$screen = (string)($_GET['screen'] ?? '');
$key = (string)($_GET['key'] ?? '');
$input = json_input();

if ($screen === '' || $key === '') {
    json_response(['ok' => false, 'message' => 'Parametros incompletos'], 422);
}

$st = $db->prepare("SELECT id FROM screens WHERE public_id = ? AND player_key = ? LIMIT 1");
$st->execute([$screen, $key]);
$screenRow = $st->fetch();
if (!$screenRow) {
    json_response(['ok' => false, 'message' => 'Pantalla no encontrada'], 404);
}

$commandId = (int)($input['commandId'] ?? 0);
$status = (string)($input['status'] ?? 'failed');
if (!in_array($status, ['executed', 'failed'], true)) {
    $status = 'failed';
}

$message = trim((string)($input['message'] ?? '')) ?: null;

$updateSt = $db->prepare(
    "UPDATE screen_commands
     SET status_name = ?, executed_at = NOW(), result_message = ?
     WHERE id = ? AND screen_id = ?"
);
$updateSt->execute([$status, $message, $commandId, (int)$screenRow['id']]);

json_response(['ok' => true]);
