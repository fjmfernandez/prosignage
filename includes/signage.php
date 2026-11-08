<?php
function default_widgets(): array
{
    return [
        'clock' => [
            'show' => true,
            'pos' => 'pos-top-right',
            'size' => 'medium',
            'color' => '#ffffff',
        ],
        'ticker' => [
            'active' => false,
            'mode' => 'manual',
            'text' => '',
            'rssUrl' => '',
            'speed' => 18,
            'fontSize' => 14,
            'color' => '#ffffff',
        ],
        'weather' => [
            'show' => false,
            'city' => '',
            'layout' => 'horizontal',
        ],
        'logo' => [
            'show' => false,
            'url' => '',
            'pos' => 'pos-top-left',
            'size' => 15,
        ],
        'rssSidebar' => [
            'show' => false,
            'url' => '',
            'pos' => 'pos-top-right',
        ],
    ];
}

function normalize_widgets(array $widgets): array
{
    $defaults = default_widgets();
    $out = $defaults;

    foreach ($defaults as $section => $sectionDefaults) {
        if (!isset($widgets[$section]) || !is_array($widgets[$section])) {
            continue;
        }
        foreach ($sectionDefaults as $key => $defaultValue) {
            if (array_key_exists($key, $widgets[$section])) {
                $out[$section][$key] = $widgets[$section][$key];
            }
        }
    }

    $out['clock']['show'] = !empty($out['clock']['show']);
    $out['ticker']['active'] = !empty($out['ticker']['active']);
    $out['weather']['show'] = !empty($out['weather']['show']);
    $out['logo']['show'] = !empty($out['logo']['show']);
    $out['rssSidebar']['show'] = !empty($out['rssSidebar']['show']);

    $out['ticker']['speed'] = max(8, (int)$out['ticker']['speed']);
    $out['ticker']['fontSize'] = max(10, (int)$out['ticker']['fontSize']);
    $out['logo']['size'] = max(5, min(40, (int)$out['logo']['size']));

    return $out;
}

function generate_public_id(): string
{
    return bin2hex(random_bytes(8));
}

function generate_player_key(): string
{
    return random_token(24);
}

function accessible_group_ids_for_user(?array $user = null): array
{
    $user = $user ?? current_user();
    if (!$user) {
        return [];
    }

    if (($user['role'] ?? '') === 'admin') {
        $st = db()->prepare("SELECT id FROM screen_groups WHERE company_id = ? ORDER BY name ASC");
        $st->execute([(int)$user['company_id']]);
        return array_map('intval', array_column($st->fetchAll(), 'id'));
    }

    $st = db()->prepare(
        "SELECT group_id
         FROM group_user_assignments
         WHERE user_id = ?
         ORDER BY group_id ASC"
    );
    $st->execute([(int)$user['id']]);
    return array_map('intval', array_column($st->fetchAll(), 'group_id'));
}

function user_can_access_group(int $groupId, ?array $user = null): bool
{
    $user = $user ?? current_user();
    if (!$user) {
        return false;
    }

    if (($user['role'] ?? '') === 'admin') {
        return true;
    }

    return in_array($groupId, accessible_group_ids_for_user($user), true);
}

function user_can_manage_group(int $groupId, ?array $user = null): bool
{
    $user = $user ?? current_user();
    if (!$user) {
        return false;
    }

    return in_array(($user['role'] ?? ''), ['admin', 'editor'], true) && user_can_access_group($groupId, $user);
}

function require_group_access(int $groupId): void
{
    require_auth();
    if (!user_can_access_group($groupId)) {
        flash('error', 'No tienes acceso a este grupo.');
        redirect('admin.php');
    }
}

function screen_row_by_id(int $screenId): ?array
{
    $st = db()->prepare(
        "SELECT s.*, g.name AS group_name
         FROM screens s
         JOIN screen_groups g ON g.id = s.group_id
         WHERE s.id = ? AND s.company_id = ?
         LIMIT 1"
    );
    $st->execute([$screenId, current_company_id()]);
    return $st->fetch() ?: null;
}

function require_screen_access(int $screenId, bool $manage = false): array
{
    require_auth();
    $screen = screen_row_by_id($screenId);
    if (!$screen) {
        flash('error', 'Pantalla no encontrada.');
        redirect('admin.php');
    }

    $allowed = $manage ? user_can_manage_group((int)$screen['group_id']) : user_can_access_group((int)$screen['group_id']);
    if (!$allowed) {
        flash('error', 'No tienes acceso a esta pantalla.');
        redirect('admin.php');
    }

    return $screen;
}

function computed_screen_status(array $screen): string
{
    $lastSeen = $screen['last_seen_at'] ?? null;
    if (!$lastSeen) {
        return 'offline';
    }

    $seconds = time() - strtotime((string)$lastSeen);
    if ($seconds <= 120) {
        return 'online';
    }
    if ($seconds <= 300) {
        return 'warning';
    }
    return 'offline';
}

function format_last_seen(?string $value): string
{
    if (!$value) {
        return 'Nunca';
    }

    $seconds = time() - strtotime($value);
    if ($seconds < 60) {
        return 'Ahora';
    }
    if ($seconds < 3600) {
        return 'Hace ' . floor($seconds / 60) . ' min';
    }
    if ($seconds < 86400) {
        return 'Hace ' . floor($seconds / 3600) . ' h';
    }
    return 'Hace ' . floor($seconds / 86400) . ' d';
}

function screen_player_url(array $screen): string
{
    return app_url('player.php?screen=' . urlencode((string)$screen['public_id']) . '&key=' . urlencode((string)$screen['player_key']));
}

function infer_content_type(string $url, ?string $mime = null): string
{
    $mime = strtolower((string)$mime);
    if (str_starts_with($mime, 'video/')) {
        return 'video';
    }
    if (str_starts_with($mime, 'image/')) {
        return 'image';
    }

    $value = strtolower($url);
    if (str_contains($value, '.mp4') || str_contains($value, '.webm') || str_contains($value, '.m3u8')) {
        return 'video';
    }
    if (str_contains($value, 'youtube.com') || str_contains($value, 'youtu.be') || str_contains($value, '.html')) {
        return 'web';
    }
    return 'image';
}

function load_screen_with_slides(int $screenId): array
{
    $screen = screen_row_by_id($screenId);
    if (!$screen) {
        throw new RuntimeException('Screen not found');
    }

    $slidesSt = db()->prepare(
        "SELECT id, name, content_type, source_url, fit_mode, duration_seconds, days_json, start_time, end_time, sort_order
         FROM screen_slides
         WHERE screen_id = ?
         ORDER BY sort_order ASC, id ASC"
    );
    $slidesSt->execute([$screenId]);
    $slides = [];
    foreach ($slidesSt->fetchAll() as $slide) {
        $slides[] = [
            'id' => (int)$slide['id'],
            'name' => $slide['name'],
            'type' => $slide['content_type'],
            'url' => $slide['source_url'],
            'fit' => $slide['fit_mode'],
            'duration' => (int)$slide['duration_seconds'],
            'days' => normalize_days_array(parse_json_array($slide['days_json'])),
            'startTime' => substr((string)$slide['start_time'], 0, 5) ?: '00:00',
            'endTime' => substr((string)$slide['end_time'], 0, 5) ?: '23:59',
        ];
    }

    $screen['widgets'] = normalize_widgets(parse_json_array($screen['widgets_json'], []));
    $screen['slides'] = $slides;
    return $screen;
}

function screen_payload_by_credentials(string $publicId, string $key): ?array
{
    $st = db()->prepare(
        "SELECT s.*
         FROM screens s
         WHERE s.public_id = ? AND s.player_key = ?
         LIMIT 1"
    );
    $st->execute([$publicId, $key]);
    $screen = $st->fetch();
    if (!$screen) {
        return null;
    }

    $full = load_screen_with_slides((int)$screen['id']);
    $revisionSource = [
        'name' => $full['name'],
        'slides' => array_map(static function (array $slide): array {
            return [
                'name' => $slide['name'],
                'url' => $slide['url'],
                'type' => $slide['type'],
                'fit' => $slide['fit'],
                'duration' => $slide['duration'],
                'days' => $slide['days'],
                'startTime' => $slide['startTime'],
                'endTime' => $slide['endTime'],
            ];
        }, $full['slides']),
        'widgets' => $full['widgets'],
        'orientation' => $full['orientation'],
    ];

    return [
        'screenId' => (int)$full['id'],
        'name' => $full['name'],
        'orientation' => $full['orientation'],
        'widgets' => $full['widgets'],
        'slides' => $full['slides'],
        'revision' => sha1(json_encode($revisionSource, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)),
    ];
}
