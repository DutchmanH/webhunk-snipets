/** =========================
 * CONFIG
 * ========================= */
const CONFIG = {
  apiUrl: "https://pretparkgids.nl/api/wachttijden/efteling.json",
  parkKey: "efteling",
  locale: "nl-NL",

  accent: "#db4534",
  refreshIntervalMs: 45000, // ✅ auto refresh 45s
  manualCooldownMs: 8000,

  liveGoodMaxMinutes: 9,
  liveWarnMaxMinutes: 19,

  topNFromFavorites: 5,

  /** Max. aantal zichtbaar in "Je kan nu het beste naar" / "Storingen & onderhoud" voordat er "Toon meer" komt */
  bestCollapsedLimit: 3,
  maintCollapsedLimit: 3,

  defaultFavoriteIds: [
    "python",
    "droomvlucht",
    "baron1898",
    "symbolica",
    "devliegendehollander",
    "jorisendedraak",
  ],

  typeLabels: {
    attractions: "Attracties",
    shows: "Shows en Entertainment",
    food: "Eten en Drinken",
    shops: "Souvenirwinkels",
  },
};

/** =========================
 * STATE
 * ========================= */
const STORAGE_KEYS = {
  favorites: `ppg_waiting_${CONFIG.parkKey}_favorites_v4`,
  cache: `ppg_waiting_${CONFIG.parkKey}_cache_v4`,
};

const state = {
  data: null,
  normalized: null,
  favorites: loadFavorites(),
  ui: {
    editFavorites: false,
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

/** =========================
 * INIT
 * ========================= */
function bootstrap() {
  mountUI();
  wireEvents();
  fetchAndRender({ reason: "init" });
  startAutoRefreshTick();
}

function ensureFontAwesome() {
  if (document.querySelector('link[href*="font-awesome"], link[href*="fontawesome"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css";
  document.head.appendChild(link);
}

function mountUI() {
  ensureFontAwesome();
  const root = document.getElementById("ppg-wachttijden");
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

      <div class="ppgwt__grid">
        <!-- LEFT -->
        <aside class="ppgwt__left">
          <div class="ppgwt__card ppgwt__card--stat">
            <h2 class="ppgwt__statLabel">Totale wachttijd</h2>
            <div class="ppgwt__statValue" id="ppgwt-totalWaitValue">-</div>
            <div class="ppgwt__statPark" id="ppgwt-parkHours"></div>
            <span class="ppgwt__statTag ppgwt__statTag--closed" id="ppgwt-parkClosedTag" style="display:none;">Gesloten</span>
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
              <h2 class="ppgwt__h3">Storingen & onderhoud</h2>
              <span class="ppgwt__pill" id="ppgwt-maintCount">-</span>
            </div>
            <div class="ppgwt__list" id="ppgwt-maintList"></div>
            <div class="ppgwt__maintToggle" id="ppgwt-maintToggle"></div>
            <div class="ppgwt__empty ppgwt__empty--maint" id="ppgwt-maintEmpty" style="display:none;">
              <span class="ppgwt__emptyText">Geen storingen of onderhoud</span>
              <i class="fas fa-check-circle ppgwt__emptyIcon" aria-hidden="true"></i>
            </div>
          </div>
        </aside>

        <!-- RIGHT -->
        <main class="ppgwt__right">
          <div class="ppgwt__card ppgwt__card--tabs">
            <div class="ppgwt__tabs">
              <button class="ppgwt__tab is-active" data-tab="tab-attracties" type="button">Attracties</button>
              <button class="ppgwt__tab" data-tab="tab-shows" type="button">Shows</button>
              <button class="ppgwt__tab" data-tab="tab-food" type="button">Eten & Drinken</button>
              <button class="ppgwt__tab" data-tab="tab-shops" type="button">Souvenirs</button>
            </div>
            <div class="ppgwt__toolbar ppgwt__toolbar--global">
              <input class="ppgwt__search" id="ppgwt-search" placeholder="Zoek in attracties, shows, restaurants..." type="search" />
            </div>

            <div class="ppgwt__tabcontent is-active" id="tab-attracties">
              <div class="ppgwt__toolbar">
                <span class="ppgwt__chipsLabel">Filters</span>
                <div class="ppgwt__chips" id="ppgwt-chips">
                  <button class="ppgwt__chip" data-chip="maint" type="button">In onderhoud/storing</button>
                  <button class="ppgwt__chip" data-chip="lt15" type="button">≤ 15 min</button>
                  <button class="ppgwt__chip" data-chip="lt30" type="button">≤ 30 min</button>
                  <button class="ppgwt__chip" data-chip="lt60" type="button">≤ 60 min</button>
                  <button class="ppgwt__chip" data-chip="single" type="button">Single rider</button>
                </div>
              </div>

              <div class="ppgwt__rows" id="ppgwt-attractions"></div>
              <div class="ppgwt__empty" id="ppgwt-attractionsEmpty" style="display:none;">Geen resultaten.</div>
            </div>

            <div class="ppgwt__tabcontent" id="tab-shows">
              <div class="ppgwt__rows" id="ppgwt-shows"></div>
              <div class="ppgwt__empty" id="ppgwt-showsEmpty" style="display:none;">Geen shows.</div>
            </div>

            <div class="ppgwt__tabcontent" id="tab-food">
              <div class="ppgwt__rows" id="ppgwt-food"></div>
              <div class="ppgwt__empty" id="ppgwt-foodEmpty" style="display:none;">Geen items.</div>
            </div>

            <div class="ppgwt__tabcontent" id="tab-shops">
              <div class="ppgwt__rows" id="ppgwt-shops"></div>
              <div class="ppgwt__empty" id="ppgwt-shopsEmpty" style="display:none;">Geen items.</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  `;
}

function wireEvents() {
  const root = document.getElementById("ppg-wachttijden");

  // Tabs
  root.addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".ppgwt__tab");
    if (!tabBtn) return;
    const tabId = tabBtn.getAttribute("data-tab");
    root
      .querySelectorAll(".ppgwt__tab")
      .forEach((b) => b.classList.toggle("is-active", b === tabBtn));
    root
      .querySelectorAll(".ppgwt__tabcontent")
      .forEach((p) => p.classList.toggle("is-active", p.id === tabId));
  });

  // Klik op Live (mobiel): toon/verberg tooltip
  root.addEventListener("click", (e) => {
    const wrap = e.target.closest("#ppgwt-liveWrap");
    if (wrap) {
      const bar = wrap.closest(".ppgwt__liveBar");
      if (bar) bar.classList.toggle("is-infoOpen");
      return;
    }
  });

  // Toggle favorites edit
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("#ppgwt-toggleEditBtn");
    if (!btn) return;
    state.ui.editFavorites = !state.ui.editFavorites;
    renderFavorites();
  });

  // Chips
  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-chip]");
    if (!chip) return;
    toggleChip(chip.getAttribute("data-chip"));
    renderAll();
  });

  // Star toggle (✅ favorites fix)
  root.addEventListener("click", (e) => {
    const star = e.target.closest("[data-star-id]");
    if (!star) return;
    toggleFavorite(star.getAttribute("data-star-id"));
    renderAll();
  });

  // Search
  root.addEventListener("input", (e) => {
    if (e.target && e.target.id === "ppgwt-search") {
      state.ui.query = (e.target.value || "").trim();
      renderAll();
    }
  });

  // Favorites edit checkbox
  root.addEventListener("change", (e) => {
    const cb = e.target;
    if (!cb || !cb.matches("[data-fav-checkbox]")) return;
    const id = cb.getAttribute("data-fav-checkbox");
    setFavorite(id, cb.checked);
    renderAll();
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

/** =========================
 * AUTO REFRESH
 * ========================= */
function startAutoRefreshTick() {
  setInterval(() => {
    if (document.hidden) return;
    state.meta.nextRefreshInMs = Math.max(0, state.meta.nextRefreshInMs - 250);
    renderLiveTooltipOnly();
    updateRefreshButtonState();
    if (state.meta.nextRefreshInMs === 0) fetchAndRender({ reason: "auto" });
  }, 250);
}

/** =========================
 * FETCH + CACHE
 * ========================= */
async function fetchAndRender() {
  setRefreshing(true);
  try {
    const data = await fetchJson(CONFIG.apiUrl);
    state.data = data;
    state.meta.usingCache = false;

    state.meta.lastUpdateTimestamp = data?.TimeStamp
      ? new Date(data.TimeStamp)
      : null;
    state.meta.dataAgeMinutes = state.meta.lastUpdateTimestamp
      ? Math.floor(
          (Date.now() - state.meta.lastUpdateTimestamp.getTime()) / 60000,
        )
      : null;

    saveCache(data);
    normalizeData();
    renderAll();
  } catch (err) {
    console.error(err);
    const cached = loadCache();
    if (cached) {
      state.data = cached.data;
      state.meta.usingCache = true;

      state.meta.lastUpdateTimestamp = cached.data?.TimeStamp
        ? new Date(cached.data.TimeStamp)
        : null;
      state.meta.dataAgeMinutes = state.meta.lastUpdateTimestamp
        ? Math.floor(
            (Date.now() - state.meta.lastUpdateTimestamp.getTime()) / 60000,
          )
        : null;

      normalizeData();
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

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function saveCache(data) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.cache,
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch {}
}
function loadCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.cache);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.data) return null;
    return obj;
  } catch {
    return null;
  }
}

/** =========================
 * NORMALIZE
 * ========================= */
function normalizeData() {
  const list = Array.isArray(state.data?.AttractionInfo)
    ? state.data.AttractionInfo
    : [];
  const maintenance = Array.isArray(state.data?.MaintenanceInfo)
    ? state.data.MaintenanceInfo
    : [];

  const items = list.map((x) => ({ ...x }));

  // maintenance map
  const maintMap = new Map();
  for (const m of maintenance) {
    const id = m?.AttractionId;
    if (!id) continue;
    const win = {
      from: m?.DateFrom ? new Date(m.DateFrom) : null,
      to: m?.DateTo ? new Date(m.DateTo) : null,
      openInWeekend:
        typeof m?.OpenInWeekend === "boolean" ? m.OpenInWeekend : null,
    };
    if (!maintMap.has(id)) maintMap.set(id, []);
    maintMap.get(id).push(win);
  }

  // singlerider attach
  const byId = new Map(items.map((x) => [x.Id, x]));
  for (const it of items) {
    if (typeof it.Id === "string" && it.Id.endsWith("singlerider")) {
      const baseId = it.Id.slice(0, -"singlerider".length);
      const base = byId.get(baseId);
      if (base) base.singlerider = it;
    }
  }

  // normalize times + attach maintenance
  for (const it of items) {
    it.WaitingTime = normalizeNumberOrNull(it.WaitingTime);
    if (it.singlerider)
      it.singlerider.WaitingTime = normalizeNumberOrNull(
        it.singlerider.WaitingTime,
      );
    if (it.Id && maintMap.has(it.Id))
      it.maintenanceWindows = maintMap.get(it.Id).slice();
  }

  const t = CONFIG.typeLabels;
  const attractions = items.filter(
    (x) =>
      x.Type === t.attractions && !String(x.Id || "").endsWith("singlerider"),
  );
  const shows = items.filter((x) => x.Type === t.shows);
  const food = items.filter((x) => x.Type === t.food);
  const shops = items.filter((x) => x.Type === t.shops);

  state.normalized = { attractions, shows, food, shops };
}

function normalizeNumberOrNull(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** =========================
 * RENDER
 * ========================= */
function renderAll() {
  const fallback = getFallbackMessage();
  if (fallback) {
    renderFallbackState(fallback);
    return;
  }
  renderMeta();
  renderTotalWaitCard();
  renderBestFromFavorites();
  renderMaintOrIssueCard();
  renderFavorites();
  syncChipUI();
  renderAttractions();
  renderShows();
  renderFood();
  renderShops();
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
  document.getElementById("ppgwt-dot").className = `ppgwt__dot is-${cls}`;
  document.getElementById("ppgwt-liveText").textContent = state.meta.usingCache
    ? `${label} (cache)`
    : label;

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
  const agePart = typeof age === "number" ? `ca. ${age} min oud` : "leeftijd onbekend";
  const tooltip = `Wachttijden-data (Efteling) ${agePart} · laatst: ${lastUpdate} · vernieuwt over ${left} s`;
  document.getElementById("ppgwt-liveWrap").setAttribute("data-tooltip", tooltip);
  const liveInfoEl = document.getElementById("ppgwt-liveInfo");
  if (liveInfoEl) liveInfoEl.textContent = `Laatst: ${lastUpdate} · Vernieuwt over ${left} s`;
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
  const agePart = typeof age === "number" ? `ca. ${age} min oud` : "leeftijd onbekend";
  const tooltip = `Wachttijden-data (Efteling) ${agePart} · laatst: ${lastUpdate} · vernieuwt over ${left} s`;
  const wrapEl = document.getElementById("ppgwt-liveWrap");
  if (wrapEl) wrapEl.setAttribute("data-tooltip", tooltip);
  const liveInfoEl = document.getElementById("ppgwt-liveInfo");
  if (liveInfoEl) liveInfoEl.textContent = `Laatst: ${lastUpdate} · Vernieuwt over ${left} s`;
}

function renderTotalWaitCard() {
  const total = calculateTotalWaitingTime(state.normalized?.attractions || []);
  const valueEl = document.getElementById("ppgwt-totalWaitValue");
  if (valueEl) valueEl.textContent = total > 0 ? `${total} min` : "-";

  const parkEl = document.getElementById("ppgwt-parkHours");
  const closedTagEl = document.getElementById("ppgwt-parkClosedTag");
  if (parkEl) {
    const info = getParkOpeningInfo();
    if (info.fromTo) {
      const status =
        info.openNow === true
          ? "Park open"
          : info.openNow === false
            ? "Officieel gesloten"
            : "Openingstijden";
      parkEl.textContent = `${status} · ${info.fromTo}`;
      parkEl.style.opacity = "1";
      if (closedTagEl) closedTagEl.style.display = info.openNow === false ? "inline-block" : "none";
    } else {
      parkEl.textContent = "";
      parkEl.style.opacity = "0";
      if (closedTagEl) closedTagEl.style.display = "none";
    }
  }
}

function renderRefreshHint() {}
function updateRefreshButtonState() {}

function setRefreshing(on) {
  state.meta.isRefreshing = on;
  updateRefreshButtonState();
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
      const aw = typeof a.WaitingTime === "number" && a.WaitingTime >= 0 ? a.WaitingTime : 0;
      const bw = typeof b.WaitingTime === "number" && b.WaitingTime >= 0 ? b.WaitingTime : 0;
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
  const toShow =
    collapsed && best.length > limit ? best.slice(0, limit) : best;

  for (const a of toShow)
    listEl.appendChild(renderAttractionCard(a, { compact: true, showZeroWait: true }));

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
    .sort((a, b) => {
      const aMaint = a.State === "inonderhoud";
      const bMaint = b.State === "inonderhoud";
      if (aMaint && !bMaint) return -1;
      if (!aMaint && bMaint) return 1;
      return (a.Name || "").localeCompare(b.Name || "", CONFIG.locale);
    });

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
    listEl.appendChild(renderAttractionCard(a, { compact: false, noAction: true }));

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

function renderFavorites() {
  const viewEl = document.getElementById("ppgwt-favoritesView");
  const editEl = document.getElementById("ppgwt-favoritesEdit");
  const btn = document.getElementById("ppgwt-toggleEditBtn");
  if (!viewEl || !editEl || !btn) return;

  btn.textContent = state.ui.editFavorites ? "Klaar" : "Bewerk";
  viewEl.style.display = state.ui.editFavorites ? "none" : "block";
  editEl.style.display = state.ui.editFavorites ? "block" : "none";

  const attractions = state.normalized?.attractions || [];
  const nameById = new Map(attractions.map((a) => [a.Id, a.Name]));
  const favs = state.favorites.slice();

  viewEl.innerHTML = favs.length
    ? `<div class="ppgwt__favPills">${favs.map((id) => `<span class="ppgwt__favPill">${escapeHtml(nameById.get(id) || id)}</span>`).join("")}</div>`
    : `<div class="ppgwt__muted">Nog geen favorieten gekozen.</div>`;

  // ✅ edit list (A-Z)
  const sorted = attractions
    .slice()
    .sort((a, b) => (a.Name || "").localeCompare(b.Name || "", CONFIG.locale));
  editEl.innerHTML = `
    <div class="ppgwt__favGrid">
      ${sorted
        .map((a) => {
          const checked = isFavorite(a.Id);
          return `
          <label class="ppgwt__favItem">
            <input type="checkbox" data-fav-checkbox="${escapeHtml(a.Id)}" ${checked ? "checked" : ""} />
            <span>${escapeHtml(a.Name || a.Id)}</span>
          </label>
        `;
        })
        .join("")}
    </div>
  `;
}

function renderAttractions() {
  const el = document.getElementById("ppgwt-attractions");
  const emptyEl = document.getElementById("ppgwt-attractionsEmpty");

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

function renderShows() {
  const el = document.getElementById("ppgwt-shows");
  const emptyEl = document.getElementById("ppgwt-showsEmpty");
  const list = filterByQuery(state.normalized?.shows || []);

  el.innerHTML = "";
  if (!list.length) {
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  list
    .slice()
    .sort(
      (a, b) => (a.State === "open" ? -1 : 1) - (b.State === "open" ? -1 : 1),
    )
    .forEach((s) => el.appendChild(renderShowCard(s)));
}

function renderFood() {
  renderFoodShopList(
    "ppgwt-food",
    "ppgwt-foodEmpty",
    filterByQuery(state.normalized?.food || []),
  );
}
function renderShops() {
  renderFoodShopList(
    "ppgwt-shops",
    "ppgwt-shopsEmpty",
    filterByQuery(state.normalized?.shops || []),
  );
}

function renderFoodShopList(containerId, emptyId, items) {
  const el = document.getElementById(containerId);
  const emptyEl = document.getElementById(emptyId);
  el.innerHTML = "";
  if (!items.length) {
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  items
    .slice()
    .sort(
      (a, b) => (a.State === "open" ? -1 : 1) - (b.State === "open" ? -1 : 1),
    )
    .forEach((x) => el.appendChild(renderFoodShopCard(x)));
}

/** =========================
 * CARDS
 * ========================= */
function renderAttractionCard(item, { compact, noAction = false, showZeroWait = false } = {}) {
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
  if (srLine) lines.push({ type: "sr", text: srLine, tag: srTag });
  if (maint) lines.push({ type: "maint", text: maint });

  left.appendChild(name);
  if ((!compact || noAction) && lines.length > 0) {
    const sub = document.createElement("div");
    sub.className = "ppgwt__sub";
    sub.innerHTML = lines
      .map((line) => {
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
      actionBtn.innerHTML = '<i class="fas fa-trash-alt" aria-hidden="true"></i>';
    } else {
      actionBtn.className = `ppgwt__star ${fav ? "is-on" : ""}`;
      actionBtn.setAttribute("aria-label", fav ? "Verwijder favoriet" : "Maak favoriet");
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

const SHOW_LANG = CONFIG.locale.startsWith("nl") ? "NL" : CONFIG.locale.startsWith("de") ? "DE" : CONFIG.locale.startsWith("en") ? "EN" : "NL";

function getShowTimesParsed(item) {
  const raw = Array.isArray(item.ShowTimes) ? item.ShowTimes : [];
  const now = new Date();
  const parsed = raw
    .map((t) => {
      const start = t?.StartDateTime ? new Date(t.StartDateTime) : null;
      if (!start) return null;
      const duration = typeof t?.Duration === "number" ? t.Duration : null;
      const titleObj = t?.Title;
      const title = titleObj?.[SHOW_LANG] || titleObj?.NL || titleObj?.EN || null;
      const edition = t?.Edition || null;
      return { start, duration, title, edition };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  const deduped = [];
  let lastMs = -1;
  for (const p of parsed) {
    const ms = p.start.getTime();
    if (ms !== lastMs) {
      deduped.push(p);
      lastMs = ms;
    }
  }
  const upcoming = deduped.filter((p) => p.start > now);
  const next = upcoming[0] || deduped[0] || null;
  const restToday = upcoming.slice(1, 6);
  return { next, restToday, all: deduped };
}

function renderShowCard(item) {
  const card = document.createElement("div");
  card.className = "ppgwt__row";

  const left = document.createElement("div");
  left.className = "ppgwt__rowLeft";

  const name = document.createElement("div");
  name.className = "ppgwt__name";
  const safeName = escapeHtml(item.Name || item.Id || "-");
  name.innerHTML = item.url
    ? `<a class="ppgwt__link" href="${escapeAttr(item.url)}">${safeName}</a>`
    : safeName;

  const sub = document.createElement("div");
  sub.className = "ppgwt__sub";

  const { next, restToday } = getShowTimesParsed(item);
  const lines = [];

  if (next?.title) {
    lines.push({ html: `<span class="ppgwt__showType">${escapeHtml(next.title)}</span>` });
  }
  if (next) {
    const timeStr = formatTime(next.start);
    const durationStr = next.duration != null ? ` · ${next.duration} min` : "";
    lines.push({ html: `<span>Volgende: ${escapeHtml(timeStr)}${escapeHtml(durationStr)}</span>` });
  } else {
    lines.push({ html: "<span>Geen voorstellingen meer vandaag</span>" });
  }
  if (restToday.length > 0) {
    const times = restToday.map((p) => formatTime(p.start)).join(", ");
    lines.push({ html: `<span>Daarna: ${escapeHtml(times)}</span>` });
  }

  sub.innerHTML = lines.map((l) => `<div class="ppgwt__line">${l.html}</div>`).join("");

  left.appendChild(name);
  left.appendChild(sub);

  const right = document.createElement("div");
  right.className = "ppgwt__rowRight";
  const badge = document.createElement("span");
  badge.className = `ppgwt__badge ${item.State === "open" ? "is-open" : "is-closed"}`;
  badge.textContent = item.State === "open" ? "Open" : "Gesloten";
  right.appendChild(badge);

  card.appendChild(left);
  card.appendChild(right);
  return card;
}

function renderFoodShopCard(item) {
  const card = document.createElement("div");
  card.className = "ppgwt__row";

  const left = document.createElement("div");
  left.className = "ppgwt__rowLeft";

  const name = document.createElement("div");
  name.className = "ppgwt__name";
  const safeName = escapeHtml(item.Name || item.Id || "-");
  name.innerHTML = item.url
    ? `<a class="ppgwt__link" href="${escapeAttr(item.url)}">${safeName}</a>`
    : safeName;

  const sub = document.createElement("div");
  sub.className = "ppgwt__sub";

  const openInfo = getOpeningInfo(item);
  sub.innerHTML = `<div class="ppgwt__line"><span>${escapeHtml(openInfo.text || `Status: ${formatStateLabel(item.State)}`)}</span></div>`;

  left.appendChild(name);
  left.appendChild(sub);

  const right = document.createElement("div");
  right.className = "ppgwt__rowRight";

  const badge = document.createElement("span");
  badge.className = `ppgwt__badge ${openInfo.badgeClass}`;
  badge.textContent = openInfo.badgeText;

  right.appendChild(badge);

  card.appendChild(left);
  card.appendChild(right);
  return card;
}

/** =========================
 * OPENING INFO (food/shops)
 * ========================= */
function getOpeningInfo(item) {
  const now = new Date();
  const ot = Array.isArray(item.OpeningTimes) ? item.OpeningTimes : [];
  if (ot.length) {
    const first = ot[0];
    const from = first?.HourFrom ? new Date(first.HourFrom) : null;
    const to = first?.HourTo ? new Date(first.HourTo) : null;

    if (from && to) {
      const fromT = formatTime(from);
      const toT = formatTime(to);

      if (now < from) {
        return {
          badgeText: "Opent later",
          badgeClass: "is-upcoming",
          text: `Opent om ${fromT} (sluit ${toT})`,
        };
      }
      if (now >= from && now <= to) {
        return {
          badgeText: "Open",
          badgeClass: "is-open",
          text: `Open tot ${toT}`,
        };
      }
      if (now > to) {
        return {
          badgeText: "Gesloten",
          badgeClass: "is-closed",
          text: `Vandaag open: ${fromT}–${toT}`,
        };
      }
      return {
        badgeText:
          item.State === "open" ? "Open" : formatStateShort(item.State),
        badgeClass: item.State === "open" ? "is-open" : "is-closed",
        text: `Open: ${fromT}–${toT}`,
      };
    }
  }

  if (item.State === "open")
    return { badgeText: "Open", badgeClass: "is-open", text: "Open" };
  if (item.State === "nognietopen")
    return {
      badgeText: "Opent later",
      badgeClass: "is-upcoming",
      text: "Gaat later open",
    };
  if (item.State === "gesloten")
    return { badgeText: "Gesloten", badgeClass: "is-closed", text: "Gesloten" };
  if (item.State === "inonderhoud")
    return { badgeText: "Onderhoud", badgeClass: "is-maint", text: "In onderhoud" };
  if (item.State === "buitenbedrijf")
    return { badgeText: "Storing", badgeClass: "is-issue", text: "Langer gesloten (storing)" };
  if (item.State === "tijdelijkbuitenbedrijf")
    return { badgeText: "Storing", badgeClass: "is-issue", text: "Tijdelijk gesloten (storing)" };
  if (isUnknownAttractionState(item.State) && getParkOpeningInfo().openNow === false) {
    return {
      badgeText: "Gesloten vandaag",
      badgeClass: "is-closed",
      text: "Gesloten (park is dicht)",
    };
  }
  return {
    badgeText: formatStateShort(item.State),
    badgeClass: "is-unknown",
    text: `Status: ${formatStateLabel(item.State)}`,
  };
}

/** =========================
 * MAINTENANCE
 * ========================= */
function getMaintenanceHint(item) {
  const wins = Array.isArray(item.maintenanceWindows)
    ? item.maintenanceWindows
    : [];
  if (!wins.length) return "";

  const now = new Date();

  const active = wins.find(
    (w) => w.from && w.to && now >= w.from && now <= w.to,
  );
  if (active) {
    const to = formatDate(active.to);
    const weekend =
      typeof active.openInWeekend === "boolean"
        ? active.openInWeekend
          ? " (weekend open)"
          : " (weekend dicht)"
        : "";
    return `Onderhoud t/m ${to}${weekend}`;
  }

  const future = wins
    .filter((w) => w.from && now < w.from)
    .sort((a, b) => a.from - b.from)[0];
  if (future) {
    const from = formatDate(future.from);
    const to = future.to ? formatDate(future.to) : null;
    const range = to ? `${from}–${to}` : from;
    return `Let op: onderhoud vanaf ${range}`;
  }

  return "";
}

/** =========================
 * FILTERS / SORT
 * ========================= */
function filterByQuery(list) {
  const q = (state.ui.query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((item) => {
    const hay = `${item.Name || ""} ${item.Id || ""}`.toLowerCase();
    return hay.includes(q);
  });
}

function applyGlobalFilters(list) {
  const q = (state.ui.query || "").toLowerCase();

  return list.filter((a) => {
    if (q) {
      const hay = `${a.Name || ""} ${a.Id || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (state.ui.filterSingleRider && !a.singlerider) return false;
    if (state.ui.filterMaintOrIssue && !isMaintenanceOrMalfunction(a.State)) return false;

    if (typeof state.ui.filterLt === "number") {
      if (!(typeof a.WaitingTime === "number" && a.WaitingTime >= 0))
        return false;
      if (a.WaitingTime >= state.ui.filterLt) return false;
    }
    return true;
  });
}

function isMaintenanceOrMalfunction(st) {
  return st === "inonderhoud" || st === "buitenbedrijf" || st === "tijdelijkbuitenbedrijf";
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

/** =========================
 * BADGES (Attractions)
 * ========================= */
function isUnknownAttractionState(st) {
  const known = ["open", "gesloten", "nognietopen", "inonderhoud", "buitenbedrijf", "tijdelijkbuitenbedrijf"];
  return !st || !known.includes(st);
}

function badgeClassAttraction(item) {
  if (item.State === "open") return "is-open";
  if (item.State === "gesloten") return "is-closed";
  if (item.State === "inonderhoud") return "is-maint";
  if (item.State === "tijdelijkbuitenbedrijf" || item.State === "buitenbedrijf")
    return "is-issue";
  if (item.State === "nognietopen") return "is-upcoming";
  if (isUnknownAttractionState(item.State) && getParkOpeningInfo().openNow === false) return "is-closed";
  return "is-unknown";
}

function badgeTextAttraction(item, opts) {
  const showZeroWait = opts?.showZeroWait === true;
  if (item.State === "open") {
    const wt = typeof item.WaitingTime === "number" && item.WaitingTime >= 0 ? item.WaitingTime : null;
    if (wt !== null) return `${wt} min`;
    if (showZeroWait) return "0 min";
    return "Open";
  }
  if (isUnknownAttractionState(item.State) && getParkOpeningInfo().openNow === false) return "Gesloten vandaag";
  return formatStateShort(item.State);
}

function miniBadgeClass(st) {
  if (st === "open") return "mini-open";
  if (st === "gesloten") return "mini-closed";
  if (st === "inonderhoud") return "mini-maint";
  if (st === "tijdelijkbuitenbedrijf" || st === "buitenbedrijf")
    return "mini-issue";
  return "mini-unknown";
}

/** =========================
 * CHIPS
 * ========================= */
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

/** =========================
 * FAVORITES
 * ========================= */
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
function setFavorite(id, on) {
  const sid = favId(id);
  if (!sid) return;
  const exists = state.favorites.includes(sid);
  if (on && !exists) state.favorites.push(sid);
  if (!on && exists) state.favorites = state.favorites.filter((x) => x !== sid);
  saveFavorites();
}
function isFavorite(id) {
  return state.favorites.includes(favId(id));
}

/** =========================
 * HELPERS
 * ========================= */
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
    case "buitenbedrijf":
      return "Storing";
    case "tijdelijkbuitenbedrijf":
      return "Storing";
    case "inonderhoud":
      return "Onderhoud";
    case "nognietopen":
      return "Opent later";
    default:
      return "Onbekend";
  }
}
function formatStateLabel(st) {
  switch (st) {
    case "open":
      return "Open";
    case "gesloten":
      return "Gesloten";
    case "buitenbedrijf":
      return "Langer gesloten (storing)";
    case "tijdelijkbuitenbedrijf":
      return "Tijdelijk gesloten (storing)";
    case "inonderhoud":
      return "In onderhoud";
    case "nognietopen":
      return "Nog niet open";
    default:
      return "Onbekend";
  }
}
function formatTime(d) {
  return d.toLocaleTimeString(CONFIG.locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatDate(d) {
  return d.toLocaleDateString(CONFIG.locale, {
    day: "2-digit",
    month: "short",
  });
}

/** Park opening uit state.data.OpeningHours (API) */
function getParkOpeningInfo() {
  const oh = state.data?.OpeningHours;
  if (!oh) return { openNow: null, fromTo: "", hourFrom: null, hourTo: null };
  const from = oh.HourFrom ? new Date(oh.HourFrom) : null;
  const to = oh.HourTo ? new Date(oh.HourTo) : null;
  const fromTo =
    from && to ? `${formatTime(from)} – ${formatTime(to)}` : "";
  const now = new Date();
  let openNow = null;
  if (from && to) {
    if (now >= from && now <= to) openNow = true;
    else openNow = false;
  }
  return { openNow, fromTo, hourFrom: from, hourTo: to };
}

/** Bepaal of we de volledige widget tonen of een fallback (alleen wanneer er geen data is). */
function getFallbackMessage() {
  const list = state.data?.AttractionInfo;
  if (!state.data || !Array.isArray(list) || list.length === 0)
    return "Data niet beschikbaar";
  return null;
}

function renderFallbackState(message) {
  const root = document.getElementById("ppg-wachttijden");
  if (!root) return;
  const showMuted = message !== "Park gesloten";
  const displayMessage = message === "Park gesloten" ? "🌙 " + message : message;
  root.innerHTML = `
    <div class="ppgwt" style="--ppg-accent:${escapeAttr(CONFIG.accent)};">
      <div class="ppgwt__card">
        <h3 class="ppgwt__h3">${escapeHtml(displayMessage)}</h3>
        ${showMuted ? '<div class="ppgwt__muted">Er is nu niets te tonen. Probeer het later opnieuw.</div>' : ''}
      </div>
    </div>
  `;
}

function renderErrorState() {
  document.getElementById("ppg-wachttijden").innerHTML = `
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
