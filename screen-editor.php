<?php
require __DIR__ . '/bootstrap.php';
$screen = require_screen_access((int)($_GET['id'] ?? 0), true);
$fullScreen = load_screen_with_slides((int)$screen['id']);

render_header('Editor de pantalla');
?>
<section class="stack">
    <?php if ($message = flash('success')): ?>
        <div class="alert success"><?= e($message) ?></div>
    <?php endif; ?>
    <?php if ($message = flash('error')): ?>
        <div class="alert danger"><?= e($message) ?></div>
    <?php endif; ?>

    <div class="page-intro editor-intro">
        <div>
            <h1><?= e($fullScreen['name']) ?></h1>
            <p>Grupo: <?= e($fullScreen['group_name']) ?> · Player URL listo para copiar</p>
        </div>
        <div class="action-row wrap">
            <a href="admin.php" class="btn ghost">Volver</a>
            <a href="<?= e(screen_player_url($fullScreen)) ?>" target="_blank" rel="noopener" class="btn ghost">Abrir player</a>
            <button type="button" class="btn primary" id="save-screen">Publicar cambios</button>
            <span id="publish-status" class="publish-status" role="status" aria-live="polite"></span>
        </div>
    </div>

    <div class="editor-layout">
        <aside class="editor-sidebar">
            <div class="stack">
                <h2>Configuracion general</h2>
                <label class="field">
                    <span>Nombre de la pantalla</span>
                    <input type="text" id="screen-name" value="<?= e($fullScreen['name']) ?>">
                </label>
                <label class="field">
                    <span>Orientacion</span>
                    <select id="screen-orientation">
                        <option value="landscape" <?= $fullScreen['orientation'] === 'landscape' ? 'selected' : '' ?>>Horizontal</option>
                        <option value="portrait" <?= $fullScreen['orientation'] === 'portrait' ? 'selected' : '' ?>>Vertical</option>
                    </select>
                </label>

                <div class="screen-url compact-card">
                    <input type="text" readonly value="<?= e(screen_player_url($fullScreen)) ?>" data-copy-source>
                    <button type="button" class="btn ghost" data-copy-button>Copiar URL</button>
                </div>

                <h2>Widgets</h2>

                <div class="compact-card stack">
                    <strong>Reloj</strong>
                    <label class="field inline-field"><span>Mostrar</span><input type="checkbox" id="clock-show" <?= !empty($fullScreen['widgets']['clock']['show']) ? 'checked' : '' ?>></label>
                    <label class="field"><span>Posicion</span><select id="clock-pos"><option value="pos-top-right">Arriba derecha</option><option value="pos-top-left">Arriba izquierda</option><option value="pos-top-center">Arriba centro</option></select></label>
                    <label class="field"><span>Tamano</span><select id="clock-size"><option value="small">Pequeno</option><option value="medium">Mediano</option><option value="large">Grande</option></select></label>
                    <label class="field"><span>Color</span><input type="color" id="clock-color" value="<?= e($fullScreen['widgets']['clock']['color']) ?>"></label>
                </div>

                <div class="compact-card stack">
                    <strong>Ticker</strong>
                    <label class="field inline-field"><span>Activo</span><input type="checkbox" id="ticker-active" <?= !empty($fullScreen['widgets']['ticker']['active']) ? 'checked' : '' ?>></label>
                    <label class="field"><span>Modo</span><select id="ticker-mode"><option value="manual">Manual</option><option value="rss">RSS</option></select></label>
                    <label class="field"><span>Texto</span><textarea id="ticker-text" rows="3"><?= e($fullScreen['widgets']['ticker']['text']) ?></textarea></label>
                    <label class="field"><span>RSS URL</span><input type="url" id="ticker-rss" value="<?= e($fullScreen['widgets']['ticker']['rssUrl']) ?>"></label>
                    <label class="field"><span>Velocidad (segundos por pantalla)</span><input type="number" id="ticker-speed" min="8" max="120" value="<?= (int)$fullScreen['widgets']['ticker']['speed'] ?>"></label>
                    <label class="field"><span>Tamano fuente</span><input type="number" id="ticker-size" min="10" max="40" value="<?= (int)$fullScreen['widgets']['ticker']['fontSize'] ?>"></label>
                    <label class="field"><span>Color</span><input type="color" id="ticker-color" value="<?= e($fullScreen['widgets']['ticker']['color']) ?>"></label>
                </div>

                <div class="compact-card stack">
                    <strong>Tiempo</strong>
                    <label class="field inline-field"><span>Mostrar</span><input type="checkbox" id="weather-show" <?= !empty($fullScreen['widgets']['weather']['show']) ? 'checked' : '' ?>></label>
                    <label class="field"><span>Ciudad</span><input type="text" id="weather-city" value="<?= e($fullScreen['widgets']['weather']['city']) ?>"></label>
                    <label class="field"><span>Layout</span><select id="weather-layout"><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
                </div>

                <div class="compact-card stack">
                    <strong>Logo</strong>
                    <label class="field inline-field"><span>Mostrar</span><input type="checkbox" id="logo-show" <?= !empty($fullScreen['widgets']['logo']['show']) ? 'checked' : '' ?>></label>
                    <label class="field"><span>URL</span><input type="url" id="logo-url" value="<?= e($fullScreen['widgets']['logo']['url']) ?>"></label>
                    <label class="field"><span>Posicion</span><select id="logo-pos"><option value="pos-top-left">Arriba izquierda</option><option value="pos-top-right">Arriba derecha</option><option value="pos-top-center">Arriba centro</option></select></label>
                    <label class="field"><span>Tamano (%)</span><input type="number" id="logo-size" min="5" max="40" value="<?= (int)$fullScreen['widgets']['logo']['size'] ?>"></label>
                    <form id="logo-upload-form" class="stack">
                        <input type="hidden" name="screen_id" value="<?= (int)$fullScreen['id'] ?>">
                        <input type="hidden" name="kind" value="logo">
                        <label class="field"><span>Subir logo</span><input type="file" name="file" accept="image/*"></label>
                        <button type="submit" class="btn ghost">Subir logo</button>
                    </form>
                </div>

                <div class="compact-card stack">
                    <strong>RSS lateral</strong>
                    <label class="field inline-field"><span>Mostrar</span><input type="checkbox" id="rss-show" <?= !empty($fullScreen['widgets']['rssSidebar']['show']) ? 'checked' : '' ?>></label>
                    <label class="field"><span>RSS URL</span><input type="url" id="rss-url" value="<?= e($fullScreen['widgets']['rssSidebar']['url']) ?>"></label>
                    <label class="field"><span>Posicion</span><select id="rss-pos"><option value="pos-top-right">Arriba</option><option value="pos-middle-right">Centro</option><option value="pos-bottom-right">Abajo</option></select></label>
                </div>
                <section class="editor-playlist stack">
                <div class="section-head">
                    <h2>Playlist</h2>
                    <button type="button" class="btn primary" id="add-url-slide">Agregar URL</button>
                </div>

                <div class="slide-add-grid">
                    <label class="field"><span>Nombre</span><input type="text" id="new-slide-name" placeholder="Nombre del slide"></label>
                    <label class="field"><span>URL</span><input type="url" id="new-slide-url" placeholder="https://..."></label>
                    <label class="field"><span>Tipo</span><select id="new-slide-type"><option value="image">Imagen</option><option value="video">Video</option><option value="web">Web</option></select></label>
                </div>

                <form id="media-upload-form" class="upload-row">
                    <input type="hidden" name="screen_id" value="<?= (int)$fullScreen['id'] ?>">
                    <input type="hidden" name="kind" value="media">
                    <input type="file" name="file" accept="image/*,video/*">
                    <button type="submit" class="btn ghost">Subir archivo y agregar</button>
                </form>

                <div id="playlist-editor" class="playlist-stack"></div>
                </section>
            </div>
        </aside>

        <section class="editor-preview" aria-label="Vista previa de la pantalla">
            <div class="preview-heading">
                <div><span class="eyebrow">Vista previa en directo</span><h2 id="preview-title"><?= e($fullScreen['name']) ?></h2></div>
                <div class="preview-resolution">
                    <label>Ancho <input id="preview-width" type="number" min="320" max="7680" step="1" value="<?= $fullScreen['orientation'] === 'portrait' ? 1080 : 1920 ?>" aria-label="Ancho de la pantalla en pixeles"></label>
                    <span aria-hidden="true">×</span>
                    <label>Alto <input id="preview-height" type="number" min="320" max="7680" step="1" value="<?= $fullScreen['orientation'] === 'portrait' ? 1920 : 1080 ?>" aria-label="Alto de la pantalla en pixeles"></label>
                    <span class="preview-unit">px</span>
                    <span id="preview-format" class="preview-format"><?= $fullScreen['orientation'] === 'portrait' ? '9:16' : '16:9' ?></span>
                </div>
            </div>
            <div class="preview-canvas-wrap">
                <div id="editor-stage" class="editor-stage">
                    <iframe id="preview-player" title="Player de vista previa" src="<?= e(app_url('player.php?preview=1&id=' . (int)$fullScreen['id'])) ?>"></iframe>
                </div>
            </div>
            <div class="preview-controls">
                <button type="button" class="btn ghost small" id="preview-prev" aria-label="Slide anterior">← Anterior</button>
                <span id="preview-slide-label">Sin contenido</span>
                <button type="button" class="btn ghost small" id="preview-next" aria-label="Slide siguiente">Siguiente →</button>
            </div>
            <p class="preview-note">La vista previa usa el mismo player. Introduce la resolucion real de tu pantalla para comprobar el tamano exacto de textos y widgets.</p>
        </section>
    </div>
</section>
<script>
window.PROSIGNAGE_SCREEN = <?= json_encode([
    'id' => (int)$fullScreen['id'],
    'group_id' => (int)$fullScreen['group_id'],
    'name' => $fullScreen['name'],
    'orientation' => $fullScreen['orientation'],
    'widgets' => $fullScreen['widgets'],
    'slides' => $fullScreen['slides'],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
window.PROSIGNAGE_ENDPOINTS = <?= json_encode([
    'save' => app_url('api/screen-save.php'),
    'upload' => app_url('api/upload-asset.php'),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
window.PROSIGNAGE_CSRF = <?= json_encode(csrf_token(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
</script>
<?php render_footer([app_url('assets/js/admin.js?v=sql1'), app_url('assets/js/screen-editor.js?v=live-weather-3')]); ?>
