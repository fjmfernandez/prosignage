<?php
function render_header(string $title, string $active = 'dashboard'): void
{
    $user = current_user();
    $links = [];
    if ($user) {
        $links[] = ['key' => 'dashboard', 'label' => 'Pantallas', 'href' => 'admin.php'];
        if (($user['role'] ?? '') === 'admin') {
            $links[] = ['key' => 'users', 'label' => 'Usuarios', 'href' => 'users.php'];
        }
        $links[] = ['key' => 'logout', 'label' => 'Salir', 'href' => 'logout.php'];
    }
    ?>
<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0f172a">
    <title><?= e($title) ?> | <?= e(app_name()) ?></title>
    <link rel="stylesheet" href="<?= e(app_url('assets/css/app.css?v=sql1')) ?>">
</head>
<body>
<?php if ($user): ?>
    <header class="shell-header">
        <div class="brand-block">
            <?php if (app_logo_url() !== ''): ?>
                <img src="<?= e(app_logo_url()) ?>" alt="Logo" class="brand-logo">
            <?php endif; ?>
            <div>
                <div class="brand-title"><?= e(app_name()) ?></div>
                <div class="brand-subtitle">Gestion de pantallas con SQL</div>
            </div>
        </div>
        <nav class="top-nav">
            <?php foreach ($links as $link): ?>
                <a href="<?= e($link['href']) ?>" class="<?= $active === $link['key'] ? 'is-active' : '' ?>"><?= e($link['label']) ?></a>
            <?php endforeach; ?>
        </nav>
    </header>
    <main class="page-shell">
<?php else: ?>
    <main class="page-shell guest-shell">
<?php endif; ?>
<?php
}

function render_footer(array $scripts = []): void
{
    foreach ($scripts as $script) {
        echo '<script src="' . e($script) . '"></script>' . PHP_EOL;
    }
    ?>
    </main>
</body>
</html>
<?php
}
