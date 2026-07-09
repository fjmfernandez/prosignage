<?php
$config = require __DIR__ . '/config/app.php';
date_default_timezone_set($config['timezone'] ?? 'Europe/Madrid');

$sessionName = (string)($config['security']['session_name'] ?? 'PROSIGNAGESESSID');
$sessionTimeout = (int)($config['security']['session_timeout'] ?? 0);
$sessionPersistDays = max(0, (int)($config['security']['session_persist_days'] ?? 180));
$sessionCookieLifetime = $sessionPersistDays > 0 ? ($sessionPersistDays * 86400) : 0;
$sessionCookieSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');

ini_set('session.use_strict_mode', '1');
if ($sessionCookieLifetime > 0) {
    ini_set('session.gc_maxlifetime', (string)$sessionCookieLifetime);
    ini_set('session.cookie_lifetime', (string)$sessionCookieLifetime);
}

session_name($sessionName);
if (PHP_VERSION_ID >= 70300) {
    session_set_cookie_params([
        'lifetime' => $sessionCookieLifetime,
        'path' => '/',
        'secure' => $sessionCookieSecure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
} else {
    session_set_cookie_params($sessionCookieLifetime, '/; samesite=Lax', '', $sessionCookieSecure, true);
}
session_start();

if ($sessionTimeout > 0 && !empty($_SESSION['_last_activity'])) {
    if ((time() - (int)$_SESSION['_last_activity']) > $sessionTimeout) {
        session_unset();
        session_destroy();
        session_name($sessionName);
        session_start();
    }
}
$_SESSION['_last_activity'] = time();

if ($sessionCookieLifetime > 0 && session_status() === PHP_SESSION_ACTIVE && session_id() !== '') {
    if (PHP_VERSION_ID >= 70300) {
        setcookie(session_name(), session_id(), [
            'expires' => time() + $sessionCookieLifetime,
            'path' => '/',
            'secure' => $sessionCookieSecure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    } else {
        setcookie(session_name(), session_id(), time() + $sessionCookieLifetime, '/; samesite=Lax', '', $sessionCookieSecure, true);
    }
}

require_once __DIR__ . '/includes/db.php';
require_once __DIR__ . '/includes/helpers.php';
require_once __DIR__ . '/includes/auth.php';
require_once __DIR__ . '/includes/signage.php';
require_once __DIR__ . '/includes/layout.php';

$self = basename($_SERVER['SCRIPT_NAME'] ?? '');
$publicAllowed = [
    'install.php',
    'login.php',
    'logout.php',
    'player.php',
];

if (($config['installed'] ?? false) === false && !in_array($self, $publicAllowed, true) && !str_starts_with((string)($_SERVER['SCRIPT_NAME'] ?? ''), '/api/player-')) {
    header('Location: install.php');
    exit;
}

$db = null;
try {
    $db = db();
} catch (Throwable $e) {
    if (($config['installed'] ?? false) === true && $self !== 'install.php') {
        throw $e;
    }
}

if ($db && db_table_exists('users')) {
    try {
        $userCount = (int)$db->query("SELECT COUNT(*) FROM users")->fetchColumn();
        if ($userCount === 0) {
            $adminEmail = trim((string)getenv('APP_ADMIN_EMAIL'));
            $adminPassword = (string)getenv('APP_ADMIN_PASSWORD');
            if ($adminEmail !== '' && $adminPassword !== '') {
                $adminName = trim((string)getenv('APP_ADMIN_NAME')) ?: 'Administrador';
                $hash = password_hash($adminPassword, PASSWORD_DEFAULT);
                $st = $db->prepare(
                    "INSERT INTO users (company_id, name, email, password_hash, role, is_active) VALUES (1, ?, ?, ?, 'admin', 1)"
                );
                $st->execute([$adminName, $adminEmail, $hash]);
            }
        }
    } catch (Throwable $e) {
    }
}

if ($db && current_user()) {
    try {
        if (!refresh_authenticated_user_session()) {
            logout_user();
            if ($self !== 'login.php') {
                flash('error', 'Tu usuario ya no esta disponible.');
                redirect('login.php');
            }
        }
    } catch (Throwable $e) {
    }
}
