(() => {
  const cfg = window.PROSIGNAGE_PLAYER || {};
  const params = new URLSearchParams(window.location.search);
  const screenPublicId = cfg.screen || params.get("screen");
  const playerKey = cfg.key || params.get("key");
  const previewMode = cfg.preview === true;

  const els = {
    stage: document.getElementById("stage"),
    content: document.getElementById("content"),
    logo: document.getElementById("logo"),
    clock: document.getElementById("clock"),
    bar: document.getElementById("bar"),
    weather: document.getElementById("weather"),
    ticker: document.getElementById("ticker"),
    tickerTxt: document.getElementById("tickerTxt"),
    tickerClone: document.getElementById("tickerClone"),
    tickerLabel: document.getElementById("tickerLabel"),
    tickerWindow: document.getElementById("tickerWindow"),
    tickerTrack: document.getElementById("tickerTrack"),
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
  let widgetInterval = null;
  let scheduleInterval = null;
  let activeSignature = '';
  let bootstrapInFlight = false;
  let bootstrapRequested = false;
  let updateChannel = null;
  let widgetGeneration = 0;
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
    return `prosignage_weather_v2_${city.toLowerCase()}`;
  }

  async function fetchWeather(city) {
    if (!city) {
      return null;
    }

    const key = weatherCacheKey(city);
    let staleData = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        staleData = parsed.data || null;
        if (Date.now() - parsed.ts < 30 * 60 * 1000) {
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
      if (!geoReq.ok || !geo.results || !geo.results.length) {
        return staleData;
      }

      const { latitude, longitude, name } = geo.results[0];
      const weatherReq = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=3`,
        { cache: "no-store" }
      );
      const weather = await weatherReq.json();
      if (!weatherReq.ok || !Array.isArray(weather.daily?.time)) return staleData;
      const output = {
        location: name,
        days: weather.daily.time.map((time, index) => ({
          dayName: new Date(`${time}T12:00:00`).toLocaleDateString("es-ES", { weekday: "short" }),
          temp: Math.round(weather.daily.temperature_2m_max[index]),
          low: Math.round(weather.daily.temperature_2m_min[index]),
          rain: weather.daily.precipitation_probability_max[index] || 0,
          code: Number(weather.daily.weather_code[index] || 0),
        })),
      };

      try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: output })); } catch (error) { /* Cache is optional. */ }
      return output;
    } catch (error) {
      return staleData;
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

      try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: text })); } catch (error) { /* Cache is optional. */ }
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

  function weatherCondition(code) {
    const value = Number(code);
    if (value === 0) return { kind: 'sun', label: 'Despejado' };
    if (value === 1 || value === 2) return { kind: 'partly', label: 'Poco nuboso' };
    if (value === 3) return { kind: 'cloud', label: 'Nublado' };
    if (value === 45 || value === 48) return { kind: 'fog', label: 'Niebla' };
    if ([71, 73, 75, 77, 85, 86].includes(value)) return { kind: 'snow', label: 'Nieve' };
    if ([95, 96, 97, 99].includes(value)) return { kind: 'storm', label: 'Tormenta' };
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(value)) {
      return { kind: 'rain', label: 'Lluvia' };
    }
    return { kind: 'cloud', label: 'Variable' };
  }

  function weatherIcon(code) {
    const { kind, label } = weatherCondition(code);
    const sun = '<circle cx="24" cy="23" r="9" fill="#fbbf24"/><path d="M24 3v7M24 36v7M4 23h7M37 23h7M10 9l5 5M33 32l5 5M38 9l-5 5M15 32l-5 5" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>';
    const cloud = '<path d="M18 45h29a9 9 0 0 0 0-18 15 15 0 0 0-28-3 11 11 0 0 0-1 21Z" fill="#e0e7ff" stroke="#9ca3c4" stroke-width="2.5" stroke-linejoin="round"/>';
    let shapes = '';
    if (kind === 'sun') shapes = sun;
    else if (kind === 'partly') shapes = `${sun}${cloud}`;
    else if (kind === 'cloud') shapes = cloud;
    else if (kind === 'fog') shapes = `${cloud}<path d="M12 52h38M18 58h28" stroke="#a5b4fc" stroke-width="3" stroke-linecap="round"/>`;
    else if (kind === 'rain') shapes = `${cloud}<path d="M21 49l-3 8M34 49l-3 8M47 49l-3 8" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>`;
    else if (kind === 'snow') shapes = `${cloud}<path d="M19 53h8m-4-4v8m13-4h8m-4-4v8" stroke="#a5f3fc" stroke-width="3" stroke-linecap="round"/>`;
    else shapes = `${cloud}<path d="M35 46l-8 9h7l-4 7 13-12h-8l5-4" fill="#fde047"/>`;
    return `<svg class="weather-icon weather-icon-${kind}" viewBox="0 0 64 64" role="img" aria-label="${label}">${shapes}</svg>`;
  }

  function updateTickerMetrics() {
    if (els.ticker.style.display === 'none') return;
    const windowWidth = els.tickerWindow.clientWidth;
    if (windowWidth < 1) return;
    els.tickerTxt.style.minWidth = '0px';
    els.tickerClone.style.minWidth = '0px';
    const segmentWidth = Math.max(windowWidth, els.tickerTxt.scrollWidth);
    for (const copy of [els.tickerTxt, els.tickerClone]) copy.style.minWidth = `${segmentWidth}px`;
    const configuredSpeed = Number(model?.widgets?.ticker?.speed);
    const secondsPerScreen = Number.isFinite(configuredSpeed) ? Math.max(8, Math.min(120, configuredSpeed)) : 18;
    els.tickerTrack.style.setProperty('--ticker-duration', `${secondsPerScreen * segmentWidth / windowWidth}s`);
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
    const generation = ++widgetGeneration;
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
      const latestWeather = await fetchWeather(widgets.weather.city);
      if (generation !== widgetGeneration) return;
      weatherData = latestWeather;
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
          <div class="weather-kicker">PRONOSTICO</div>
          <div class="weather-location-enhanced">${escapeHtml(weatherData.location)}</div>
          ${weatherData.days
            .map((day, index) => {
              const dayLabel = index === 0 ? 'Hoy' : index === 1 ? 'Mañana' : day.dayName;
              return `
                <div class="weather-day-enhanced">
                  ${weatherIcon(day.code)}
                  <div class="weather-day-copy">
                    <div class="weather-date">${escapeHtml(dayLabel)}</div>
                    <div class="weather-description">${weatherCondition(day.code).label}</div>
                  </div>
                  <div class="weather-day-numbers"><strong>${escapeHtml(day.temp)}°</strong><span>${escapeHtml(day.rain)}% lluvia</span></div>
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
          <div class="weather-heading"><span class="weather-kicker">TIEMPO EN</span><strong class="weather-location">${escapeHtml(weatherData.location)}</strong></div>
          <div class="weather-days">
            ${weatherData.days
              .map(
                (day, index) => `
                  <div class="w-day">
                    <div class="w-name">${escapeHtml(index === 0 ? 'Hoy' : index === 1 ? 'Mañana' : day.dayName)}</div>
                    ${weatherIcon(day.code)}
                    <div class="w-temp">${escapeHtml(day.temp)}° <small>${escapeHtml(day.low)}°</small></div>
                    <div class="w-rain">${escapeHtml(day.rain)}% lluvia</div>
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
        if (generation !== widgetGeneration) return;
      } else {
        tickerText = widgets.ticker.text || "";
      }

      els.ticker.style.display = "";
      els.tickerLabel.textContent = widgets.ticker.mode === 'rss' ? 'NOTICIAS' : 'AVISOS';
      for (const copy of [els.tickerTxt, els.tickerClone]) {
        copy.textContent = tickerText || 'Sin avisos';
        copy.style.fontSize = `${Number(widgets.ticker.fontSize || 14)}px`;
        copy.style.color = widgets.ticker.color || "#ffffff";
      }
      updateTickerMetrics();
    } else {
      els.ticker.style.display = "none";
    }

    const showRssSidebar = !!widgets.rssSidebar?.show && !!widgets.rssSidebar?.url;
    if (showRssSidebar) {
      const sidebarText = await fetchRss(widgets.rssSidebar.url);
      if (generation !== widgetGeneration) return;
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
    activeSignature = JSON.stringify(activeSlides.map((slide) => [slide.name, slide.url, slide.startTime, slide.endTime, slide.days]));
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
    els.stage.dataset.revision = payload.revision;
    saveCached(payload);
    syncServerTime().then(tickClock).catch(() => {});
    playIndex = 0;
    next();
    applyWidgets().catch(() => {});
    prefetchImages(payload.slides || []).catch(() => {});
  }

  async function fetchBootstrap() {
    const url = new URL(apiUrl(cfg.bootstrapUrl));
    if (lastRevision) url.searchParams.set('revision', lastRevision);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetch(url.toString(), { cache: "no-store", signal: controller.signal });
    } finally {
      window.clearTimeout(timeout);
    }
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "No se pudo cargar la configuracion");
    }
    return payload;
  }

  async function refreshBootstrap() {
    if (bootstrapInFlight) {
      bootstrapRequested = true;
      return;
    }
    bootstrapInFlight = true;
    try {
      const payload = await fetchBootstrap();
      if (!payload.unchanged && payload.data?.revision !== lastRevision) {
        await bootFromPayload(payload.data);
      }
      setOnlineState(true);
    } catch (error) {
      setOnlineState(false);
      if (!model) {
        showFallback("No se pudo cargar la configuracion de la pantalla.");
      }
    } finally {
      bootstrapInFlight = false;
      if (bootstrapRequested) {
        bootstrapRequested = false;
        window.setTimeout(refreshBootstrap, 0);
      }
    }
  }

  function ensureIntervals() {
    if (!bootstrapInterval) {
      bootstrapInterval = window.setInterval(refreshBootstrap, 2000);
    }
    if (!heartbeatInterval) {
      heartbeatInterval = window.setInterval(sendHeartbeat, 60000);
    }
    if (!commandInterval) {
      commandInterval = window.setInterval(pollCommands, 5000);
    }
    if (!widgetInterval) {
      widgetInterval = window.setInterval(() => applyWidgets().catch(() => {}), 15 * 60 * 1000);
    }
    if (!scheduleInterval) {
      scheduleInterval = window.setInterval(() => {
        const signature = JSON.stringify(getActiveSlides().map((slide) => [slide.name, slide.url, slide.startTime, slide.endTime, slide.days]));
        if (signature !== activeSignature) {
          playIndex = 0;
          next();
        }
      }, 15000);
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
    if ('ResizeObserver' in window) new ResizeObserver(updateTickerMetrics).observe(els.tickerWindow);
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

    window.addEventListener("online", () => refreshBootstrap());
    window.addEventListener("offline", () => setOnlineState(false));
    window.addEventListener("focus", refreshBootstrap);
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
    if ('BroadcastChannel' in window) {
      updateChannel = new BroadcastChannel('prosignage-screen-updates');
      updateChannel.addEventListener('message', (event) => {
        if (event.data?.type === 'screen-saved' && Number(event.data.screenId) === Number(model?.screenId)) {
          refreshBootstrap();
        }
      });
    }
    sendHeartbeat().catch(() => {});
    prepareOfflineShell().catch(() => {});
  }

  init().catch(() => {
    showFallback("No se pudo iniciar el player.");
  });
})();
