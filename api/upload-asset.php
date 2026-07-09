<?php
require __DIR__ . '/../bootstrap.php';
require_auth();

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    json_response(['ok' => false, 'message' => 'Method not allowed'], 405);
}

csrf_check();
$screenId = (int)($_POST['screen_id'] ?? 0);
$kind = (string)($_POST['kind'] ?? 'media');
$screen = screen_row_by_id($screenId);

if (!$screen || !user_can_manage_group((int)$screen['group_id'])) {
    json_response(['ok' => false, 'message' => 'No autorizado'], 403);
}

if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
    json_response(['ok' => false, 'message' => 'No se recibio archivo'], 422);
}

$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    json_response(['ok' => false, 'message' => 'Error al subir archivo'], 422);
}

$config = app_config();
$maxBytes = max(1, (int)$config['uploads']['max_mb']) * 1024 * 1024;
$size = (int)($file['size'] ?? 0);
if ($size <= 0 || $size > $maxBytes) {
    json_response(['ok' => false, 'message' => 'Archivo demasiado grande'], 422);
}

$tmpName = (string)$file['tmp_name'];
$originalName = (string)$file['name'];
$mimeType = (string)($file['type'] ?? 'application/octet-stream');
$ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
$safeBase = preg_replace('/[^a-zA-Z0-9_-]+/', '-', pathinfo($originalName, PATHINFO_FILENAME));
$safeBase = trim((string)$safeBase, '-');
$safeBase = $safeBase !== '' ? $safeBase : 'asset';
$storedName = date('YmdHis') . '-' . $safeBase . '-' . substr(random_token(6), 0, 12) . ($ext ? '.' . $ext : '');
$relativeDir = 'screens/' . (int)$screen['group_id'] . '/' . (int)$screen['id'];
$targetDir = rtrim($config['uploads']['dir'], '/\\') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativeDir);

if (!is_dir($targetDir) && !mkdir($targetDir, 0775, true) && !is_dir($targetDir)) {
    json_response(['ok' => false, 'message' => 'No se pudo crear el directorio de destino'], 500);
}

$targetPath = $targetDir . DIRECTORY_SEPARATOR . $storedName;
if (!move_uploaded_file($tmpName, $targetPath)) {
    json_response(['ok' => false, 'message' => 'No se pudo mover el archivo'], 500);
}

$relativePath = $relativeDir . '/' . $storedName;
$publicPath = rtrim($config['uploads']['url'], '/') . '/' . $relativePath;
$publicUrl = app_url($publicPath);

$assetSt = $db->prepare(
    "INSERT INTO assets (company_id, group_id, kind, original_name, stored_name, stored_path, mime_type, size_bytes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
$assetSt->execute([
    current_company_id(),
    (int)$screen['group_id'],
    in_array($kind, ['media', 'logo'], true) ? $kind : 'media',
    $originalName,
    $storedName,
    $relativePath,
    $mimeType,
    $size,
    (int)(current_user()['id'] ?? 0),
]);

audit_log('asset.upload', 'Archivo subido', 'screen', $screenId, ['path' => $relativePath, 'kind' => $kind]);

json_response([
    'ok' => true,
    'message' => 'Archivo subido correctamente',
    'asset' => [
        'url' => $publicUrl,
        'name' => pathinfo($originalName, PATHINFO_FILENAME),
        'type' => infer_content_type($publicUrl, $mimeType),
        'mime' => $mimeType,
        'size' => $size,
    ],
]);
