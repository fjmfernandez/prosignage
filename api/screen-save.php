<?php
require __DIR__ . '/../bootstrap.php';
require_auth();

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    json_response(['ok' => false, 'message' => 'Method not allowed'], 405);
}

csrf_check();
$input = json_input();
$screenId = (int)($input['screen_id'] ?? 0);
$screen = screen_row_by_id($screenId);

if (!$screen || !user_can_manage_group((int)$screen['group_id'])) {
    json_response(['ok' => false, 'message' => 'No autorizado'], 403);
}

$name = trim((string)($input['name'] ?? ''));
$orientation = (string)($input['orientation'] ?? 'landscape');
$widgets = normalize_widgets(is_array($input['widgets'] ?? null) ? $input['widgets'] : []);
$slidesInput = is_array($input['slides'] ?? null) ? $input['slides'] : [];

if ($name === '') {
    json_response(['ok' => false, 'message' => 'El nombre es obligatorio'], 422);
}

if (!in_array($orientation, ['landscape', 'portrait'], true)) {
    $orientation = 'landscape';
}

$slides = [];
foreach ($slidesInput as $index => $slide) {
    if (!is_array($slide)) {
        continue;
    }

    $url = trim((string)($slide['url'] ?? ''));
    if ($url === '') {
        continue;
    }

    $type = (string)($slide['type'] ?? infer_content_type($url));
    if (!in_array($type, ['image', 'video', 'web'], true)) {
        $type = infer_content_type($url);
    }

    $fit = (string)($slide['fit'] ?? 'contain');
    if (!in_array($fit, ['contain', 'cover', 'fill'], true)) {
        $fit = 'contain';
    }

    $startTime = preg_match('/^\d{2}:\d{2}$/', (string)($slide['startTime'] ?? '')) ? (string)$slide['startTime'] : '00:00';
    $endTime = preg_match('/^\d{2}:\d{2}$/', (string)($slide['endTime'] ?? '')) ? (string)$slide['endTime'] : '23:59';

    $slides[] = [
        'name' => trim((string)($slide['name'] ?? '')) ?: ('Slide ' . ($index + 1)),
        'type' => $type,
        'url' => $url,
        'fit' => $fit,
        'duration' => max(1, min(3600, (int)($slide['duration'] ?? 10))),
        'days' => normalize_days_array($slide['days'] ?? []),
        'startTime' => $startTime,
        'endTime' => $endTime,
        'sortOrder' => $index,
    ];
}

try {
    $db->beginTransaction();

    $updateSt = $db->prepare(
        "UPDATE screens
         SET name = ?, orientation = ?, widgets_json = ?
         WHERE id = ? AND company_id = ?"
    );
    $updateSt->execute([
        $name,
        $orientation,
        json_encode($widgets, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $screenId,
        current_company_id(),
    ]);

    $db->prepare("DELETE FROM screen_slides WHERE screen_id = ?")->execute([$screenId]);
    $insertSlideSt = $db->prepare(
        "INSERT INTO screen_slides
         (screen_id, name, content_type, source_url, fit_mode, duration_seconds, days_json, start_time, end_time, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );

    foreach ($slides as $slide) {
        $insertSlideSt->execute([
            $screenId,
            $slide['name'],
            $slide['type'],
            $slide['url'],
            $slide['fit'],
            $slide['duration'],
            json_encode($slide['days'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $slide['startTime'] . ':00',
            $slide['endTime'] . ':00',
            $slide['sortOrder'],
        ]);
    }

    $db->commit();
    audit_log('screen.save', 'Configuracion de pantalla guardada', 'screen', $screenId, ['slide_count' => count($slides)]);
    json_response(['ok' => true, 'message' => 'Pantalla guardada']);
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    json_response(['ok' => false, 'message' => $e->getMessage()], 500);
}
