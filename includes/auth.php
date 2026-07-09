<?php
function current_user(): ?array
{
    return $_SESSION['user'] ?? null;
}

function current_user_role(): ?string
{
    return current_user()['role'] ?? null;
}

function is_admin(): bool
{
    return current_user_role() === 'admin';
}

function require_auth(): void
{
    if (!current_user()) {
        flash('error', 'Debes iniciar sesion.');
        redirect('login.php');
    }
}

function require_role(array $roles): void
{
    require_auth();
    if (!in_array(current_user_role(), $roles, true)) {
        flash('error', 'No tienes permisos para acceder a esta seccion.');
        redirect('admin.php');
    }
}

function authenticated_user_record(?int $userId = null, ?int $companyId = null): ?array
{
    $userId = $userId ?? (int)(current_user()['id'] ?? 0);
    $companyId = $companyId ?? (int)(current_user()['company_id'] ?? 0);

    if ($userId <= 0 || $companyId <= 0 || !db_table_exists('users')) {
        return null;
    }

    $st = db()->prepare(
        "SELECT u.*, c.name AS company_name
         FROM users u
         JOIN companies c ON c.id = u.company_id
         WHERE u.id = ? AND u.company_id = ? AND u.is_active = 1
         LIMIT 1"
    );
    $st->execute([$userId, $companyId]);
    return $st->fetch() ?: null;
}

function refresh_authenticated_user_session(): bool
{
    if (!current_user()) {
        return false;
    }

    $fresh = authenticated_user_record();
    if (!$fresh) {
        return false;
    }

    $_SESSION['user'] = $fresh;
    $_SESSION['_last_activity'] = time();
    return true;
}

function login_user(array $user): void
{
    session_regenerate_id(true);
    $_SESSION['user'] = $user;
    $_SESSION['_last_activity'] = time();
}

function logout_user(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        if (PHP_VERSION_ID >= 70300) {
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'] ?? '/',
                'domain' => $params['domain'] ?? '',
                'secure' => (bool)($params['secure'] ?? false),
                'httponly' => (bool)($params['httponly'] ?? true),
                'samesite' => $params['samesite'] ?? 'Lax',
            ]);
        } else {
            setcookie(session_name(), '', time() - 42000, $params['path'] ?? '/', $params['domain'] ?? '', (bool)($params['secure'] ?? false), (bool)($params['httponly'] ?? true));
        }
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        session_unset();
        session_destroy();
    }
}
