<?php
require __DIR__ . '/bootstrap.php';

if ((app_config()['installed'] ?? false) === true) {
    redirect(current_user() ? 'admin.php' : 'login.php');
}

render_header('Instalacion');
?>
<section class="stack narrow">
    <div class="card">
        <h1>Instalacion pendiente</h1>
        <p>ProSignage espera sus variables de entorno y la conexion SQL.</p>
        <p>Si vas a usar Docker o Coolify, define al menos:</p>
        <ul class="flat-list">
            <li><code>APP_INSTALLED=1</code></li>
            <li><code>APP_ADMIN_EMAIL</code></li>
            <li><code>APP_ADMIN_PASSWORD</code></li>
            <li><code>DB_HOST</code>, <code>DB_DATABASE</code>, <code>DB_USERNAME</code>, <code>DB_PASSWORD</code></li>
        </ul>
        <p>Con <code>AUTO_INIT_DB=1</code> el contenedor inicializa el esquema automaticamente.</p>
    </div>
</section>
<?php render_footer(); ?>
