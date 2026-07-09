<?php
require __DIR__ . '/bootstrap.php';

if (current_user()) {
    redirect('admin.php');
}

if (is_post()) {
    csrf_check();
    $email = trim((string)($_POST['email'] ?? ''));
    $password = (string)($_POST['password'] ?? '');

    $st = $db->prepare(
        "SELECT u.*, c.name AS company_name
         FROM users u
         JOIN companies c ON c.id = u.company_id
         WHERE u.email = ?
         LIMIT 1"
    );
    $st->execute([$email]);
    $user = $st->fetch();

    if ($user && (int)$user['is_active'] === 1 && password_verify($password, (string)$user['password_hash'])) {
        login_user($user);
        audit_log('auth.login', 'Inicio de sesion correcto', 'user', (int)$user['id']);
        redirect('admin.php');
    }

    flash('error', 'Credenciales incorrectas.');
    redirect('login.php');
}

render_header('Acceso');
?>
<section class="login-grid">
    <div class="login-card">
        <div class="brand-stack">
            <?php if (app_logo_url() !== ''): ?>
                <img src="<?= e(app_logo_url()) ?>" alt="Logo" class="login-logo">
            <?php endif; ?>
            <div>
                <h1><?= e(app_name()) ?></h1>
                <p>Panel SQL para grupos, pantallas y usuarios.</p>
            </div>
        </div>

        <?php if ($message = flash('error')): ?>
            <div class="alert danger"><?= e($message) ?></div>
        <?php endif; ?>

        <form method="post" class="stack">
            <input type="hidden" name="_csrf" value="<?= e(csrf_token()) ?>">
            <label class="field">
                <span>Email</span>
                <input type="email" name="email" autocomplete="username" required>
            </label>
            <label class="field">
                <span>Contrasena</span>
                <input type="password" name="password" autocomplete="current-password" required>
            </label>
            <button type="submit" class="btn primary full">Entrar</button>
        </form>
    </div>
</section>
<?php render_footer(); ?>
