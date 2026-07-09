<?php
require __DIR__ . '/bootstrap.php';

$screenPublicId = (string)($_GET['screen'] ?? '');
$key = (string)($_GET['key'] ?? '');
?><!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <title><?= e(app_name()) ?> Player</title>
    <link rel="icon" href="<?= e(app_logo_url()) ?>" type="image/png">
    <link rel="stylesheet" href="<?= e(app_url('assets/css/app.css?v=sql1')) ?>">
</head>
<body class="player-body">
    <div id="stage" class="player-stage">
        <div id="content"></div>
        <img id="logo" alt="" class="p-logo" style="display:none">
        <div id="clock" class="p-clock" style="display:none"></div>
        <div id="bar" class="bottom-bar" style="display:none">
            <div id="weather" class="weather" style="display:none"></div>
            <div id="ticker" class="ticker" style="display:none"><div id="tickerTxt" class="ticker-move"></div></div>
        </div>
        <div id="status" class="status-badge"><span id="dot"></span><span id="hint">offline</span></div>
        <div id="fallback" class="fallback-screen" style="display:none">
            <div class="fallback-box">
                <h1><?= e(app_name()) ?></h1>
                <p>No hay configuracion disponible para esta pantalla.</p>
                <code>Usa una URL con screen y key validos.</code>
            </div>
        </div>
    </div>
    <script>
    window.PROSIGNAGE_PLAYER = <?= json_encode([
        'screen' => $screenPublicId,
        'key' => $key,
        'bootstrapUrl' => app_url('api/player-bootstrap.php'),
        'heartbeatUrl' => app_url('api/player-heartbeat.php'),
        'commandUrl' => app_url('api/player-command.php'),
        'commandAckUrl' => app_url('api/player-command-ack.php'),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
    </script>
    <script src="<?= e(app_url('assets/js/player.js?v=sql1')) ?>"></script>
</body>
</html>
