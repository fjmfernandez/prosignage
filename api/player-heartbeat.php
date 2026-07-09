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

$currentSlide = is_array($input['currentSlide'] ?? null) ? $input['currentSlide'] : [];

$updateSt = $db->prepare(
    "UPDATE screens
     SET last_seen_at = NOW(),
         status_name = 'online',
         public_ip = ?,
         private_ip = ?,
         browser_name = ?,
         os_name = ?,
         screen_resolution = ?,
         connection_type = ?,
         connection_speed = ?,
         user_agent = ?,
         is_kiosk = ?,
         kiosk_version = ?,
         current_slide_name = ?,
         current_slide_type = ?,
         current_slide_url = ?
     WHERE id = ?"
);

$updateSt->execute([
    trim((string)($input['publicIP'] ?? '')) ?: null,
    trim((string)($input['privateIP'] ?? '')) ?: null,
    trim((string)($input['browser'] ?? '')) ?: null,
    trim((string)($input['os'] ?? '')) ?: null,
    trim((string)($input['screenResolution'] ?? '')) ?: null,
    trim((string)($input['connectionType'] ?? '')) ?: null,
    trim((string)($input['connectionSpeed'] ?? '')) ?: null,
    trim((string)($input['userAgent'] ?? '')) ?: null,
    !empty($input['isFreeKiosk']) ? 1 : 0,
    trim((string)($input['freekioskVersion'] ?? '')) ?: null,
    trim((string)($currentSlide['name'] ?? '')) ?: null,
    trim((string)($currentSlide['type'] ?? '')) ?: null,
    trim((string)($currentSlide['url'] ?? '')) ?: null,
    (int)$screenRow['id'],
]);

json_response(['ok' => true]);
