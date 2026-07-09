<?php
require __DIR__ . '/bootstrap.php';
require_role(['admin']);

if (is_post()) {
    csrf_check();
    $action = (string)($_POST['action'] ?? '');

    try {
        if ($action === 'create_user') {
            $name = trim((string)($_POST['name'] ?? ''));
            $email = trim((string)($_POST['email'] ?? ''));
            $password = (string)($_POST['password'] ?? '');
            $role = (string)($_POST['role'] ?? 'viewer');
            $groupIds = array_map('intval', $_POST['group_ids'] ?? []);

            if ($name === '' || $email === '' || $password === '') {
                throw new RuntimeException('Nombre, email y contrasena son obligatorios.');
            }
            if (!in_array($role, ['admin', 'editor', 'viewer'], true)) {
                $role = 'viewer';
            }

            $st = $db->prepare(
                "INSERT INTO users (company_id, name, email, password_hash, role, is_active)
                 VALUES (?, ?, ?, ?, ?, 1)"
            );
            $st->execute([
                current_company_id(),
                $name,
                $email,
                password_hash($password, PASSWORD_DEFAULT),
                $role,
            ]);
            $userId = (int)$db->lastInsertId();

            $assignSt = $db->prepare("INSERT INTO group_user_assignments (group_id, user_id) VALUES (?, ?)");
            foreach (array_unique($groupIds) as $groupId) {
                $assignSt->execute([$groupId, $userId]);
            }

            audit_log('user.create', 'Usuario creado', 'user', $userId, ['email' => $email, 'role' => $role]);
            flash('success', 'Usuario creado correctamente.');
        } elseif ($action === 'update_user') {
            $userId = posted_int('user_id');
            $name = trim((string)($_POST['name'] ?? ''));
            $email = trim((string)($_POST['email'] ?? ''));
            $password = (string)($_POST['password'] ?? '');
            $role = (string)($_POST['role'] ?? 'viewer');
            $groupIds = array_map('intval', $_POST['group_ids'] ?? []);
            $isActive = !empty($_POST['is_active']) ? 1 : 0;

            if ($name === '' || $email === '') {
                throw new RuntimeException('Nombre y email son obligatorios.');
            }
            if (!in_array($role, ['admin', 'editor', 'viewer'], true)) {
                $role = 'viewer';
            }

            if ($password !== '') {
                $st = $db->prepare(
                    "UPDATE users
                     SET name = ?, email = ?, password_hash = ?, role = ?, is_active = ?
                     WHERE id = ? AND company_id = ?"
                );
                $st->execute([
                    $name,
                    $email,
                    password_hash($password, PASSWORD_DEFAULT),
                    $role,
                    $isActive,
                    $userId,
                    current_company_id(),
                ]);
            } else {
                $st = $db->prepare(
                    "UPDATE users
                     SET name = ?, email = ?, role = ?, is_active = ?
                     WHERE id = ? AND company_id = ?"
                );
                $st->execute([
                    $name,
                    $email,
                    $role,
                    $isActive,
                    $userId,
                    current_company_id(),
                ]);
            }

            $db->prepare("DELETE FROM group_user_assignments WHERE user_id = ?")->execute([$userId]);
            $assignSt = $db->prepare("INSERT INTO group_user_assignments (group_id, user_id) VALUES (?, ?)");
            foreach (array_unique($groupIds) as $groupId) {
                $assignSt->execute([$groupId, $userId]);
            }

            audit_log('user.update', 'Usuario actualizado', 'user', $userId, ['email' => $email, 'role' => $role]);
            flash('success', 'Usuario actualizado.');
        } elseif ($action === 'delete_user') {
            $userId = posted_int('user_id');
            if ($userId === (int)current_user()['id']) {
                throw new RuntimeException('No puedes eliminar tu propio usuario.');
            }

            $db->prepare("DELETE FROM users WHERE id = ? AND company_id = ?")->execute([$userId, current_company_id()]);
            audit_log('user.delete', 'Usuario eliminado', 'user', $userId);
            flash('success', 'Usuario eliminado.');
        }
    } catch (Throwable $e) {
        flash('error', $e->getMessage());
    }

    redirect('users.php');
}

$groups = $db->prepare("SELECT * FROM screen_groups WHERE company_id = ? ORDER BY name ASC");
$groups->execute([current_company_id()]);
$allGroups = $groups->fetchAll();

$usersSt = $db->prepare("SELECT * FROM users WHERE company_id = ? ORDER BY created_at DESC");
$usersSt->execute([current_company_id()]);
$users = $usersSt->fetchAll();

$assignmentsSt = $db->prepare("SELECT group_id FROM group_user_assignments WHERE user_id = ?");

render_header('Usuarios', 'users');
?>
<section class="stack">
    <?php if ($message = flash('success')): ?>
        <div class="alert success"><?= e($message) ?></div>
    <?php endif; ?>
    <?php if ($message = flash('error')): ?>
        <div class="alert danger"><?= e($message) ?></div>
    <?php endif; ?>

    <div class="card">
        <h1>Crear usuario</h1>
        <form method="post" class="grid-form">
            <input type="hidden" name="_csrf" value="<?= e(csrf_token()) ?>">
            <input type="hidden" name="action" value="create_user">
            <label class="field"><span>Nombre</span><input type="text" name="name" required></label>
            <label class="field"><span>Email</span><input type="email" name="email" required></label>
            <label class="field"><span>Contrasena</span><input type="password" name="password" required></label>
            <label class="field">
                <span>Rol</span>
                <select name="role">
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                </select>
            </label>
            <fieldset class="field full-span">
                <legend>Grupos asignados</legend>
                <div class="checkbox-grid">
                    <?php foreach ($allGroups as $group): ?>
                        <label><input type="checkbox" name="group_ids[]" value="<?= (int)$group['id'] ?>"> <?= e($group['name']) ?></label>
                    <?php endforeach; ?>
                </div>
            </fieldset>
            <button type="submit" class="btn primary">Crear usuario</button>
        </form>
    </div>

    <div class="stack">
        <?php foreach ($users as $listedUser): ?>
            <?php
            $assignmentsSt->execute([(int)$listedUser['id']]);
            $assigned = array_map('intval', array_column($assignmentsSt->fetchAll(), 'group_id'));
            ?>
            <div class="card user-card">
                <form method="post" class="stack">
                    <input type="hidden" name="_csrf" value="<?= e(csrf_token()) ?>">
                    <input type="hidden" name="action" value="update_user">
                    <input type="hidden" name="user_id" value="<?= (int)$listedUser['id'] ?>">
                    <div class="user-head">
                        <h2><?= e($listedUser['name']) ?></h2>
                        <span class="status-pill status-<?= (int)$listedUser['is_active'] === 1 ? 'online' : 'offline' ?>">
                            <?= e((int)$listedUser['is_active'] === 1 ? 'activo' : 'inactivo') ?>
                        </span>
                    </div>
                    <div class="grid-form">
                        <label class="field"><span>Nombre</span><input type="text" name="name" value="<?= e($listedUser['name']) ?>" required></label>
                        <label class="field"><span>Email</span><input type="email" name="email" value="<?= e($listedUser['email']) ?>" required></label>
                        <label class="field"><span>Nueva contrasena</span><input type="password" name="password" placeholder="Solo si quieres cambiarla"></label>
                        <label class="field">
                            <span>Rol</span>
                            <select name="role">
                                <?php foreach (['viewer', 'editor', 'admin'] as $role): ?>
                                    <option value="<?= e($role) ?>" <?= $listedUser['role'] === $role ? 'selected' : '' ?>><?= e(ucfirst($role)) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                        <label class="field checkbox-row">
                            <input type="checkbox" name="is_active" value="1" <?= (int)$listedUser['is_active'] === 1 ? 'checked' : '' ?>>
                            <span>Usuario activo</span>
                        </label>
                        <fieldset class="field full-span">
                            <legend>Grupos asignados</legend>
                            <div class="checkbox-grid">
                                <?php foreach ($allGroups as $group): ?>
                                    <label>
                                        <input type="checkbox" name="group_ids[]" value="<?= (int)$group['id'] ?>" <?= in_array((int)$group['id'], $assigned, true) ? 'checked' : '' ?>>
                                        <?= e($group['name']) ?>
                                    </label>
                                <?php endforeach; ?>
                            </div>
                        </fieldset>
                    </div>
                    <div class="action-row wrap">
                        <button type="submit" class="btn primary">Guardar cambios</button>
                    </div>
                </form>
                <?php if ((int)$listedUser['id'] !== (int)current_user()['id']): ?>
                    <form method="post" class="top-gap">
                        <input type="hidden" name="_csrf" value="<?= e(csrf_token()) ?>">
                        <input type="hidden" name="action" value="delete_user">
                        <input type="hidden" name="user_id" value="<?= (int)$listedUser['id'] ?>">
                        <button type="submit" class="btn ghost danger" onclick="return confirm('Eliminar este usuario?');">Eliminar</button>
                    </form>
                <?php endif; ?>
            </div>
        <?php endforeach; ?>
    </div>
</section>
<?php render_footer(); ?>
