<?php
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $c = require __DIR__ . '/../config/app.php';
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        $c['db']['host'],
        $c['db']['port'],
        $c['db']['database'],
        $c['db']['charset']
    );

    $pdo = new PDO($dsn, $c['db']['username'], $c['db']['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    return $pdo;
}

function db_table_exists(string $table): bool
{
    static $cache = [];
    if (array_key_exists($table, $cache)) {
        return $cache[$table];
    }

    try {
        $st = db()->prepare(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?"
        );
        $st->execute([$table]);
        return $cache[$table] = ((int)$st->fetchColumn() > 0);
    } catch (Throwable $e) {
        return $cache[$table] = false;
    }
}
