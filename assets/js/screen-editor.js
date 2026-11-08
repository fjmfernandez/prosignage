(() => {
  const initial = window.PROSIGNAGE_SCREEN;
  if (!initial) {
    return;
  }

  const endpoints = window.PROSIGNAGE_ENDPOINTS || {};
  const csrf = window.PROSIGNAGE_CSRF || "";
  const state = JSON.parse(JSON.stringify(initial));
  const updateChannel = 'BroadcastChannel' in window ? new BroadcastChannel('prosignage-screen-updates') : null;

  const playlistEl = document.getElementById("playlist-editor");
  const saveButton = document.getElementById("save-screen");
  const publishStatus = document.getElementById("publish-status");
  const addUrlButton = document.getElementById("add-url-slide");
  const mediaUploadForm = document.getElementById("media-upload-form");
  const logoUploadForm = document.getElementById("logo-upload-form");
  const preview = {
    stage: document.getElementById("editor-stage"),
    wrap: document.querySelector(".preview-canvas-wrap"),
    player: document.getElementById("preview-player"),
    width: document.getElementById("preview-width"),
    height: document.getElementById("preview-height"),
    title: document.getElementById("preview-title"),
    format: document.getElementById("preview-format"),
    label: document.getElementById("preview-slide-label"),
    previous: document.getElementById("preview-prev"),
    next: document.getElementById("preview-next"),
    hitLayer: document.getElementById("canvas-hit-layer"),
    inspector: document.getElementById("selection-inspector"),
    inspectorTitle: document.getElementById("selection-title"),
    inspectorFields: document.getElementById("selection-fields"),
    inspectorClose: document.getElementById("selection-close"),
  };
  let previewIndex = 0;
  let previewPlayerReady = false;
  let previewWidth = Number(preview.width.value);
  let previewHeight = Number(preview.height.value);
  let selectedTarget = null;
  let hitUpdateQueued = false;
  let previewObserver = null;

  const fields = {
    name: document.getElementById("screen-name"),
    orientation: document.getElementById("screen-orientation"),
    clockShow: document.getElementById("clock-show"),
    clockPos: document.getElementById("clock-pos"),
    clockSize: document.getElementById("clock-size"),
    clockColor: document.getElementById("clock-color"),
    tickerActive: document.getElementById("ticker-active"),
    tickerMode: document.getElementById("ticker-mode"),
    tickerText: document.getElementById("ticker-text"),
    tickerRss: document.getElementById("ticker-rss"),
    tickerSpeed: document.getElementById("ticker-speed"),
    tickerSize: document.getElementById("ticker-size"),
    tickerColor: document.getElementById("ticker-color"),
    weatherShow: document.getElementById("weather-show"),
    weatherCity: document.getElementById("weather-city"),
    weatherLayout: document.getElementById("weather-layout"),
    logoShow: document.getElementById("logo-show"),
    logoUrl: document.getElementById("logo-url"),
    logoPos: document.getElementById("logo-pos"),
    logoSize: document.getElementById("logo-size"),
    rssShow: document.getElementById("rss-show"),
    rssUrl: document.getElementById("rss-url"),
    rssPos: document.getElementById("rss-pos"),
    newSlideName: document.getElementById("new-slide-name"),
    newSlideUrl: document.getElementById("new-slide-url"),
    newSlideType: document.getElementById("new-slide-type"),
  };

  function setInitialWidgetValues() {
    fields.clockPos.value = state.widgets.clock.pos || "pos-top-right";
    fields.clockSize.value = state.widgets.clock.size || "medium";
    fields.tickerMode.value = state.widgets.ticker.mode || "manual";
    fields.weatherLayout.value = state.widgets.weather.layout || "horizontal";
    fields.logoPos.value = state.widgets.logo.pos || "pos-top-left";
    fields.rssPos.value = state.widgets.rssSidebar.pos || "pos-top-right";
  }

  function collectWidgets() {
    return {
      clock: {
        show: fields.clockShow.checked,
        pos: fields.clockPos.value,
        size: fields.clockSize.value,
        color: fields.clockColor.value,
      },
      ticker: {
        active: fields.tickerActive.checked,
        mode: fields.tickerMode.value,
        text: fields.tickerText.value.trim(),
        rssUrl: fields.tickerRss.value.trim(),
        speed: Number(fields.tickerSpeed.value || 18),
        fontSize: Number(fields.tickerSize.value || 14),
        color: fields.tickerColor.value,
      },
      weather: {
        show: fields.weatherShow.checked,
        city: fields.weatherCity.value.trim(),
        layout: fields.weatherLayout.value,
      },
      logo: {
        show: fields.logoShow.checked,
        url: fields.logoUrl.value.trim(),
        pos: fields.logoPos.value,
        size: Number(fields.logoSize.value || 15),
      },
      rssSidebar: {
        show: fields.rssShow.checked,
        url: fields.rssUrl.value.trim(),
        pos: fields.rssPos.value,
      },
    };
  }

  function fitPreview() {
    const width = Number(preview.width.value);
    const height = Number(preview.height.value);
    if (Number.isInteger(width) && width >= 320 && width <= 7680) previewWidth = width;
    if (Number.isInteger(height) && height >= 320 && height <= 7680) previewHeight = height;

    const scale = Math.min(preview.wrap.clientWidth / previewWidth, 650 / previewHeight, 850 / previewWidth);
    if (!Number.isFinite(scale) || scale <= 0) return;
    preview.stage.style.width = `${previewWidth * scale}px`;
    preview.stage.style.height = `${previewHeight * scale}px`;
    preview.player.style.width = `${previewWidth}px`;
    preview.player.style.height = `${previewHeight}px`;
    preview.player.style.transform = `scale(${scale})`;

    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const divisor = gcd(previewWidth, previewHeight);
    const ratioWidth = previewWidth / divisor;
    const ratioHeight = previewHeight / divisor;
    preview.format.textContent = ratioWidth <= 32 && ratioHeight <= 32
      ? `${ratioWidth}:${ratioHeight}`
      : `${previewWidth} × ${previewHeight}`;
    scheduleHitTargets();
  }

  function renderPreview() {
    const slides = state.slides;
    previewIndex = slides.length ? ((previewIndex % slides.length) + slides.length) % slides.length : 0;
    const slide = slides[previewIndex];
    preview.title.textContent = fields.name.value.trim() || "Pantalla sin nombre";
    preview.label.textContent = slide ? `${previewIndex + 1} / ${slides.length} · ${slide.name || "Sin nombre"}` : "Sin contenido";
    preview.previous.disabled = !slides.length;
    preview.next.disabled = !slides.length;
    playlistEl.querySelectorAll(".playlist-card").forEach((card) => {
      card.classList.toggle("is-previewing", Number(card.dataset.index) === previewIndex);
    });
    fitPreview();
    syncInspectorFields();
    if (previewPlayerReady) {
      preview.player.contentWindow.postMessage({
        type: "prosignage-preview",
        model: { ...state, name: fields.name.value.trim(), orientation: fields.orientation.value, widgets: collectWidgets() },
        slideIndex: previewIndex,
      }, window.location.origin);
    }
  }

  function renderDaySelector(slide, index) {
    const dayLabels = ["D", "L", "M", "X", "J", "V", "S"];
    return dayLabels
      .map((label, dayIndex) => {
        const checked = (slide.days || []).includes(dayIndex) ? "checked" : "";
        return `
          <label class="day-pill ${checked ? "active" : ""}">
            <input type="checkbox" data-action="toggle-day" data-index="${index}" data-day="${dayIndex}" ${checked}>
            <span>${label}</span>
          </label>
        `;
      })
      .join("");
  }

  function renderPlaylist() {
    if (!state.slides.length) {
      playlistEl.innerHTML = `<div class="empty-card">No hay slides todavia.</div>`;
      renderPreview();
      return;
    }

    playlistEl.innerHTML = state.slides
      .map((slide, index) => {
        return `
          <article class="playlist-card" data-index="${index}">
            <div class="section-head">
              <h3>Slide ${index + 1}</h3>
              <div class="action-row wrap">
                <button type="button" class="btn ghost small" data-action="move-up" data-index="${index}">Subir</button>
                <button type="button" class="btn ghost small" data-action="move-down" data-index="${index}">Bajar</button>
                <button type="button" class="btn ghost danger small" data-action="remove" data-index="${index}">Eliminar</button>
              </div>
            </div>
            <div class="grid-form">
              <label class="field">
                <span>Nombre</span>
                <input type="text" data-field="name" data-index="${index}" value="${escapeHtml(slide.name || "")}">
              </label>
              <label class="field">
                <span>Tipo</span>
                <select data-field="type" data-index="${index}">
                  <option value="image" ${slide.type === "image" ? "selected" : ""}>Imagen</option>
                  <option value="video" ${slide.type === "video" ? "selected" : ""}>Video</option>
                  <option value="web" ${slide.type === "web" ? "selected" : ""}>Web</option>
                </select>
              </label>
              <label class="field full-span">
                <span>URL</span>
                <input type="url" data-field="url" data-index="${index}" value="${escapeHtml(slide.url || "")}">
              </label>
              <label class="field">
                <span>Ajuste</span>
                <select data-field="fit" data-index="${index}">
                  <option value="contain" ${slide.fit === "contain" ? "selected" : ""}>Contain</option>
                  <option value="cover" ${slide.fit === "cover" ? "selected" : ""}>Cover</option>
                  <option value="fill" ${slide.fit === "fill" ? "selected" : ""}>Fill</option>
                </select>
              </label>
              <label class="field">
                <span>Duracion</span>
                <input type="number" min="1" max="3600" data-field="duration" data-index="${index}" value="${Number(slide.duration || 10)}">
              </label>
              <label class="field">
                <span>Desde</span>
                <input type="time" data-field="startTime" data-index="${index}" value="${escapeHtml(slide.startTime || "00:00")}">
              </label>
              <label class="field">
                <span>Hasta</span>
                <input type="time" data-field="endTime" data-index="${index}" value="${escapeHtml(slide.endTime || "23:59")}">
              </label>
              <fieldset class="field full-span">
                <legend>Dias</legend>
                <div class="day-grid">${renderDaySelector(slide, index)}</div>
              </fieldset>
            </div>
          </article>
        `;
      })
      .join("");
    renderPreview();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const selectionLabels = {
    slide: 'Contenido', clock: 'Reloj', ticker: 'Marquesina',
    weather: 'Tiempo', logo: 'Logo', rss: 'Noticias laterales',
  };
  const widgetControls = {
    clock: [['clockShow', 'Mostrar'], ['clockPos', 'Posición'], ['clockSize', 'Tamaño'], ['clockColor', 'Color']],
    ticker: [['tickerActive', 'Mostrar'], ['tickerMode', 'Origen'], ['tickerText', 'Texto'], ['tickerRss', 'RSS URL'], ['tickerSpeed', 'Segundos por pantalla'], ['tickerSize', 'Tamaño de letra'], ['tickerColor', 'Color']],
    weather: [['weatherShow', 'Mostrar'], ['weatherCity', 'Ciudad'], ['weatherLayout', 'Diseño']],
    logo: [['logoShow', 'Mostrar'], ['logoUrl', 'URL de la imagen'], ['logoPos', 'Posición'], ['logoSize', 'Tamaño (%)']],
    rss: [['rssShow', 'Mostrar'], ['rssUrl', 'RSS URL'], ['rssPos', 'Posición']],
  };

  function addBoundControl(key, label) {
    const source = fields[key];
    const row = document.createElement('label');
    row.className = source.type === 'checkbox' ? 'field inline-field' : 'field';
    const caption = document.createElement('span');
    caption.textContent = label;
    const control = source.cloneNode(true);
    control.id = `direct-${key}`;
    control.dataset.bind = key;
    control.removeAttribute('name');
    if (source.type === 'checkbox') control.checked = source.checked;
    else control.value = source.value;
    row.append(caption, control);
    preview.inspectorFields.append(row);
  }

  function addSlideControl(key, label, type = 'text', options = null) {
    const slide = state.slides[previewIndex];
    const row = document.createElement('label');
    row.className = 'field';
    const caption = document.createElement('span');
    caption.textContent = label;
    const control = options ? document.createElement('select') : document.createElement('input');
    if (options) {
      for (const [value, name] of options) control.add(new Option(name, value));
    } else {
      control.type = type;
      if (type === 'number') {
        control.min = '1';
        control.max = '3600';
      }
    }
    control.dataset.slideField = key;
    control.value = String(slide[key] ?? '');
    row.append(caption, control);
    preview.inspectorFields.append(row);
  }

  function addInspectorAction(action, label, className = 'btn ghost') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.inspectorAction = action;
    button.textContent = label;
    preview.inspectorFields.append(button);
  }

  function addCanvasUpload(kind, label) {
    const form = document.createElement('form');
    form.className = 'canvas-upload field';
    form.innerHTML = `<input type="hidden" name="screen_id" value="${state.id}"><input type="hidden" name="kind" value="${kind}">`;
    const caption = document.createElement('span');
    caption.textContent = label;
    const input = document.createElement('input');
    input.type = 'file';
    input.name = 'file';
    input.accept = kind === 'logo' ? 'image/*' : 'image/*,video/*';
    input.dataset.canvasUpload = kind;
    form.append(caption, input);
    preview.inspectorFields.append(form);
  }

  function addNewUrlControls(collapsed) {
    const container = collapsed ? document.createElement('details') : document.createElement('div');
    container.className = 'inspector-add';
    if (collapsed) {
      const summary = document.createElement('summary');
      summary.textContent = 'Añadir otra URL';
      container.append(summary);
    }
    for (const [key, label, type] of [['name', 'Nombre', 'text'], ['url', 'URL', 'url']]) {
      const row = document.createElement('label');
      row.className = 'field';
      const caption = document.createElement('span');
      caption.textContent = label;
      const input = document.createElement('input');
      input.type = type;
      input.dataset[`newSlide${key[0].toUpperCase()}${key.slice(1)}`] = '';
      if (key === 'url') input.placeholder = 'https://...';
      row.append(caption, input);
      container.append(row);
    }
    const typeRow = document.createElement('label');
    typeRow.className = 'field';
    const typeLabel = document.createElement('span');
    typeLabel.textContent = 'Tipo';
    const type = document.createElement('select');
    type.dataset.newSlideType = '';
    [['image', 'Imagen'], ['video', 'Vídeo'], ['web', 'Web']].forEach(([value, name]) => type.add(new Option(name, value)));
    typeRow.append(typeLabel, type);
    container.append(typeRow);
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn primary';
    add.dataset.inspectorAction = 'add-url';
    add.textContent = 'Añadir contenido';
    container.append(add);
    preview.inspectorFields.append(container);
  }

  function renderInspector() {
    preview.inspector.hidden = !selectedTarget;
    preview.inspectorFields.replaceChildren();
    if (!selectedTarget) {
      updateSelectionUI();
      return;
    }
    preview.inspectorTitle.textContent = selectionLabels[selectedTarget];

    if (selectedTarget === 'slide') {
      if (state.slides.length) {
        addSlideControl('name', 'Nombre');
        addSlideControl('url', 'Imagen, vídeo o URL', 'url');
        addSlideControl('type', 'Tipo', 'text', [['image', 'Imagen'], ['video', 'Vídeo'], ['web', 'Web']]);
        addSlideControl('fit', 'Ajuste', 'text', [['contain', 'Completa'], ['cover', 'Rellenar'], ['fill', 'Estirar']]);
        addSlideControl('duration', 'Duración (segundos)', 'number');
        addSlideControl('startTime', 'Desde', 'time');
        addSlideControl('endTime', 'Hasta', 'time');
        addInspectorAction('playlist', 'Ver toda la lista y los días');
        addNewUrlControls(true);
        addCanvasUpload('media', 'Reemplazar imagen o vídeo');
      } else {
        const note = document.createElement('p');
        note.className = 'inspector-hint';
        note.textContent = 'Añade una imagen, vídeo o página para empezar.';
        preview.inspectorFields.append(note);
        addNewUrlControls(false);
        addCanvasUpload('media', 'Subir imagen o vídeo');
      }
    } else {
      widgetControls[selectedTarget].forEach(([key, label]) => addBoundControl(key, label));
      if (selectedTarget === 'logo') addCanvasUpload('logo', 'Subir logo');
    }
    updateSelectionUI();
  }

  function syncInspectorFields() {
    if (preview.inspector.hidden || preview.inspector.contains(document.activeElement)) return;
    preview.inspectorFields.querySelectorAll('[data-bind]').forEach((control) => {
      const source = fields[control.dataset.bind];
      if (control.type === 'checkbox') control.checked = source.checked;
      else control.value = source.value;
    });
    const slide = state.slides[previewIndex];
    if (slide) preview.inspectorFields.querySelectorAll('[data-slide-field]').forEach((control) => {
      control.value = String(slide[control.dataset.slideField] ?? '');
    });
  }

  function updateSelectionUI() {
    document.querySelectorAll('.canvas-toolbar [data-select]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.select === selectedTarget));
    });
    preview.hitLayer.querySelectorAll('[data-select]').forEach((button) => {
      button.classList.toggle('selected', button.dataset.select === selectedTarget);
      button.setAttribute('aria-pressed', String(button.dataset.select === selectedTarget));
    });
  }

  function selectTarget(type) {
    selectedTarget = type;
    renderInspector();
    scheduleHitTargets();
  }

  function scheduleHitTargets() {
    if (hitUpdateQueued) return;
    hitUpdateQueued = true;
    requestAnimationFrame(() => {
      hitUpdateQueued = false;
      syncHitTargets();
    });
  }

  function syncHitTargets() {
    if (!previewPlayerReady || !preview.player.contentDocument) return;
    const doc = preview.player.contentDocument;
    const scaleX = preview.stage.clientWidth / previewWidth;
    const scaleY = preview.stage.clientHeight / previewHeight;
    const targets = [
      ['slide', '#content'], ['clock', '#clock'], ['logo', '#logo'],
      ['weather', '#weather, #weather-vertical'], ['ticker', '#ticker'],
      ['rss', '#rss-sidebar'],
    ];
    for (const [type, selector] of targets) {
      let button = preview.hitLayer.querySelector(`[data-select="${type}"]`);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'canvas-hit';
        button.dataset.select = type;
        button.setAttribute('aria-label', `Editar ${selectionLabels[type].toLowerCase()}`);
        button.innerHTML = `<span>${escapeHtml(selectionLabels[type])}</span>`;
        preview.hitLayer.append(button);
      }
      const element = Array.from(doc.querySelectorAll(selector)).find((candidate) =>
        doc.defaultView.getComputedStyle(candidate).display !== 'none' && candidate.getBoundingClientRect().width > 0
      );
      button.hidden = !element;
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      button.style.left = `${Math.max(0, rect.left * scaleX)}px`;
      button.style.top = `${Math.max(0, rect.top * scaleY)}px`;
      button.style.width = `${Math.min(preview.stage.clientWidth, rect.width * scaleX)}px`;
      button.style.height = `${Math.min(preview.stage.clientHeight, rect.height * scaleY)}px`;
    }
    updateSelectionUI();
  }

  function observePreviewPlayer() {
    previewObserver?.disconnect();
    const doc = preview.player.contentDocument;
    if (!doc?.body) return;
    previewObserver = new MutationObserver(scheduleHitTargets);
    previewObserver.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
    doc.addEventListener('load', scheduleHitTargets, true);
    scheduleHitTargets();
  }

  function openSidebarPanel(name, widget = null) {
    const panel = document.querySelector(`.editor-sidebar [data-panel="${name}"]`);
    if (!panel) return;
    panel.open = true;
    if (widget) {
      const inner = panel.querySelector(`[data-widget="${widget}"]`);
      if (inner) inner.open = true;
    }
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function addSlide(slide) {
    state.slides.push({
      name: slide.name || `Slide ${state.slides.length + 1}`,
      url: slide.url || "",
      type: slide.type || "image",
      fit: slide.fit || "contain",
      duration: Number(slide.duration || (slide.type === "video" ? 30 : 10)),
      days: Array.isArray(slide.days) && slide.days.length ? slide.days.slice() : [0, 1, 2, 3, 4, 5, 6],
      startTime: slide.startTime || "00:00",
      endTime: slide.endTime || "23:59",
    });
    previewIndex = state.slides.length - 1;
    selectedTarget = 'slide';
    renderPlaylist();
    renderInspector();
    publishStatus.textContent = 'Cambios sin publicar.';
  }

  function swapSlides(a, b) {
    if (a < 0 || b < 0 || a >= state.slides.length || b >= state.slides.length) {
      return;
    }
    const temp = state.slides[a];
    state.slides[a] = state.slides[b];
    state.slides[b] = temp;
    renderPlaylist();
    publishStatus.textContent = 'Cambios sin publicar.';
  }

  async function saveScreen() {
    state.name = fields.name.value.trim();
    state.orientation = fields.orientation.value;
    state.widgets = collectWidgets();

    const response = await fetch(endpoints.save, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": csrf,
      },
      body: JSON.stringify({
        screen_id: state.id,
        name: state.name,
        orientation: state.orientation,
        widgets: state.widgets,
        slides: state.slides,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || "No se pudo guardar la pantalla.");
    }
    updateChannel?.postMessage({ type: 'screen-saved', screenId: state.id });
    return data;
  }

  async function uploadFile(form, callback) {
    const formData = new FormData(form);
    formData.append("_csrf", csrf);
    const response = await fetch(endpoints.upload, {
      method: "POST",
      headers: {
        "X-CSRF-TOKEN": csrf,
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || "No se pudo subir el archivo.");
    }
    callback(data.asset);
    form.reset();
  }

  addUrlButton.addEventListener("click", () => {
    const url = fields.newSlideUrl.value.trim();
    if (!url) {
      alert("Introduce una URL para el slide.");
      return;
    }

    addSlide({
      name: fields.newSlideName.value.trim() || "Nuevo slide",
      url,
      type: fields.newSlideType.value,
      fit: "contain",
      duration: fields.newSlideType.value === "video" ? 30 : 10,
    });

    fields.newSlideName.value = "";
    fields.newSlideUrl.value = "";
    fields.newSlideType.value = "image";
  });

  playlistEl.addEventListener("click", (event) => {
    const card = event.target.closest(".playlist-card");
    if (card) {
      previewIndex = Number(card.dataset.index);
      renderPreview();
      if (selectedTarget === 'slide') renderInspector();
    }
    const action = event.target.closest("[data-action]");
    if (!action) {
      return;
    }

    const index = Number(action.dataset.index || -1);
    if (Number.isNaN(index) || index < 0) {
      return;
    }

    switch (action.dataset.action) {
      case "remove":
        state.slides.splice(index, 1);
        renderPlaylist();
        if (selectedTarget === 'slide') renderInspector();
        publishStatus.textContent = 'Cambios sin publicar.';
        break;
      case "move-up":
        swapSlides(index, index - 1);
        break;
      case "move-down":
        swapSlides(index, index + 1);
        break;
      default:
        break;
    }
  });

  playlistEl.addEventListener("change", (event) => {
    const target = event.target;
    const index = Number(target.dataset.index || -1);
    if (Number.isNaN(index) || index < 0 || !state.slides[index]) {
      return;
    }

    if (target.dataset.action === "toggle-day") {
      const day = Number(target.dataset.day || -1);
      const days = new Set(state.slides[index].days || []);
      if (target.checked) {
        days.add(day);
      } else {
        days.delete(day);
      }
      state.slides[index].days = Array.from(days).sort();
      if (!state.slides[index].days.length) {
        state.slides[index].days = [0, 1, 2, 3, 4, 5, 6];
      }
      renderPlaylist();
      return;
    }

    const field = target.dataset.field;
    if (!field) {
      return;
    }

    state.slides[index][field] = field === "duration" ? Number(target.value || 10) : target.value;
    renderPreview();
  });

  playlistEl.addEventListener("input", (event) => {
    const target = event.target;
    const index = Number(target.dataset.index ?? -1);
    const field = target.dataset.field;
    if (!field || index < 0 || !state.slides[index]) return;
    state.slides[index][field] = field === "duration" ? Number(target.value || 10) : target.value;
    renderPreview();
  });

  preview.previous.addEventListener("click", () => {
    previewIndex -= 1;
    renderPreview();
    if (selectedTarget === 'slide') renderInspector();
  });
  preview.next.addEventListener("click", () => {
    previewIndex += 1;
    renderPreview();
    if (selectedTarget === 'slide') renderInspector();
  });
  function onPreviewLoad() {
    previewPlayerReady = true;
    observePreviewPlayer();
    renderPreview();
  }
  preview.player.addEventListener("load", onPreviewLoad);
  if (preview.player.contentDocument?.readyState === 'complete') onPreviewLoad();
  preview.hitLayer.addEventListener('click', (event) => {
    const button = event.target.closest('[data-select]');
    if (button) selectTarget(button.dataset.select);
  });
  document.querySelector('.canvas-toolbar').addEventListener('click', (event) => {
    const button = event.target.closest('[data-select]');
    if (button) selectTarget(button.dataset.select);
  });
  preview.inspectorClose.addEventListener('click', () => selectTarget(null));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && selectedTarget) selectTarget(null);
  });
  preview.inspectorFields.addEventListener('input', (event) => {
    const control = event.target;
    if (control.matches('[data-new-slide-url]')) control.setCustomValidity('');
    const key = control.dataset.bind;
    if (key && fields[key]) {
      if (control.type === 'checkbox') fields[key].checked = control.checked;
      else fields[key].value = control.value;
      renderPreview();
      publishStatus.textContent = 'Cambios sin publicar.';
      return;
    }
    const slideField = control.dataset.slideField;
    if (slideField && state.slides[previewIndex]) {
      state.slides[previewIndex][slideField] = slideField === 'duration' ? Number(control.value || 10) : control.value;
      const sidebarField = playlistEl.querySelector(`[data-index="${previewIndex}"][data-field="${slideField}"]`);
      if (sidebarField) sidebarField.value = control.value;
      renderPreview();
      publishStatus.textContent = 'Cambios sin publicar.';
    }
  });
  preview.inspectorFields.addEventListener('click', (event) => {
    const action = event.target.closest('[data-inspector-action]')?.dataset.inspectorAction;
    if (action === 'playlist') openSidebarPanel('playlist');
    if (action === 'add-url') {
      const input = preview.inspectorFields.querySelector('[data-new-slide-url]');
      const url = input?.value.trim();
      if (!url) {
        input?.focus();
        input?.setCustomValidity('Introduce una URL.');
        input?.reportValidity();
        return;
      }
      addSlide({
        name: preview.inspectorFields.querySelector('[data-new-slide-name]')?.value.trim() || 'Nuevo contenido',
        url,
        type: preview.inspectorFields.querySelector('[data-new-slide-type]')?.value || 'image',
      });
      publishStatus.textContent = 'Cambios sin publicar.';
    }
  });
  preview.inspectorFields.addEventListener('change', async (event) => {
    const input = event.target;
    const kind = input.dataset.canvasUpload;
    if (!kind || !input.files?.length) return;
    const replacementIndex = kind === 'media' && selectedTarget === 'slide' && state.slides.length ? previewIndex : -1;
    try {
      if (input.dataset.uploading === '1') return;
      input.dataset.uploading = '1';
      publishStatus.textContent = 'Subiendo archivo...';
      await uploadFile(input.closest('form'), (asset) => {
        if (kind === 'logo') {
          fields.logoUrl.value = asset.url;
          fields.logoShow.checked = true;
          renderPreview();
          renderInspector();
        } else if (replacementIndex >= 0 && state.slides[replacementIndex]) {
          state.slides[replacementIndex].url = asset.url;
          state.slides[replacementIndex].type = asset.type || 'image';
          renderPlaylist();
          renderInspector();
        } else {
          addSlide({
            name: asset.name || 'Archivo subido', url: asset.url,
            type: asset.type || 'image', fit: 'contain',
            duration: asset.type === 'video' ? 30 : 10,
          });
        }
      });
      publishStatus.textContent = 'Archivo listo. Pulsa «Publicar cambios».';
    } catch (error) {
      alert(error.message);
    } finally {
      delete input.dataset.uploading;
    }
  });
  preview.width.addEventListener("input", fitPreview);
  preview.height.addEventListener("input", fitPreview);
  new ResizeObserver(fitPreview).observe(preview.wrap);
  fields.orientation.addEventListener("change", () => {
    const defaultLandscape = preview.width.value === "1920" && preview.height.value === "1080";
    const defaultPortrait = preview.width.value === "1080" && preview.height.value === "1920";
    if (defaultLandscape || defaultPortrait) {
      preview.width.value = fields.orientation.value === "portrait" ? "1080" : "1920";
      preview.height.value = fields.orientation.value === "portrait" ? "1920" : "1080";
    }
    fitPreview();
  });
  document.querySelectorAll(".editor-sidebar input, .editor-sidebar select, .editor-sidebar textarea").forEach((field) => {
    field.addEventListener("input", () => {
      renderPreview();
      if (!field.readOnly && field.type !== 'file') publishStatus.textContent = 'Cambios sin publicar.';
    });
    field.addEventListener("change", renderPreview);
  });

  saveButton.addEventListener("click", async () => {
    const originalLabel = saveButton.textContent;
    saveButton.disabled = true;
    saveButton.textContent = "Guardando...";
    publishStatus.textContent = 'Publicando cambios...';

    try {
      await saveScreen();
      saveButton.textContent = "Publicado";
      publishStatus.textContent = 'Enviado a las pantallas conectadas.';
      setTimeout(() => {
        saveButton.textContent = originalLabel;
      }, 1500);
    } catch (error) {
      alert(error.message);
      saveButton.textContent = originalLabel;
      publishStatus.textContent = 'No se pudo publicar.';
    } finally {
      saveButton.disabled = false;
    }
  });

  mediaUploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await uploadFile(mediaUploadForm, (asset) => {
        addSlide({
          name: asset.name || "Archivo subido",
          url: asset.url,
          type: asset.type || "image",
          fit: "contain",
          duration: asset.type === "video" ? 30 : 10,
        });
      });
    } catch (error) {
      alert(error.message);
    }
  });

  logoUploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await uploadFile(logoUploadForm, (asset) => {
        fields.logoUrl.value = asset.url;
        fields.logoShow.checked = true;
        renderPreview();
        publishStatus.textContent = 'Cambios sin publicar.';
      });
    } catch (error) {
      alert(error.message);
    }
  });

  setInitialWidgetValues();
  renderPlaylist();
})();
