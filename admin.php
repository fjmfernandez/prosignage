<?php
require __DIR__ . '/bootstrap.php';
require_auth();

$user = current_user();

if (is_post()) {
    csrf_check();
    $action = (string)($_POST['action'] ?? '');

    try {
        if ($action === 'create_group') {
            require_role(['admin']);
            $name = trim((string)($_POST['name'] ?? ''));
            if ($name === '') {
                throw new RuntimeException('El nombre del grupo es obligatorio.');
            }

            $st = $db->prepare("INSERT INTO screen_groups (company_id, name) VALUES (?, ?)");
            $st->execute([current_company_id(), $name]);
            audit_log('group.create', 'Grupo creado', 'screen_group', (int)$db->lastInsertId(), ['name' => $name]);
            flash('success', 'Grupo creado correctamente.');
        } elseif ($action === 'delete_group') {
            require_role(['admin']);
            $groupId = posted_int('group_id');
            $st = $db->prepare("DELETE FROM screen_groups WHERE id = ? AND company_id = ?");
            $st->execute([$groupId, current_company_id()]);
            audit_log('group.delete', 'Grupo eliminado', 'screen_group', $groupId);
            flash('success', 'Grupo eliminado.');
        } elseif ($action === 'create_screen') {
            $groupId = posted_int('group_id');
            if (!user_can_manage_group($groupId)) {
                throw new RuntimeException('No puedes crear pantallas en este grupo.');
            }

            $name = trim((string)($_POST['name'] ?? ''));
            $orientation = (string)($_POST['orientation'] ?? 'landscape');
            if ($name === '') {
                throw new RuntimeException('El nombre de la pantalla es obligatorio.');
            }
            if (!in_array($orientation, ['landscape', 'portrait'], true)) {
                $orientation = 'landscape';
            }

            $st = $db->prepare(
                "INSERT INTO screens (company_id, group_id, name, public_id, player_key, orientation, widgets_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?)"
            );
            $st->execute([
                current_company_id(),
                $groupId,
                $name,
                generate_public_id(),
                generate_player_key(),
                $orientation,
                json_encode(default_widgets(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
            $screenId = (int)$db->lastInsertId();
            audit_log('screen.create', 'Pantalla creada', 'screen', $screenId, ['name' => $name, 'group_id' => $groupId]);
            redirect('screen-editor.php?id=' . $screenId);
        } elseif ($action === 'delete_screen') {
            $screenId = posted_int('screen_id');
            $screen = require_screen_access($screenId, true);
            $st = $db->prepare("DELETE FROM screens WHERE id = ? AND company_id = ?");
            $st->execute([$screenId, current_company_id()]);
            audit_log('screen.delete', 'Pantalla eliminada', 'screen', $screenId, ['name' => $screen['name']]);
            flash('success', 'Pantalla eliminada.');
        } elseif ($action === 'queue_command') {
            $screenId = posted_int('screen_id');
            $screen = require_screen_access($screenId, true);
            $command = trim((string)($_POST['command'] ?? ''));
            if ($command === '') {
                throw new RuntimeException('Comando no valido.');
            }

            $st = $db->prepare(
                "INSERT INTO screen_commands (screen_id, action_name, payload_json, created_by)
                 VALUES (?, ?, ?, ?)"
            );
            $st->execute([
                $screenId,
                $command,
                json_encode([], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                (int)$user['id'],
            ]);
            audit_log('screen.command', 'Comando en cola', 'screen', $screenId, ['command' => $command]);
            flash('success', 'Comando enviado a la pantalla.');
        } elseif ($action === 'regenerate_key') {
            $screenId = posted_int('screen_id');
            require_screen_access($screenId, true);
            $newKey = generate_player_key();
            $st = $db->prepare("UPDATE screens SET player_key = ? WHERE id = ? AND company_id = ?");
            $st->execute([$newKey, $screenId, current_company_id()]);
            audit_log('screen.regenerate_key', 'URL del player regenerada', 'screen', $screenId);
            flash('success', 'Clave del player regenerada.');
        }
    } catch (Throwable $e) {
        flash('error', $e->getMessage());
    }

    redirect('admin.php');
}

$groupIds = accessible_group_ids_for_user($user);
$groups = [];

if (($user['role'] ?? '') === 'admin') {
    $groupsSt = $db->prepare("SELECT * FROM screen_groups WHERE company_id = ? ORDER BY name ASC");
    $groupsSt->execute([current_company_id()]);
} elseif ($groupIds) {
    $placeholders = implode(',', array_fill(0, count($groupIds), '?'));
    $groupsSt = $db->prepare("SELECT * FROM screen_groups WHERE company_id = ? AND id IN ($placeholders) ORDER BY name ASC");
    $groupsSt->execute(array_merge([current_company_id()], $groupIds));
} else {
    $groupsSt = null;
}

if ($groupsSt) {
    $groups = $groupsSt->fetchAll();
}

$screenSt = $db->prepare(
    "SELECT s.*, COUNT(sl.id) AS slide_count,
            (SELECT p.source_url FROM screen_slides p WHERE p.screen_id = s.id ORDER BY p.sort_order, p.id LIMIT 1) AS preview_url,
            (SELECT p.content_type FROM screen_slides p WHERE p.screen_id = s.id ORDER BY p.sort_order, p.id LIMIT 1) AS preview_type
     FROM screens s
     LEFT JOIN screen_slides sl ON sl.screen_id = s.id
     WHERE s.group_id = ?
     GROUP BY s.id
     ORDER BY s.name ASC"
);

render_header('Pantallas', 'dashboard');
?>
<section class="stack">
    <?php if ($message = flash('success')): ?>
        <div class="alert success"><?= e($message) ?></div>
    <?php endif; ?>
    <?php if ($message = flash('error')): ?>
        <div class="alert danger"><?= e($message) ?></div>
    <?php endif; ?>

    <div class="page-intro dashboard-intro">
        <div>
            <h1>Pantallas y grupos</h1>
            <p>Control central de contenido, monitorizacion y usuarios por grupo.</p>
        </div>
        <?php if (is_admin()): ?>
            <form method="post" class="inline-form">
                <input type="hidden" name="_csrf" value="<?= e(csrf_token()) ?>">
                <input type="hidden" name="action" value="create_group">
                <input type="text" name="name" placeholder="Nuevo grupo" required>
                <button type="submit" class="btn primary">Crear grupo</button>
            </form>
        <?php endif; ?>
    </div>

    <?php if (!$groups): ?>
        <div class="card empty-card">
            <h2>No hay grupos accesibles</h2>
            <p>Crea un grupo nuevo o asigna grupos a este usuario.</p>
        </div>
    <?php endif; ?>

    <?php foreach ($groups as $group): ?>
        <?php $screenSt->execute([(int)$group['id']]); $screens = $screenSt->fetchAll(); ?>
        <section class="group-panel">
            <div class="group-head">
                <div>
                    <h2><?= e($group['name']) ?></h2>
                    <p><?= count($screens) ?> pantallas</p>
                </div>
                <div class="action-row">
                    <?php if (user_can_manage_group((int)$group['id'])): ?>
                        <form method="post" class="inline-form compact">
                            <input type="hidden" name="_csrf" value="<?= e(csrf_token()) ?>">
                            <input type="hidden" name="action" value="create_screen">
                            <input type="hidden" name="group_id" value="<?= (int)$group['id'] ?>">
                            <input type="text" name="name" placeholder="Nueva pantalla" required>
                            <select name="orientation">
                                <option value="landscape">Horizontal</option>
                                <option value="portrait">Vertical</option>
                            </select>
                            <button type="submit" class="btn primary">Agregar pantalla</button>
                        </form>
                    <?php endif; ?>
                    <?php if (is_admin()): ?>
                        <form method="post" onsubmit="return confirm('Eliminar este grupo?');">
                            <input type="hidden" name="_csrf" value="<?= e(csrf_token()) ?>">
                            <input type="hidden" name="action" value="delete_group">
                            <input type="hidden" name="group_id" value="<?= (int)$group['id'] ?>">
                            <button type="submit" class="btn ghost danger">Eliminar grupo</button>
                        </form>
                    <?php endif; ?>
                </div>
            </div>

            <div class="screen-grid">
                <?php if (!$screens): ?>
                    <div class="screen-card muted-card">
                        <strong>Sin pantallas todavia</strong>
                        <span>Crea la primera pantalla de este grupo.</span>
                    </div>
                <?php endif; ?>

                <?php foreach ($screens as $screen): ?>
                    <?php
                    $status = computed_screen_status($screen);
                    $playerUrl = screen_player_url($screen);
                    ?>
                    <article class="screen-card">
                        <div class="screen-preview <?= $screen['orientation'] === 'portrait' ? 'preview-portrait' : 'preview-landscape' ?>">
                            <?php if ($screen['preview_url'] && $screen['preview_type'] === 'image'): ?>
                                <img src="<?= e($screen['preview_url']) ?>" alt="Vista previa de <?= e($screen['name']) ?>" loading="lazy">
                            <?php elseif ($screen['preview_url'] && $screen['preview_type'] === 'video'): ?>
                                <video src="<?= e($screen['preview_url']) ?>" muted playsinline preload="metadata" aria-label="Vista previa de <?= e($screen['name']) ?>"></video>
                            <?php elseif ($screen['preview_url']): ?>
                                <div class="preview-placeholder"><span>WEB</span><strong><?= e($screen['name']) ?></strong></div>
                            <?php else: ?>
                                <div class="preview-placeholder"><span>Sin contenido</span><strong><?= e($screen['name']) ?></strong></div>
                            <?php endif; ?>
                            <span class="preview-orientation"><?= $screen['orientation'] === 'portrait' ? '9:16' : '16:9' ?></span>
                        </div>
                        <div class="screen-top">
                            <div>
                                <h3><?= e($screen['name']) ?></h3>
                                <p><?= e($screen['orientation'] === 'portrait' ? 'Vertical' : 'Horizontal') ?> · <?= (int)$screen['slide_count'] ?> slides</p>
                            </div>
                            <span class="status-pill status-<?= e($status) ?>"><?= e($status) ?></span>
                        </div>

                        <dl class="meta-list">
                            <div><dt>Ultimo pulso</dt><dd><?= e(format_last_seen($screen['last_seen_at'] ?? null)) ?></dd></div>
                            <div><dt>IP publica</dt><dd><?= e($screen['public_ip'] ?: 'N/A') ?></dd></div>
                            <div><dt>Navegador</dt><dd><?= e($screen['browser_name'] ?: 'N/A') ?></dd></div>
                            <div><dt>SO</dt><dd><?= e($screen['os_name'] ?: 'N/A') ?></dd></div>
                            <div><dt>Resolucion</dt><dd><?= e($screen['screen_resolution'] ?: 'N/A') ?></dd></div>
                            <div><dt>Slide actual</dt><dd><?= e($screen['current_slide_name'] ?: 'Sin datos') ?></dd></div>
                        </dl>

                        <div class="screen-url">
                            <input type="text" readonly value="<?= e($playerUrl) ?>" data-copy-source>
                            <button type="button" class="btn ghost" data-copy-button>Copiar URL</button>
                        </div>

                        <div class="action-row wrap">
                            <a href="screen-editor.php?id=<?= (int)$screen['id'] ?>" class="btn primary">Editar</a>
                            <a href="<?= e($playerUrl) ?>" target="_blank" rel="noopener" class="btn ghost">Abrir player</a>
                        </div>

                        <?php if (user_can_manage_group((int)$screen['group_id'])): ?>
                            <div class="command-grid">
                                <?php foreach (['reload' => 'Reload', 'clearcache' => 'Clear', 'restart' => 'Restart', 'reboot' => 'Reboot'] as $commandValue => $commandLabel): ?>
                                    <form method="post">
                                        <input type="hidden" name="_csrf" value="<?= e(csrf_token()) ?>">
                                        <input type="hidden" name="action" value="queue_command">
                                        <input type="hidden" name="screen_id" value="<?= (int)$screen['id'] ?>">
                                        <input type="hidden" name="command" value="<?= e($commandValue) ?>">
                                        <button type="submit" class="btn ghost small"><?= e($commandLabel) ?></button>
                                    </form>
                                <?php endforeach; ?>
                            </div>

                            <div class="action-row wrap top-gap">
                                <form method="post">
                                    <input type="hidden" name="_csrf" value="<?= e(csrf_token()) ?>">
                                    <input type="hidden" name="action" value="regenerate_key">
                                    <input type="hidden" name="screen_id" value="<?= (int)$screen['id'] ?>">
                                    <button type="submit" class="btn ghost">Regenerar URL</button>
                                </form>
                                <form method="post" onsubmit="return confirm('Eliminar esta pantalla?');">
                                    <input type="hidden" name="_csrf" value="<?= e(csrf_token()) ?>">
                                    <input type="hidden" name="action" value="delete_screen">
                                    <input type="hidden" name="screen_id" value="<?= (int)$screen['id'] ?>">
                                    <button type="submit" class="btn ghost danger">Eliminar</button>
                                </form>
                            </div>
                        <?php endif; ?>
                    </article>
                <?php endforeach; ?>
            </div>
        </section>
    <?php endforeach; ?>
</section>
<?php render_footer([app_url('assets/js/admin.js?v=sql1')]); ?>
