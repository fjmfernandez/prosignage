(() => {
  const cfg = window.PROSIGNAGE_PLAYER || {};
  const params = new URLSearchParams(window.location.search);
  const screenPublicId = cfg.screen || params.get("screen");
  const playerKey = cfg.key || params.get("key");
  const previewMode = cfg.preview === true;

  const els = {
    content: document.getElementById("content"),
    logo: document.getElementById("logo"),
    clock: document.getElementById("clock"),
    bar: document.getElementById("bar"),
    weather: document.getElementById("weather"),
    ticker: document.getElementById("ticker"),
    tickerTxt: document.getElementById("tickerTxt"),
    dot: document.getElementById("dot"),
    hint: document.getElementById("hint"),
    fallback: document.getElementById("fallback"),
    status: document.getElementById("status"),
  };

  let model = null;
  let weatherData = null;
  let playIndex = 0;
  let rotationTimer = null;
  let bootstrapInterval = null;
  let heartbeatInterval = null;
  let commandInterval = null;
  let serverTimeOffset = 0;
  let statusHideTimeout = null;
  let lastRevision = "";
  let systemInfo = {
    privateIP: "Detectando...",
    publicIP: "Detectando...",
    browser: "",
    os: "",
    screenResolution: "",
    connectionType: "",
    connectionSpeed: "",
    currentSlide: null,
    userAgent: "",
    isFreeKiosk: false,
    freekioskVersion: null,
  };

  const cacheKey = !previewMode && screenPublicId ? `prosignage_screen_${screenPublicId}` : null;

  function apiUrl(base) {
    const url = new URL(base, window.location.origin);
    url.searchParams.set("screen", screenPublicId || "");
    url.searchParams.set("key", playerKey || "");
    return url.toString();
  }

  function setOnlineState(isOnline) {
    els.dot.classList.toggle("ok", isOnline);
    els.hint.textContent = isOnline ? "online" : "offline";
    els.status.classList.remove("online-hidden");

    if (isOnline) {
      window.clearTimeout(statusHideTimeout);
      statusHideTimeout = window.setTimeout(() => {
        els.status.classList.add("online-hidden");
      }, 5000);
    } else {
      window.clearTimeout(statusHideTimeout);
    }
  }

  function showFallback(message) {
    els.fallback.style.display = "flex";
    if (message) {
      const paragraph = els.fallback.querySelector("p");
      if (paragraph) {
        paragraph.textContent = message;
      }
    }
  }

  function hideFallback() {
    els.fallback.style.display = "none";
  }

  function loadCached() {
    if (!cacheKey) {
      return null;
    }
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveCached(data) {
    if (!cacheKey) {
      return;
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (error) {
    }
  }

  async function prepareOfflineShell() {
    if (previewMode || !('serviceWorker' in navigator) || !('caches' in window)) return;
    await navigator.serviceWorker.register(cfg.serviceWorkerUrl);
    const cache = await caches.open('prosignage-shell-v3');
    const urls = [window.location.href, ...Array.from(document.querySelectorAll('link[rel="stylesheet"], script[src]'))
      .map((element) => element.href || element.src)
      .filter((url) => new URL(url).origin === window.location.origin)];
    await Promise.allSettled(urls.map(async (url) => {
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (response.ok) await cache.put(url, response);
    }));
  }

  async function prefetchImages(slides) {
    if (previewMode || !('caches' in window)) return;
    const cache = await caches.open('prosignage-media-v3');
    const urls = [...new Set(slides
      .filter((slide) => guessType(slide.url, slide.type) === 'image')
      .map((slide) => {
        try {
          const url = new URL(slide.url, window.location.origin);
          return url.origin === window.location.origin && url.pathname.includes('/storage/uploads/') ? url.href : null;
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean))];
    for (const url of urls) {
      try {
        if (await cache.match(url)) continue;
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch (error) {
        // The next successful refresh can try again.
      }
    }
  }

  async function syncServerTime() {
    try {
      const start = Date.now();
      const response = await fetch("https://worldtimeapi.org/api/timezone/Europe/Madrid", { cache: "no-store" });
      const latency = (Date.now() - start) / 2;
      const payload = await response.json();
      const serverTime = new Date(payload.datetime).getTime();
      serverTimeOffset = serverTime - Date.now() + latency;
    } catch (error) {
      serverTimeOffset = 0;
    }
  }

  function getCurrentTime() {
    return new Date(Date.now() + serverTimeOffset);
  }

  function hhmm(date) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }

  function tickClock() {
    const date = getCurrentTime();
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    els.clock.textContent = `${h}:${m}:${s}`;
  }

  function weatherCacheKey(city) {
    return `prosignage_weather_${city.toLowerCase()}`;
  }

  async function fetchWeather(city) {
    if (!city) {
      return null;
    }

    const key = weatherCacheKey(city);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts < 2 * 60 * 60 * 1000) {
          return parsed.data;
        }
      }
    } catch (error) {
    }

    try {
      const geoReq = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=es&format=json`,
        { cache: "no-store" }
      );
      const geo = await geoReq.json();
      if (!geo.results || !geo.results.length) {
        return null;
      }

      const { latitude, longitude, name } = geo.results[0];
      const weatherReq = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=3`,
        { cache: "no-store" }
      );
      const weather = await weatherReq.json();
      const output = {
        location: name,
        days: weather.daily.time.map((time, index) => ({
          dayName: new Date(time).toLocaleDateString("es-ES", { weekday: "short" }),
          temp: Math.round(weather.daily.temperature_2m_max[index]),
          rain: weather.daily.precipitation_probability_max[index] || 0,
        })),
      };

      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: output }));
      return output;
    } catch (error) {
      return null;
    }
  }

  async function fetchRss(url) {
    if (!url) {
      return null;
    }

    const key = `prosignage_rss_${url}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.ts < 15 * 60 * 1000) {
          return parsed.data;
        }
      }
    } catch (error) {
    }

    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      const payload = await response.json();
      const parser = new DOMParser();
      const xml = parser.parseFromString(payload.contents, "text/xml");
      const items = Array.from(xml.querySelectorAll("item")).slice(0, 10);
      const text = items
        .map((item) => item.querySelector("title")?.textContent?.trim() || "")
        .filter(Boolean)
        .join(" | ");

      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: text }));
      return text;
    } catch (error) {
      return null;
    }
  }

  function guessType(url, type) {
    if (type) {
      return type;
    }
    const value = String(url || "").toLowerCase();
    if (value.includes(".mp4") || value.includes(".webm") || value.includes(".m3u8")) {
      return "video";
    }
    if (value.includes("youtube.com") || value.includes("youtu.be") || value.endsWith(".html")) {
      return "web";
    }
    return "image";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getActiveSlides() {
    const now = getCurrentTime();
    const day = now.getDay();
    const time = hhmm(now);
    const slides = Array.isArray(model?.slides) ? model.slides : [];

    return slides.filter((slide) => {
      const days = Array.isArray(slide.days) && slide.days.length ? slide.days : [0, 1, 2, 3, 4, 5, 6];
      const start = slide.startTime || "00:00";
      const end = slide.endTime || "23:59";
      return days.includes(day) && start <= time && time <= end;
    });
  }

  async function applyWidgets() {
    const widgets = model?.widgets || {};

    if (widgets.logo?.show && widgets.logo?.url) {
      els.logo.style.display = "";
      els.logo.src = widgets.logo.url;
      els.logo.className = `p-logo ${widgets.logo.pos || "pos-top-left"}`;
      els.logo.style.maxWidth = `${widgets.logo.size || 15}%`;
    } else {
      els.logo.style.display = "none";
    }

    if (widgets.clock?.show) {
      els.clock.style.display = "";
      els.clock.className = `p-clock ${widgets.clock.pos || "pos-top-right"}`;
      const sizeMap = { small: "18px", medium: "28px", large: "42px" };
      els.clock.style.fontSize = sizeMap[widgets.clock.size || "medium"] || "28px";
      els.clock.style.color = widgets.clock.color || "#ffffff";
    } else {
      els.clock.style.display = "none";
    }

    const showWeather = !!widgets.weather?.show && !!widgets.weather?.city;
    const showTicker = !!widgets.ticker?.active;
    const weatherLayout = widgets.weather?.layout || "horizontal";

    if (showWeather) {
      weatherData = await fetchWeather(widgets.weather.city);
    } else {
      weatherData = null;
    }

    if (showWeather && weatherData) {
      if (weatherLayout === "vertical") {
        els.bar.style.display = showTicker ? "" : "none";
        els.weather.style.display = "none";
        let verticalWidget = document.getElementById("weather-vertical");
        if (!verticalWidget) {
          verticalWidget = document.createElement("div");
          verticalWidget.id = "weather-vertical";
          verticalWidget.className = "weather-vertical";
          document.getElementById("stage").appendChild(verticalWidget);
        }
        verticalWidget.innerHTML = `
          <div class="weather-location-enhanced">${escapeHtml(weatherData.location)}</div>
          ${weatherData.days
            .map((day, index) => {
              const date = new Date();
              date.setDate(date.getDate() + index);
              const fullDate = date.toLocaleDateString("es-ES", {
                weekday: "long",
                day: "numeric",
                month: "short",
              });
              return `
                <div class="weather-day-enhanced">
                  <div class="weather-date">${escapeHtml(fullDate)}</div>
                  <div class="weather-temp-row">
                    <span>${escapeHtml(day.temp)} C</span>
                    <span>${escapeHtml(day.rain)}% lluvia</span>
                  </div>
                </div>
              `;
            })
            .join("")}
        `;
      } else {
        const verticalWidget = document.getElementById("weather-vertical");
        if (verticalWidget) {
          verticalWidget.remove();
        }
        els.bar.style.display = showWeather || showTicker ? "" : "none";
        els.weather.style.display = "";
        els.weather.innerHTML = `
          <div class="weather-location">${escapeHtml(weatherData.location)}</div>
          <div class="weather-days">
            ${weatherData.days
              .map(
                (day) => `
                  <div class="w-day">
                    <div class="w-name">${escapeHtml(day.dayName)}</div>
                    <div class="w-temp">${escapeHtml(day.temp)} C</div>
                    <div class="w-rain">${escapeHtml(day.rain)}%</div>
                  </div>
                `
              )
              .join("")}
          </div>
        `;
      }
    } else {
      els.weather.style.display = "none";
      const verticalWidget = document.getElementById("weather-vertical");
      if (verticalWidget) {
        verticalWidget.remove();
      }
      els.bar.style.display = showTicker ? "" : "none";
    }

    if (showTicker) {
      let tickerText = "";
      if (widgets.ticker.mode === "rss" && widgets.ticker.rssUrl) {
        tickerText = (await fetchRss(widgets.ticker.rssUrl)) || widgets.ticker.text || "";
      } else {
        tickerText = widgets.ticker.text || "";
      }

      els.ticker.style.display = "";
      els.tickerTxt.textContent = tickerText;
      els.tickerTxt.style.setProperty("--speed", `${Math.max(8, Number(widgets.ticker.speed || 18))}s`);
      els.tickerTxt.style.fontSize = `${Number(widgets.ticker.fontSize || 14)}px`;
      els.tickerTxt.style.color = widgets.ticker.color || "#ffffff";
    } else {
      els.ticker.style.display = "none";
    }

    const showRssSidebar = !!widgets.rssSidebar?.show && !!widgets.rssSidebar?.url;
    if (showRssSidebar) {
      const sidebarText = await fetchRss(widgets.rssSidebar.url);
      const items = String(sidebarText || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8);

      let rssWidget = document.getElementById("rss-sidebar");
      if (!rssWidget) {
        rssWidget = document.createElement("div");
        rssWidget.id = "rss-sidebar";
        document.getElementById("stage").appendChild(rssWidget);
      }
      rssWidget.className = `rss-sidebar ${widgets.rssSidebar.pos || "pos-top-right"}`;
      rssWidget.innerHTML = `
        <div class="rss-title">Noticias</div>
        ${items.map((item) => `<div class="rss-item">${escapeHtml(item)}</div>`).join("")}
      `;
    } else {
      const rssWidget = document.getElementById("rss-sidebar");
      if (rssWidget) {
        rssWidget.remove();
      }
    }
  }

  function renderSlide(slide) {
    if (!slide) {
      return;
    }

    let mediaUrl;
    try {
      mediaUrl = new URL(slide.url, window.location.origin);
      if (!['http:', 'https:'].includes(mediaUrl.protocol)) throw new Error('URL no admitida');
    } catch (error) {
      els.content.replaceChildren();
      showFallback("La URL del contenido no es valida.");
      return;
    }

    systemInfo.currentSlide = {
      name: slide.name || "Sin nombre",
      url: slide.url || "",
      type: guessType(slide.url, slide.type),
      duration: slide.duration || 10,
    };

    const type = guessType(slide.url, slide.type);
    const fit = ["contain", "cover", "fill"].includes(slide.fit) ? slide.fit : "contain";
    let media;
    if (type === "video") {
      media = document.createElement("video");
      media.id = "player-video";
      media.autoplay = true;
      media.playsInline = true;
      media.muted = true;
      media.loop = true;
    } else if (type === "web") {
      media = document.createElement("iframe");
      media.setAttribute("sandbox", "allow-same-origin allow-scripts allow-forms allow-popups");
      media.title = slide.name || "Contenido web";
    } else {
      media = document.createElement("img");
      media.alt = slide.name || "";
      media.loading = "eager";
      media.decoding = "async";
    }
    if (type !== "web") media.style.objectFit = fit;
    media.addEventListener("error", () => {
      if (media.isConnected) showFallback("No se pudo cargar el contenido de esta pantalla.");
    });
    media.src = mediaUrl.href;
    els.content.replaceChildren(media);
  }

  function next() {
    window.clearTimeout(rotationTimer);
    const activeSlides = getActiveSlides();
    if (!activeSlides.length) {
      showFallback("No hay contenido activo en este horario.");
      els.content.replaceChildren();
      return;
    }

    hideFallback();

    if (activeSlides.length === 1) {
      const slide = activeSlides[0];
      renderSlide(slide);
      rotationTimer = window.setTimeout(next, Number(slide.duration || 10) * 1000);
      return;
    }

    const slide = activeSlides[playIndex % activeSlides.length];
    playIndex = (playIndex + 1) % activeSlides.length;
    renderSlide(slide);
    rotationTimer = window.setTimeout(next, Number(slide.duration || 10) * 1000);
  }

  function getSystemInfo() {
    const ua = navigator.userAgent;
    systemInfo.userAgent = ua;
    systemInfo.isFreeKiosk = ua.includes("FreeKiosk") || params.get("freekiosk") === "1";
    systemInfo.browser = systemInfo.isFreeKiosk
      ? "FreeKiosk"
      : ua.includes("Firefox")
        ? "Firefox"
        : ua.includes("Edg")
          ? "Edge"
          : ua.includes("Chrome")
            ? "Chrome"
            : ua.includes("Safari")
              ? "Safari"
              : "Unknown";

    systemInfo.os = ua.includes("Windows")
      ? "Windows"
      : ua.includes("Android")
        ? "Android"
        : ua.includes("Mac")
          ? "MacOS"
          : ua.includes("Linux")
            ? "Linux"
            : "Unknown";

    systemInfo.screenResolution = `${window.screen.width}x${window.screen.height}`;
    if ("connection" in navigator) {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (connection) {
        systemInfo.connectionType = connection.effectiveType || connection.type || "unknown";
        systemInfo.connectionSpeed = connection.downlink ? `${connection.downlink} Mbps` : "unknown";
      }
    }

    return systemInfo;
  }

  async function detectIps() {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      pc.onicecandidate = (event) => {
        const candidate = event?.candidate?.candidate || "";
        const parts = candidate.split(" ");
        const ip = parts[4];
        if (ip) {
          systemInfo.privateIP = ip;
        }
      };
    } catch (error) {
      systemInfo.privateIP = "No disponible";
    }

    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const payload = await response.json();
      systemInfo.publicIP = payload.ip || "No disponible";
    } catch (error) {
      systemInfo.publicIP = "No disponible";
    }
  }

  async function detectKioskApi() {
    if (systemInfo.isFreeKiosk || systemInfo.os !== "Android") {
      return;
    }

    try {
      await fetch("http://localhost:8080/", { method: "GET" });
      systemInfo.isFreeKiosk = true;
      systemInfo.browser = "FreeKiosk";
      systemInfo.freekioskVersion = "detected-via-api";
    } catch (error) {
    }
  }

  async function executeKioskCommand(command) {
    if (!command || !command.action) {
      return false;
    }

    const baseUrl = "http://localhost:8080";
    try {
      switch (command.action) {
        case "reload":
          window.location.reload();
          break;
        case "clearcache":
          await fetch(`${baseUrl}/clearcache`, { method: "POST" });
          window.setTimeout(() => window.location.reload(), 1000);
          break;
        case "restart":
          await fetch(`${baseUrl}/restart`, { method: "POST" });
          break;
        case "reboot":
          await fetch(`${baseUrl}/reboot`, { method: "POST" });
          break;
        case "changeurl":
          if (command.url) {
            window.location.href = command.url;
          }
          break;
        default:
          return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async function acknowledgeCommand(commandId, status, message = "") {
    await fetch(apiUrl(cfg.commandAckUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        commandId,
        status,
        message,
      }),
    });
  }

  async function pollCommands() {
    try {
      const response = await fetch(apiUrl(cfg.commandUrl), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.command) {
        return;
      }

      const success = await executeKioskCommand(payload.command);
      await acknowledgeCommand(payload.command.id, success ? "executed" : "failed", success ? "OK" : "Fallo al ejecutar");
    } catch (error) {
    }
  }

  async function sendHeartbeat() {
    if (!screenPublicId || !playerKey) {
      return;
    }

    const info = getSystemInfo();
    try {
      await fetch(apiUrl(cfg.heartbeatUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          privateIP: info.privateIP,
          publicIP: info.publicIP,
          browser: info.browser,
          os: info.os,
          screenResolution: info.screenResolution,
          connectionType: info.connectionType,
          connectionSpeed: info.connectionSpeed,
          userAgent: info.userAgent,
          currentSlide: info.currentSlide,
          isFreeKiosk: info.isFreeKiosk,
          freekioskVersion: info.freekioskVersion,
        }),
      });
    } catch (error) {
    }
  }

  async function bootFromPayload(payload) {
    model = payload;
    lastRevision = payload.revision;
    saveCached(payload);
    syncServerTime().then(tickClock).catch(() => {});
    playIndex = 0;
    next();
    await applyWidgets();
    prefetchImages(payload.slides || []).catch(() => {});
  }

  async function fetchBootstrap() {
    const response = await fetch(apiUrl(cfg.bootstrapUrl), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "No se pudo cargar la configuracion");
    }
    return payload.data;
  }

  async function refreshBootstrap() {
    try {
      const data = await fetchBootstrap();
      hideFallback();
      if (data.revision !== lastRevision) {
        await bootFromPayload(data);
      }
      setOnlineState(true);
    } catch (error) {
      setOnlineState(false);
      if (!model) {
        showFallback("No se pudo cargar la configuracion de la pantalla.");
      }
    }
  }

  function ensureIntervals() {
    if (!bootstrapInterval) {
      bootstrapInterval = window.setInterval(refreshBootstrap, 60000);
    }
    if (!heartbeatInterval) {
      heartbeatInterval = window.setInterval(sendHeartbeat, 60000);
    }
    if (!commandInterval) {
      commandInterval = window.setInterval(pollCommands, 5000);
    }
  }

  let pendingPreview = null;
  let previewBusy = false;
  let previewUpdateTimeout = null;

  async function processPreview() {
    if (previewBusy) return;
    previewBusy = true;
    try {
      while (pendingPreview) {
        const update = pendingPreview;
        pendingPreview = null;
        model = update.model;
        const slide = model.slides[update.slideIndex];
        if (slide?.url) {
          hideFallback();
          renderSlide(slide);
        } else {
          els.content.replaceChildren();
          showFallback("Agrega un contenido para ver la pantalla.");
        }
        await applyWidgets();
      }
    } finally {
      previewBusy = false;
    }
  }

  async function init() {
    window.setInterval(tickClock, 1000);
    tickClock();
    if (previewMode) {
      window.addEventListener("message", (event) => {
        if (event.origin !== window.location.origin || event.source !== window.parent) return;
        const data = event.data;
        if (data?.type !== "prosignage-preview" || !data.model || !Array.isArray(data.model.slides) || !data.model.widgets) return;
        pendingPreview = { model: data.model, slideIndex: Number.isInteger(data.slideIndex) ? data.slideIndex : 0 };
        window.clearTimeout(previewUpdateTimeout);
        previewUpdateTimeout = window.setTimeout(processPreview, 80);
      });
      syncServerTime().then(tickClock).catch(() => {});
      return;
    }

    window.addEventListener("online", () => setOnlineState(true));
    window.addEventListener("offline", () => setOnlineState(false));
    setOnlineState(navigator.onLine);

    if (!screenPublicId || !playerKey) {
      showFallback("Falta screen o key en la URL.");
      return;
    }

    const cached = loadCached();
    if (cached) {
      bootFromPayload(cached).catch(() => {});
    }

    detectIps().catch(() => {});
    getSystemInfo();
    detectKioskApi().catch(() => {});
    await refreshBootstrap();
    ensureIntervals();
    sendHeartbeat().catch(() => {});
    prepareOfflineShell().catch(() => {});
  }

  init().catch(() => {
    showFallback("No se pudo iniciar el player.");
  });
})();
