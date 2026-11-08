<?php
$envInstalled = getenv('APP_INSTALLED');
$installed = $envInstalled !== false
    ? in_array(strtolower((string)$envInstalled), ['1', 'true', 'yes', 'on'], true)
    : false;

return [
    'app_name' => getenv('APP_NAME') ?: 'ProSignage',
    'app_version' => '1.0.0',
    'timezone' => getenv('APP_TIMEZONE') ?: 'Europe/Madrid',
    'installed' => $installed,
    'base_url' => rtrim(getenv('APP_BASE_URL') ?: '', '/'),
    'brand' => [
        'logo_url' => getenv('APP_LOGO_URL') ?: 'https://www.entelsat.com/assets/img/logo-entelsat.png',
    ],
    'db' => [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'port' => getenv('DB_PORT') ?: '3306',
        'database' => getenv('DB_DATABASE') ?: 'prosignage',
        'username' => getenv('DB_USERNAME') ?: 'root',
        'password' => getenv('DB_PASSWORD') ?: '',
        'charset' => 'utf8mb4',
    ],
    'security' => [
        'session_name' => getenv('SESSION_NAME') ?: 'PROSIGNAGESESSID',
        'session_timeout' => (int)(getenv('SESSION_TIMEOUT') ?: 0),
        'session_persist_days' => (int)(getenv('SESSION_PERSIST_DAYS') ?: 180),
    ],
    'uploads' => [
        'dir' => __DIR__ . '/../storage/uploads',
        'url' => 'storage/uploads',
        'max_mb' => (int)(getenv('UPLOAD_MAX_MB') ?: 100),
    ],
];
