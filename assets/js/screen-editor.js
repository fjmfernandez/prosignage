(() => {
  const initial = window.PROSIGNAGE_SCREEN;
  if (!initial) {
    return;
  }

  const endpoints = window.PROSIGNAGE_ENDPOINTS || {};
  const csrf = window.PROSIGNAGE_CSRF || "";
  const state = JSON.parse(JSON.stringify(initial));

  const playlistEl = document.getElementById("playlist-editor");
  const saveButton = document.getElementById("save-screen");
  const addUrlButton = document.getElementById("add-url-slide");
  const mediaUploadForm = document.getElementById("media-upload-form");
  const logoUploadForm = document.getElementById("logo-upload-form");

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
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
    renderPlaylist();
  }

  function swapSlides(a, b) {
    if (a < 0 || b < 0 || a >= state.slides.length || b >= state.slides.length) {
      return;
    }
    const temp = state.slides[a];
    state.slides[a] = state.slides[b];
    state.slides[b] = temp;
    renderPlaylist();
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
  });

  saveButton.addEventListener("click", async () => {
    const originalLabel = saveButton.textContent;
    saveButton.disabled = true;
    saveButton.textContent = "Guardando...";

    try {
      await saveScreen();
      saveButton.textContent = "Guardado";
      setTimeout(() => {
        saveButton.textContent = originalLabel;
      }, 1500);
    } catch (error) {
      alert(error.message);
      saveButton.textContent = originalLabel;
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
      });
    } catch (error) {
      alert(error.message);
    }
  });

  setInitialWidgetValues();
  renderPlaylist();
})();
