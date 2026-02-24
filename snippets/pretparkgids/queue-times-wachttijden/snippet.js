/** =========================
 * Queue-Times Wachttijden – generiek voor 1 t/m 3 park-API’s
 * Configureer parken en tab-namen in CONFIG_PARKS hieronder.
 * ========================= */
const API_BASE = "https://pretparkgids.nl/api/wachttijden/";

/**
 * Configuratie parken (max 3).
 *
 * - parks: array van 1 t/m 3 parken. Elk item is een string (URL of slug) of een object:
 *   - url: volledige JSON-URL of alleen slug (bijv. "toverland" -> wordt .../toverland.json)
 *   - name: label op de tab-knoppen (optioneel; anders wordt naam uit de url afgeleid, bijv. "walibi-holland" -> "Walibi Holland")
 * - Bij 1 park: geen tabs. Bij 2 of 3 parken: tab-knoppen om te wisselen; de namen komen uit name of uit de url.
 */
const CONFIG_PARKS = [{ url: "walibi-holland", name: "Walibi Holland" }];

function resolveParkConfigs() {
  const root = document.getElementById("ppg-wachttijden");
  const maxParks = 3;

  function slugFromUrl(url) {
    if (!url) return "";
    const m = String(url).match(/\/([^/]+)\.json$/);
    return m
      ? m[1]
      : String(url)
          .replace(/\.json$/i, "")
          .trim() || "";
  }
  function nameFromSlug(slug) {
    if (!slug) return "Park";
    return slug
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
  }
  function toFullUrl(url) {
    const u = String(url).trim();
    if (u.startsWith("http")) return u;
    return API_BASE + u.replace(/\.json$/i, "") + ".json";
  }

  let list = Array.isArray(CONFIG_PARKS) ? CONFIG_PARKS.slice(0, maxParks) : [];
  if (!list.length && root) {
    const url1 = (root.getAttribute("data-api-url") || "").trim();
    const url2 = (root.getAttribute("data-api-url-2") || "").trim();
    const url3 = (root.getAttribute("data-api-url-3") || "").trim();
    if (url1) list.push({ url: url1, name: "" });
    if (url2) list.push({ url: url2, name: "" });
    if (url3) list.push({ url: url3, name: "" });
  }

  const configs = list
    .map((entry) => {
      const url = typeof entry === "string" ? entry : entry && entry.url;
      const name =
        typeof entry === "object" && entry && entry.name != null
          ? String(entry.name)
          : null;
      const apiUrl = toFullUrl(url);
      const slug = slugFromUrl(apiUrl) || slugFromUrl(url);
      return {
        apiUrl,
        name: name && name.trim() ? name.trim() : nameFromSlug(slug),
      };
    })
    .filter((c) => c.apiUrl);

  const parkKey = configs.length
    ? slugFromUrl(configs[0].apiUrl)
    : "queue-times";
  return { parkConfigs: configs, parkKey };
}

const resolved = resolveParkConfigs();

const CONFIG = {
  parkKey: resolved.parkKey,
  parkConfigs: resolved.parkConfigs,
  locale: "nl-NL",
  accent: "#db4534",
  refreshIntervalMs: 45000,
  manualCooldownMs: 8000,
  liveGoodMaxMinutes: 9,
  liveWarnMaxMinutes: 19,
  topNFromFavorites: 5,
  bestCollapsedLimit: 3,
  maintCollapsedLimit: 3,
  defaultFavoriteIds: [],
};

const STORAGE_KEYS = {
  favorites: `ppg_waiting_${CONFIG.parkKey}_favorites_v4`,
  cache: `ppg_waiting_${CONFIG.parkKey}_cache_v4`,
};

const state = {
  parkData: [],
  currentParkIndex: 0,
  data: null,
  normalized: null,
  favorites: loadFavorites(),
  ui: {
    query: "",
    filterSingleRider: false,
    filterMaintOrIssue: false,
    filterLt: null,
    bestCollapsed: true,
    maintCollapsed: true,
  },
  meta: {
    lastUpdateTimestamp: null,
    dataAgeMinutes: null,
    isRefreshing: false,
    nextRefreshInMs: CONFIG.refreshIntervalMs,
    manualCooldownUntil: 0,
    usingCache: false,
  },
};

bootstrap();

function bootstrap() {
  if (!CONFIG.parkConfigs.length) {
    renderNoUrlState();
    return;
  }
  mountUI();
  wireEvents();
  fetchAndRender({ reason: "init" });
  startAutoRefreshTick();
}

function renderNoUrlState() {
  const root = document.getElementById("ppg-wachttijden");
  if (!root) return;
  root.innerHTML = `
    <div class="ppgwt" style="--ppg-accent:${escapeAttr(CONFIG.accent)};">
      <div class="ppgwt__card">
        <h3 class="ppgwt__h3">Queue-Times Wachttijden</h3>
        <div class="ppgwt__muted">Vul in <code>snippet.js</code> het array <code>CONFIG_PARKS</code> in (max 3 parken). Elk item: <code>{ url: &quot;slug&quot;, name: &quot;Tabnaam&quot; }</code> of alleen een url-string.</div>
      </div>
    </div>
  `;
}

function ensureFontAwesome() {
  if (
    document.querySelector(
      'link[href*="font-awesome"], link[href*="fontawesome"]',
    )
  )
    return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css";
  document.head.appendChild(link);
}

function mountUI() {
  ensureFontAwesome();
  const root = document.getElementById("ppg-wachttijden");
  const parkTabsHtml =
    CONFIG.parkConfigs.length > 1
      ? `
      <div class="ppgwt__parkTabs" id="ppgwt-parkTabs" role="tablist">
        ${CONFIG.parkConfigs
          .map(
            (p, i) =>
              `<button type="button" class="ppgwt__parkTab ${i === 0 ? "is-active" : ""}" data-park-index="${i}" role="tab" aria-selected="${i === 0}">${escapeHtml(p.name)}</button>`,
          )
          .join("")}
      </div>`
      : "";

  root.innerHTML = `
    <div class="ppgwt" style="--ppg-accent:${escapeAttr(CONFIG.accent)};">
      <div class="ppgwt__liveBar">
        <div class="ppgwt__liveWrapContainer">
          <div class="ppgwt__liveWrap" id="ppgwt-liveWrap" data-tooltip="Laden...">
            <span class="ppgwt__dot" id="ppgwt-dot"></span>
            <span class="ppgwt__liveText" id="ppgwt-liveText">Laden...</span>
          </div>
          <div class="ppgwt__liveInfo" id="ppgwt-liveInfo"></div>
        </div>
      </div>
      ${parkTabsHtml}

      <div class="ppgwt__grid" id="ppgwt-grid">
        <aside class="ppgwt__left">
          <div class="ppgwt__card ppgwt__card--stat">
            <h2 class="ppgwt__statLabel">Totale wachttijd</h2>
            <div class="ppgwt__statValue" id="ppgwt-totalWaitValue">-</div>
            <div class="ppgwt__statPark" id="ppgwt-parkHours" style="display:none;"></div>
            <span class="ppgwt__statTag ppgwt__statTag--closed" id="ppgwt-parkClosedTag" style="display:none;"></span>
          </div>

          <div class="ppgwt__card">
            <div class="ppgwt__cardHeader">
              <h2 class="ppgwt__h3">Je kan nu het beste naar</h2>
              <span class="ppgwt__pill" id="ppgwt-bestCount">-</span>
            </div>
            <div class="ppgwt__list" id="ppgwt-bestList"></div>
            <div class="ppgwt__bestToggle" id="ppgwt-bestToggle"></div>
            <div class="ppgwt__empty ppgwt__empty--favorites" id="ppgwt-bestEmpty" style="display:none;">
              <span class="ppgwt__emptyText">Voeg favorieten toe</span>
              <i class="far fa-star ppgwt__emptyIcon" aria-hidden="true"></i>
            </div>
          </div>

          <div class="ppgwt__card">
            <div class="ppgwt__cardHeader">
              <h2 class="ppgwt__h3">Gesloten</h2>
              <span class="ppgwt__pill" id="ppgwt-maintCount">-</span>
            </div>
            <div class="ppgwt__list" id="ppgwt-maintList"></div>
            <div class="ppgwt__maintToggle" id="ppgwt-maintToggle"></div>
            <div class="ppgwt__empty ppgwt__empty--maint" id="ppgwt-maintEmpty" style="display:none;">
              <span class="ppgwt__emptyText">Geen gesloten attracties</span>
              <i class="fas fa-check-circle ppgwt__emptyIcon" aria-hidden="true"></i>
            </div>
          </div>
        </aside>

        <main class="ppgwt__right">
          <div class="ppgwt__card ppgwt__card--tabs">
            <div class="ppgwt__toolbar ppgwt__toolbar--global">
              <input class="ppgwt__search" id="ppgwt-search" placeholder="Zoek in attracties…" type="search" />
            </div>
            <div class="ppgwt__toolbar">
              <span class="ppgwt__chipsLabel">Filters</span>
              <div class="ppgwt__chips" id="ppgwt-chips">
                <button class="ppgwt__chip" data-chip="maint" type="button">Gesloten</button>
                <button class="ppgwt__chip" data-chip="lt15" type="button">≤ 15 min</button>
                <button class="ppgwt__chip" data-chip="lt30" type="button">≤ 30 min</button>
                <button class="ppgwt__chip" data-chip="lt60" type="button">≤ 60 min</button>
                <button class="ppgwt__chip" data-chip="single" type="button">Single rider</button>
              </div>
            </div>
            <div class="ppgwt__rows" id="ppgwt-attractions"></div>
            <div class="ppgwt__empty" id="ppgwt-attractionsEmpty" style="display:none;">Geen resultaten.</div>
          </div>
        </main>
      </div>
    </div>
  `;
}

function wireEvents() {
  const root = document.getElementById("ppg-wachttijden");

  root.addEventListener("click", (e) => {
    const wrap = e.target.closest("#ppgwt-liveWrap");
    if (wrap) {
      const bar = wrap.closest(".ppgwt__liveBar");
      if (bar) bar.classList.toggle("is-infoOpen");
      return;
    }
    const parkTab = e.target.closest(".ppgwt__parkTab[data-park-index]");
    if (parkTab) {
      const idx = parseInt(parkTab.getAttribute("data-park-index"), 10);
      if (!Number.isNaN(idx) && idx >= 0 && idx < state.parkData.length) {
        state.currentParkIndex = idx;
        syncStateFromCurrentPark();
        renderParkTabs();
        renderAll();
      }
    }
  });

  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-chip]");
    if (!chip) return;
    toggleChip(chip.getAttribute("data-chip"));
    renderAll();
  });

  root.addEventListener("click", (e) => {
    const star = e.target.closest("[data-star-id]");
    if (!star) return;
    toggleFavorite(star.getAttribute("data-star-id"));
    renderAll();
  });

  root.addEventListener("input", (e) => {
    if (e.target && e.target.id === "ppgwt-search") {
      state.ui.query = (e.target.value || "").trim();
      renderAll();
    }
  });

  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-maint-toggle]")) {
      state.ui.maintCollapsed = !state.ui.maintCollapsed;
      renderMaintOrIssueCard();
      return;
    }
    if (e.target.closest("[data-best-toggle]")) {
      state.ui.bestCollapsed = !state.ui.bestCollapsed;
      renderBestFromFavorites();
      return;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) state.meta.nextRefreshInMs = CONFIG.refreshIntervalMs;
  });
}

function startAutoRefreshTick() {
  setInterval(() => {
    if (document.hidden) return;
    state.meta.nextRefreshInMs = Math.max(0, state.meta.nextRefreshInMs - 250);
    renderLiveTooltipOnly();
    updateRefreshButtonState();
    if (state.meta.nextRefreshInMs === 0) fetchAndRender({ reason: "auto" });
  }, 250);
}

function syncStateFromCurrentPark() {
  const cur = state.parkData[state.currentParkIndex];
  if (!cur) {
    state.data = null;
    state.normalized = null;
    state.meta.lastUpdateTimestamp = null;
    state.meta.dataAgeMinutes = null;
    return;
  }
  state.data = cur.data;
  state.normalized = cur.normalized;
  state.meta.lastUpdateTimestamp = cur.lastUpdateTimestamp;
  state.meta.dataAgeMinutes = cur.dataAgeMinutes;
}

async function fetchAndRender() {
  setRefreshing(true);
  try {
    const configs = CONFIG.parkConfigs;
    const results = await Promise.all(configs.map((p) => fetchJson(p.apiUrl)));
    state.meta.usingCache = false;

    state.parkData = results.map((data, i) => {
      const stamp = getLatestTimestamp(data);
      const dataAgeMinutes = stamp
        ? Math.floor((Date.now() - stamp.getTime()) / 60000)
        : null;
      const normalized = normalizeDataForPark(data);
      return {
        data,
        normalized,
        lastUpdateTimestamp: stamp,
        dataAgeMinutes,
      };
    });

    saveCache(results);
    syncStateFromCurrentPark();
    renderParkTabs();
    renderAll();
  } catch (err) {
    console.error(err);
    const cached = loadCache();
    if (
      cached?.parks &&
      Array.isArray(cached.parks) &&
      cached.parks.length > 0
    ) {
      state.meta.usingCache = true;
      state.parkData = cached.parks.map((data) => {
        const stamp = getLatestTimestamp(data);
        const dataAgeMinutes = stamp
          ? Math.floor((Date.now() - stamp.getTime()) / 60000)
          : null;
        const normalized = normalizeDataForPark(data);
        return {
          data,
          normalized,
          lastUpdateTimestamp: stamp,
          dataAgeMinutes,
        };
      });
      if (state.currentParkIndex >= state.parkData.length)
        state.currentParkIndex = 0;
      syncStateFromCurrentPark();
      renderParkTabs();
      renderAll();
      renderRefreshHint("Cache (kan verouderd zijn)");
      setTimeout(() => renderRefreshHint(""), 2500);
    } else {
      renderErrorState();
    }
  } finally {
    setRefreshing(false);
    state.meta.nextRefreshInMs = CONFIG.refreshIntervalMs;
    updateRefreshButtonState();
  }
}

function getLatestTimestamp(data) {
  let latest = null;
  const lands = Array.isArray(data?.lands) ? data.lands : [];
  for (const land of lands) {
    const rides = Array.isArray(land.rides) ? land.rides : [];
    for (const r of rides) {
      const t = r?.last_updated ? new Date(r.last_updated) : null;
      if (t && (!latest || t > latest)) latest = t;
    }
  }
  return latest;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function saveCache(parksData) {
  try {
    const payload = Array.isArray(parksData)
      ? { savedAt: Date.now(), parks: parksData }
      : { savedAt: Date.now(), parks: [parksData] };
    localStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(payload));
  } catch {}
}

function loadCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.cache);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj?.parks && Array.isArray(obj.parks) && obj.parks.length > 0)
      return obj;
    if (obj?.data) return { parks: [obj.data] };
    return null;
  } catch {
    return null;
  }
}

function mapRideToItem(ride, landName) {
  const wait = normalizeNumberOrNull(ride.wait_time);
  return {
    Id: String(ride.id),
    Name: ride.name,
    State: ride.is_open === true ? "open" : "gesloten",
    WaitingTime: ride.is_open ? (wait != null ? wait : 0) : 0,
    landName: landName || null,
  };
}

function isSingleRiderName(name) {
  return /Single Rider$/i.test(String(name || ""));
}

function baseNameFromSingleRider(name) {
  return String(name || "")
    .replace(/\s+Single Rider$/i, "")
    .trim();
}

function normalizeDataForPark(data) {
  const lands = Array.isArray(data?.lands) ? data.lands : [];
  const allRides = [];
  for (const land of lands) {
    const landName = land.name || null;
    const rides = Array.isArray(land.rides) ? land.rides : [];
    for (const r of rides) {
      allRides.push({ ...r, landName });
    }
  }

  const baseRides = allRides.filter((r) => !isSingleRiderName(r.name));
  const srRides = allRides.filter((r) => isSingleRiderName(r.name));

  const byBaseName = new Map();
  const attractions = [];

  for (const r of baseRides) {
    const item = mapRideToItem(r, r.landName);
    byBaseName.set(item.Name, item);
    attractions.push(item);
  }

  for (const sr of srRides) {
    const baseName = baseNameFromSingleRider(sr.name);
    const base = byBaseName.get(baseName);
    if (base) {
      base.singlerider = mapRideToItem(sr, sr.landName);
    } else {
      attractions.push(mapRideToItem(sr, sr.landName));
    }
  }

  return { attractions };
}

function normalizeNumberOrNull(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function renderAll() {
  const fallback = getFallbackMessage();
  if (fallback) {
    renderFallbackState(fallback);
    return;
  }
  renderParkTabs();
  renderMeta();
  renderTotalWaitCard();
  renderBestFromFavorites();
  renderMaintOrIssueCard();
  syncChipUI();
  renderAttractions();
}

function renderParkTabs() {
  const container = document.getElementById("ppgwt-parkTabs");
  if (!container) return;
  const idx = state.currentParkIndex;
  container.querySelectorAll(".ppgwt__parkTab").forEach((btn, i) => {
    const isActive = i === idx;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function renderMeta() {
  const age = state.meta.dataAgeMinutes;
  const stamp = state.meta.lastUpdateTimestamp;

  let label = "Onbekend";
  let cls = "bad";
  if (typeof age === "number") {
    if (age <= CONFIG.liveGoodMaxMinutes) {
      label = "Live";
      cls = "good";
    } else if (age <= CONFIG.liveWarnMaxMinutes) {
      label = "Loopt achter";
      cls = "warn";
    } else {
      label = "Niet betrouwbaar";
      cls = "bad";
    }
  }
  const dotEl = document.getElementById("ppgwt-dot");
  const liveTextEl = document.getElementById("ppgwt-liveText");
  if (dotEl) dotEl.className = `ppgwt__dot is-${cls}`;
  if (liveTextEl)
    liveTextEl.textContent = state.meta.usingCache ? `${label} (cache)` : label;

  const lastUpdate = stamp
    ? stamp.toLocaleString(CONFIG.locale, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
  const left = Math.floor(state.meta.nextRefreshInMs / 1000);
  const agePart =
    typeof age === "number" ? `ca. ${age} min oud` : "leeftijd onbekend";
  const parkName = CONFIG.parkConfigs[state.currentParkIndex]?.name || "Park";
  const tooltip = `Wachttijden (${parkName}) ${agePart} · laatst: ${lastUpdate} · vernieuwt over ${left} s`;
  const wrapEl = document.getElementById("ppgwt-liveWrap");
  if (wrapEl) wrapEl.setAttribute("data-tooltip", tooltip);
  const liveInfoEl = document.getElementById("ppgwt-liveInfo");
  if (liveInfoEl)
    liveInfoEl.textContent = `Laatst: ${lastUpdate} · Vernieuwt over ${left} s`;
}

function renderLiveTooltipOnly() {
  const stamp = state.meta.lastUpdateTimestamp;
  const lastUpdate = stamp
    ? stamp.toLocaleString(CONFIG.locale, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
  const left = Math.floor(state.meta.nextRefreshInMs / 1000);
  const age = state.meta.dataAgeMinutes;
  const agePart =
    typeof age === "number" ? `ca. ${age} min oud` : "leeftijd onbekend";
  const parkName = CONFIG.parkConfigs[state.currentParkIndex]?.name || "Park";
  const tooltip = `Wachttijden (${parkName}) ${agePart} · laatst: ${lastUpdate} · vernieuwt over ${left} s`;
  const wrapEl = document.getElementById("ppgwt-liveWrap");
  if (wrapEl) wrapEl.setAttribute("data-tooltip", tooltip);
  const liveInfoEl = document.getElementById("ppgwt-liveInfo");
  if (liveInfoEl)
    liveInfoEl.textContent = `Laatst: ${lastUpdate} · Vernieuwt over ${left} s`;
}

function renderTotalWaitCard() {
  const total = calculateTotalWaitingTime(state.normalized?.attractions || []);
  const valueEl = document.getElementById("ppgwt-totalWaitValue");
  if (valueEl) valueEl.textContent = total > 0 ? `${total} min` : "-";
}

function renderRefreshHint() {}
function updateRefreshButtonState() {}

function setRefreshing(on) {
  state.meta.isRefreshing = on;
  updateRefreshButtonState();
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.favorites);
    if (!raw) return CONFIG.defaultFavoriteIds.slice();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return CONFIG.defaultFavoriteIds.slice();
    return arr.map((id) => String(id));
  } catch {
    return CONFIG.defaultFavoriteIds.slice();
  }
}

function renderBestFromFavorites() {
  const listEl = document.getElementById("ppgwt-bestList");
  const emptyEl = document.getElementById("ppgwt-bestEmpty");
  const countEl = document.getElementById("ppgwt-bestCount");
  const toggleEl = document.getElementById("ppgwt-bestToggle");
  if (!listEl || !emptyEl || !countEl) return;

  const attractions = state.normalized?.attractions || [];
  const favSet = new Set(state.favorites);

  const candidates = attractions
    .filter((a) => favSet.has(favId(a.Id)))
    .sort((a, b) => {
      if (a.State === "open" && b.State !== "open") return -1;
      if (b.State === "open" && a.State !== "open") return 1;
      const aw =
        typeof a.WaitingTime === "number" && a.WaitingTime >= 0
          ? a.WaitingTime
          : 0;
      const bw =
        typeof b.WaitingTime === "number" && b.WaitingTime >= 0
          ? b.WaitingTime
          : 0;
      if (aw !== bw) return aw - bw;
      return (a.Name || "").localeCompare(b.Name || "", CONFIG.locale);
    });

  const best = candidates.slice(0, CONFIG.topNFromFavorites);
  countEl.textContent = String(best.length);

  listEl.innerHTML = "";
  if (toggleEl) toggleEl.innerHTML = "";

  if (!best.length) {
    emptyEl.style.display = "flex";
    if (toggleEl) toggleEl.style.display = "none";
    return;
  }
  emptyEl.style.display = "none";

  const limit = CONFIG.bestCollapsedLimit;
  const collapsed = state.ui.bestCollapsed;
  const toShow = collapsed && best.length > limit ? best.slice(0, limit) : best;

  for (const a of toShow)
    listEl.appendChild(
      renderAttractionCard(a, { compact: true, showZeroWait: true }),
    );

  if (toggleEl && best.length > limit) {
    toggleEl.style.display = "block";
    const label = collapsed
      ? `Toon meer (${best.length - limit})`
      : "Inklappen";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ppgwt__bestToggleBtn";
    btn.setAttribute("data-best-toggle", "");
    btn.textContent = label;
    toggleEl.appendChild(btn);
  } else if (toggleEl) {
    toggleEl.style.display = "none";
  }
}

function renderMaintOrIssueCard() {
  const listEl = document.getElementById("ppgwt-maintList");
  const emptyEl = document.getElementById("ppgwt-maintEmpty");
  const countEl = document.getElementById("ppgwt-maintCount");
  const toggleEl = document.getElementById("ppgwt-maintToggle");
  if (!listEl || !emptyEl || !countEl) return;

  const attractions = state.normalized?.attractions || [];
  const issues = attractions
    .filter((a) => isMaintenanceOrMalfunction(a.State))
    .sort((a, b) => (a.Name || "").localeCompare(b.Name || "", CONFIG.locale));

  countEl.textContent = String(issues.length);
  listEl.innerHTML = "";
  if (toggleEl) toggleEl.innerHTML = "";

  if (!issues.length) {
    emptyEl.style.display = "flex";
    if (toggleEl) toggleEl.style.display = "none";
    return;
  }
  emptyEl.style.display = "none";

  const limit = CONFIG.maintCollapsedLimit;
  const collapsed = state.ui.maintCollapsed;
  const toShow =
    collapsed && issues.length > limit ? issues.slice(0, limit) : issues;

  for (const a of toShow)
    listEl.appendChild(
      renderAttractionCard(a, { compact: false, noAction: true }),
    );

  if (toggleEl && issues.length > limit) {
    toggleEl.style.display = "block";
    const label = collapsed
      ? `Toon meer (${issues.length - limit})`
      : "Inklappen";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ppgwt__maintToggleBtn";
    btn.setAttribute("data-maint-toggle", "");
    btn.textContent = label;
    toggleEl.appendChild(btn);
  } else if (toggleEl) {
    toggleEl.style.display = "none";
  }
}

function renderAttractions() {
  const el = document.getElementById("ppgwt-attractions");
  const emptyEl = document.getElementById("ppgwt-attractionsEmpty");
  if (!el || !emptyEl) return;

  const list = applyGlobalFilters(state.normalized?.attractions || []).sort(
    sortByHipLongestWait,
  );
  el.innerHTML = "";
  if (!list.length) {
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";
  for (const a of list)
    el.appendChild(renderAttractionCard(a, { compact: false }));
}

function renderAttractionCard(
  item,
  { compact, noAction = false, showZeroWait = false } = {},
) {
  const fav = isFavorite(item.Id);

  const card = document.createElement("div");
  card.className = `ppgwt__row ${compact ? "is-compact" : ""} ${fav ? "is-fav" : ""} ${noAction ? "is-noAction" : ""}`;

  const left = document.createElement("div");
  left.className = "ppgwt__rowLeft";

  const name = document.createElement("div");
  name.className = "ppgwt__name";
  const safeName = escapeHtml(item.Name || item.Id || "-");
  name.innerHTML = item.url
    ? `<a class="ppgwt__link" href="${escapeAttr(item.url)}">${safeName}</a>`
    : safeName;

  let srLine = null;
  let srTag = null;
  if (item.singlerider) {
    const sr = item.singlerider;
    if (sr.State === "open" && typeof sr.WaitingTime === "number") {
      srLine = "Single Rider:";
      srTag = `${sr.WaitingTime} min`;
    } else {
      srLine = `Single Rider: ${formatStateShort(sr.State)}`;
      srTag = null;
    }
  }
  const maint = getMaintenanceHint(item);

  const lines = [];
  if (item.landName) lines.push({ type: "land", text: item.landName });
  if (srLine) lines.push({ type: "sr", text: srLine, tag: srTag });
  if (maint) lines.push({ type: "maint", text: maint });

  left.appendChild(name);
  if ((!compact || noAction) && lines.length > 0) {
    const sub = document.createElement("div");
    sub.className = "ppgwt__sub";
    sub.innerHTML = lines
      .map((line) => {
        if (line.type === "land") {
          return `<div class="ppgwt__line"><span>${escapeHtml(line.text)}</span></div>`;
        }
        if (line.type === "sr") {
          if (line.tag) {
            return `<div class="ppgwt__line">
              <span>${escapeHtml(line.text)}</span>
              <span class="ppgwt__miniBadge ppgwt__miniBadge--time">${escapeHtml(line.tag)}</span>
            </div>`;
          }
          return `<div class="ppgwt__line"><span>${escapeHtml(line.text)}</span></div>`;
        }
        if (line.type === "maint" && line.text.startsWith("Let op:")) {
          return `<div class="ppgwt__line"><span class="ppgwt__warnText">⚠ ${escapeHtml(line.text)}</span></div>`;
        }
        return `<div class="ppgwt__line"><span>${escapeHtml(line.text)}</span></div>`;
      })
      .join("");
    left.appendChild(sub);
  }

  const right = document.createElement("div");
  right.className = "ppgwt__rowRight";

  const badge = document.createElement("span");
  badge.className = `ppgwt__badge ${badgeClassAttraction(item)}`;
  badge.textContent = badgeTextAttraction(item, { showZeroWait });

  right.appendChild(badge);
  if (!noAction) {
    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.setAttribute("data-star-id", item.Id);
    if (compact) {
      actionBtn.className = "ppgwt__trashBtn";
      actionBtn.setAttribute("aria-label", "Verwijder uit favorieten");
      actionBtn.innerHTML =
        '<i class="fas fa-trash-alt" aria-hidden="true"></i>';
    } else {
      actionBtn.className = `ppgwt__star ${fav ? "is-on" : ""}`;
      actionBtn.setAttribute(
        "aria-label",
        fav ? "Verwijder favoriet" : "Maak favoriet",
      );
      actionBtn.innerHTML = fav
        ? '<i class="fas fa-star" aria-hidden="true"></i>'
        : '<i class="far fa-star" aria-hidden="true"></i>';
    }
    right.appendChild(actionBtn);
  }

  card.appendChild(left);
  card.appendChild(right);
  return card;
}

function getMaintenanceHint() {
  return "";
}

function applyGlobalFilters(list) {
  const q = (state.ui.query || "").toLowerCase();
  return list.filter((a) => {
    if (q) {
      const hay =
        `${a.Name || ""} ${a.Id || ""} ${a.landName || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (state.ui.filterSingleRider && !a.singlerider) return false;
    if (state.ui.filterMaintOrIssue && !isMaintenanceOrMalfunction(a.State))
      return false;
    if (typeof state.ui.filterLt === "number") {
      if (!(typeof a.WaitingTime === "number" && a.WaitingTime >= 0))
        return false;
      if (a.WaitingTime >= state.ui.filterLt) return false;
    }
    return true;
  });
}

function isMaintenanceOrMalfunction(st) {
  return st === "gesloten";
}

function sortByHipLongestWait(a, b) {
  const aIssue = isMaintenanceOrMalfunction(a.State);
  const bIssue = isMaintenanceOrMalfunction(b.State);
  if (aIssue && !bIssue) return 1;
  if (!aIssue && bIssue) return -1;
  if (aIssue && bIssue)
    return (a.Name || "").localeCompare(b.Name || "", CONFIG.locale);

  if (a.State === "open" && b.State !== "open") return -1;
  if (b.State === "open" && a.State !== "open") return 1;

  const aw = typeof a.WaitingTime === "number" ? a.WaitingTime : null;
  const bw = typeof b.WaitingTime === "number" ? b.WaitingTime : null;

  if (aw == null && bw != null) return 1;
  if (bw == null && aw != null) return -1;
  if (aw != null && bw != null) return bw - aw;

  return (a.Name || "").localeCompare(b.Name || "", CONFIG.locale);
}

function badgeClassAttraction(item) {
  if (item.State === "open") return "is-open";
  if (item.State === "gesloten") return "is-closed";
  return "is-unknown";
}

function badgeTextAttraction(item, opts) {
  const showZeroWait = opts?.showZeroWait === true;
  if (item.State === "open") {
    const wt =
      typeof item.WaitingTime === "number" && item.WaitingTime >= 0
        ? item.WaitingTime
        : null;
    if (wt !== null) return `${wt} min`;
    if (showZeroWait) return "0 min";
    return "Open";
  }
  return formatStateShort(item.State);
}

function toggleChip(which) {
  if (which === "maint")
    state.ui.filterMaintOrIssue = !state.ui.filterMaintOrIssue;
  if (which === "single")
    state.ui.filterSingleRider = !state.ui.filterSingleRider;
  if (which === "lt15")
    state.ui.filterLt = state.ui.filterLt === 15 ? null : 15;
  if (which === "lt30")
    state.ui.filterLt = state.ui.filterLt === 30 ? null : 30;
  if (which === "lt60")
    state.ui.filterLt = state.ui.filterLt === 60 ? null : 60;
}

function syncChipUI() {
  const root = document.getElementById("ppg-wachttijden");
  if (!root) return;
  root.querySelectorAll("[data-chip]").forEach((btn) => {
    const k = btn.getAttribute("data-chip");
    let on = false;
    if (k === "maint") on = state.ui.filterMaintOrIssue;
    if (k === "single") on = state.ui.filterSingleRider;
    if (k === "lt15") on = state.ui.filterLt === 15;
    if (k === "lt30") on = state.ui.filterLt === 30;
    if (k === "lt60") on = state.ui.filterLt === 60;
    btn.classList.toggle("is-on", on);
  });
}

function saveFavorites() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.favorites,
      JSON.stringify(state.favorites),
    );
  } catch {}
}

function favId(id) {
  return id == null ? "" : String(id);
}

function toggleFavorite(id) {
  const sid = favId(id);
  if (!sid) return;
  const i = state.favorites.indexOf(sid);
  if (i >= 0) state.favorites.splice(i, 1);
  else state.favorites.push(sid);
  saveFavorites();
}

function isFavorite(id) {
  return state.favorites.includes(favId(id));
}

function calculateTotalWaitingTime(attractions) {
  let total = 0;
  for (const a of attractions) {
    if (
      a.State === "open" &&
      typeof a.WaitingTime === "number" &&
      a.WaitingTime > 0
    )
      total += a.WaitingTime;
  }
  return total;
}

function formatStateShort(st) {
  switch (st) {
    case "open":
      return "Open";
    case "gesloten":
      return "Gesloten";
    default:
      return "Onbekend";
  }
}

function getFallbackMessage() {
  const lands = state.data?.lands;
  if (!state.data || !Array.isArray(lands)) return "Data niet beschikbaar";
  if (lands.length === 0)
    return "Geen wachttijden beschikbaar (park mogelijk gesloten).";
  const hasRides = lands.some(
    (l) => Array.isArray(l.rides) && l.rides.length > 0,
  );
  if (!hasRides)
    return "Geen wachttijden beschikbaar (park mogelijk gesloten).";
  return null;
}

function renderFallbackState(message) {
  const root = document.getElementById("ppg-wachttijden");
  if (!root) return;
  const showMuted = message !== "Park gesloten";
  const displayMessage =
    message === "Park gesloten" ? "🌙 " + message : message;
  const cardHtml = `
    <div class="ppgwt__card">
      <h3 class="ppgwt__h3">${escapeHtml(displayMessage)}</h3>
      ${showMuted ? '<div class="ppgwt__muted">Er is nu niets te tonen. Probeer het later opnieuw.</div>' : ""}
    </div>
  `;
  const grid = root.querySelector("#ppgwt-grid");
  if (grid && CONFIG.parkConfigs.length > 1) {
    grid.innerHTML = cardHtml;
  } else {
    root.innerHTML = `
    <div class="ppgwt" style="--ppg-accent:${escapeAttr(CONFIG.accent)};">
      ${cardHtml}
    </div>
  `;
  }
}

function renderErrorState() {
  const root = document.getElementById("ppg-wachttijden");
  if (!root) return;
  root.innerHTML = `
    <div class="ppgwt" style="--ppg-accent:${escapeAttr(CONFIG.accent)};">
      <div class="ppgwt__card">
        <h3 class="ppgwt__h3">Wachttijden niet beschikbaar</h3>
        <div class="ppgwt__muted">Geen data en geen cache.</div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (s) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[s],
  );
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, "&#96;");
}
