<?php
function e(?string $value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function redirect(string $path): void
{
    header('Location: ' . $path);
    exit;
}

function is_post(): bool
{
    return strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'POST';
}

function flash(string $key, ?string $value = null): ?string
{
    if ($value !== null) {
        $_SESSION['_flash'][$key] = $value;
        return null;
    }

    if (!isset($_SESSION['_flash'][$key])) {
        return null;
    }

    $message = $_SESSION['_flash'][$key];
    unset($_SESSION['_flash'][$key]);
    return $message;
}

function csrf_token(): string
{
    if (empty($_SESSION['_csrf'])) {
        $_SESSION['_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['_csrf'];
}

function csrf_check(): void
{
    $token = (string)($_POST['_csrf'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($token === '' || !hash_equals((string)($_SESSION['_csrf'] ?? ''), $token)) {
        http_response_code(419);
        exit('CSRF token mismatch');
    }
}

function json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function current_company_id(): int
{
    return (int)(current_user()['company_id'] ?? 1);
}

function app_config(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/../config/app.php';
    }
    return $config;
}

function app_name(): string
{
    return (string)(app_config()['app_name'] ?? 'ProSignage');
}

function app_logo_url(): string
{
    return (string)(app_config()['brand']['logo_url'] ?? '');
}

function app_url(string $path = ''): string
{
    $base = (string)(app_config()['base_url'] ?? '');
    $trimmed = ltrim($path, '/');
    if ($base !== '') {
        return $trimmed === '' ? $base : $base . '/' . $trimmed;
    }
    return $trimmed === '' ? '/' : '/' . $trimmed;
}

function random_token(int $bytes = 32): string
{
    return bin2hex(random_bytes($bytes));
}

function normalize_days_array($days): array
{
    if (!is_array($days)) {
        return [0, 1, 2, 3, 4, 5, 6];
    }

    $normalized = [];
    foreach ($days as $day) {
        $value = (int)$day;
        if ($value >= 0 && $value <= 6) {
            $normalized[] = $value;
        }
    }

    $normalized = array_values(array_unique($normalized));
    sort($normalized);

    return $normalized ?: [0, 1, 2, 3, 4, 5, 6];
}

function parse_json_array(?string $json, array $fallback = []): array
{
    if ($json === null || $json === '') {
        return $fallback;
    }

    $decoded = json_decode($json, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function posted_int(string $key, int $default = 0): int
{
    return isset($_POST[$key]) ? (int)$_POST[$key] : $default;
}

function audit_log(string $action, string $summary, ?string $entityType = null, ?int $entityId = null, ?array $payload = null): void
{
    if (!db_table_exists('audit_logs')) {
        return;
    }

    try {
        $st = db()->prepare(
            "INSERT INTO audit_logs (company_id, user_id, action_name, entity_type, entity_id, summary_text, payload_json)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $st->execute([
            current_company_id(),
            current_user()['id'] ?? null,
            $action,
            $entityType,
            $entityId,
            $summary,
            $payload ? json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
        ]);
    } catch (Throwable $e) {
    }
}
