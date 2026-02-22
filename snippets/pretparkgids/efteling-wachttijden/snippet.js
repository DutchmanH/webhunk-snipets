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
    filterOpen: false,
    filterFavoritesOnly: false,
    filterSingleRider: false,
    filterHasWaitTime: false,
    filterLt: null,
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

function mountUI() {
  const root = document.getElementById("ppg-wachttijden");
  root.innerHTML = `
    <div class="ppgwt" style="--ppg-accent:${escapeAttr(CONFIG.accent)};">
      <div class="ppgwt__header">
        <!-- ✅ live info links -->
        <div class="ppgwt__liveWrap" id="ppgwt-liveWrap" data-tooltip="Laden...">
          <span class="ppgwt__dot" id="ppgwt-dot"></span>
          <span class="ppgwt__liveText" id="ppgwt-liveText">Laden...</span>
        </div>

        <button class="ppgwt__btn ppgwt__btn--white" id="ppgwt-refreshBtn" type="button">
          <span class="ppgwt__spinner" id="ppgwt-spinner"></span>
          Ververs
        </button>
      </div>

      <div class="ppgwt__grid">
        <!-- LEFT -->
        <aside class="ppgwt__left">

          <!-- ✅ aparte card voor totale wachttijd -->
          <div class="ppgwt__card ppgwt__card--stat">
            <div class="ppgwt__statLabel">Totale wachttijd</div>
            <div class="ppgwt__statValue" id="ppgwt-totalWaitValue">-</div>
            <div class="ppgwt__statSub" id="ppgwt-refreshHint"></div>
          </div>

          <div class="ppgwt__card">
            <div class="ppgwt__cardHeader">
              <h3 class="ppgwt__h3">Je kan nu het beste naar</h3>
              <span class="ppgwt__pill" id="ppgwt-bestCount">-</span>
            </div>
            <div class="ppgwt__list" id="ppgwt-bestList"></div>
            <div class="ppgwt__empty" id="ppgwt-bestEmpty" style="display:none;">
              Geen bruikbare wachttijden in je favorieten.
            </div>
          </div>

          <div class="ppgwt__card">
            <div class="ppgwt__cardHeader">
              <h3 class="ppgwt__h3">Favorieten</h3>
              <button class="ppgwt__btn ppgwt__btn--ghost" id="ppgwt-toggleEditBtn" type="button">Bewerk</button>
            </div>

            <div class="ppgwt__muted ppgwt__mb8">Ster = jouw lijst. Die bepaalt “beste naar”.</div>

            <!-- ✅ fix: containers bestaan altijd -->
            <div id="ppgwt-favoritesView"></div>
            <div id="ppgwt-favoritesEdit" style="display:none;"></div>
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

            <div class="ppgwt__tabcontent is-active" id="tab-attracties">
              <div class="ppgwt__toolbar">
                <input class="ppgwt__search" id="ppgwt-search" placeholder="Zoek attractie..." type="search" />
                <div class="ppgwt__chips" id="ppgwt-chips">
                  <button class="ppgwt__chip" data-chip="open" type="button">Open</button>
                  <button class="ppgwt__chip" data-chip="favorites" type="button">Favorieten</button>
                  <button class="ppgwt__chip" data-chip="single" type="button">Single rider</button>
                  <button class="ppgwt__chip" data-chip="hasWait" type="button">Met wachttijd</button>
                  <button class="ppgwt__chip" data-chip="lt15" type="button">&lt; 15</button>
                  <button class="ppgwt__chip" data-chip="lt30" type="button">&lt; 30</button>
                  <button class="ppgwt__chip" data-chip="lt60" type="button">&lt; 60</button>
                </div>
              </div>

              <div class="ppgwt__muted ppgwt__mb8">Sortering: langste wachttijd bovenaan (hip).</div>
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

  // Refresh + anti spam
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("#ppgwt-refreshBtn");
    if (!btn) return;
    const now = Date.now();
    if (now < state.meta.manualCooldownUntil) return;
    fetchAndRender({ reason: "manual" });
    state.meta.manualCooldownUntil = now + CONFIG.manualCooldownMs;
    renderRefreshHint("Verversd ✓");
    setTimeout(() => renderRefreshHint(""), 2500);
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
  renderMeta();
  renderTotalWaitCard();
  renderBestFromFavorites();
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
  document
    .getElementById("ppgwt-liveWrap")
    .setAttribute(
      "data-tooltip",
      `Laatste update: ${lastUpdate}\nAuto-refresh: elke ${Math.floor(CONFIG.refreshIntervalMs / 1000)}s (nog ${left}s)`,
    );
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
  const el = document.getElementById("ppgwt-liveWrap");
  if (el)
    el.setAttribute(
      "data-tooltip",
      `Laatste update: ${lastUpdate}\nAuto-refresh: elke ${Math.floor(CONFIG.refreshIntervalMs / 1000)}s (nog ${left}s)`,
    );
}

function renderTotalWaitCard() {
  const total = calculateTotalWaitingTime(state.normalized?.attractions || []);
  const el = document.getElementById("ppgwt-totalWaitValue");
  if (el) el.textContent = total > 0 ? `${total} min` : "-";
}

function renderRefreshHint(text) {
  const el = document.getElementById("ppgwt-refreshHint");
  if (!el) return;
  el.textContent = text || "";
  el.style.opacity = text ? "1" : "0";
}

function updateRefreshButtonState() {
  const btn = document.getElementById("ppgwt-refreshBtn");
  if (!btn) return;
  const now = Date.now();
  const cooling = now < state.meta.manualCooldownUntil;
  btn.disabled = cooling || state.meta.isRefreshing;

  if (cooling) {
    const left = Math.ceil((state.meta.manualCooldownUntil - now) / 1000);
    btn.innerHTML = `<span class="ppgwt__spinner"></span> Wacht ${left}s`;
  } else {
    btn.innerHTML = `<span class="ppgwt__spinner ${state.meta.isRefreshing ? "is-on" : ""}" id="ppgwt-spinner"></span> Ververs`;
  }
}

function setRefreshing(on) {
  state.meta.isRefreshing = on;
  updateRefreshButtonState();
}

function renderBestFromFavorites() {
  const listEl = document.getElementById("ppgwt-bestList");
  const emptyEl = document.getElementById("ppgwt-bestEmpty");
  const countEl = document.getElementById("ppgwt-bestCount");

  const attractions = state.normalized?.attractions || [];
  const favSet = new Set(state.favorites);

  const candidates = attractions
    .filter((a) => favSet.has(a.Id))
    .filter((a) => a.State === "open")
    .filter((a) => typeof a.WaitingTime === "number" && a.WaitingTime >= 0)
    .sort((a, b) => a.WaitingTime - b.WaitingTime);

  const best = candidates.slice(0, CONFIG.topNFromFavorites);
  countEl.textContent = best.length ? String(best.length) : "0";

  listEl.innerHTML = "";
  if (!best.length) {
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  for (const a of best)
    listEl.appendChild(renderAttractionCard(a, { compact: true }));
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
          const checked = state.favorites.includes(a.Id);
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
  const list = state.normalized?.shows || [];

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
    state.normalized?.food || [],
  );
}
function renderShops() {
  renderFoodShopList(
    "ppgwt-shops",
    "ppgwt-shopsEmpty",
    state.normalized?.shops || [],
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
function renderAttractionCard(item, { compact }) {
  const fav = state.favorites.includes(item.Id);

  const card = document.createElement("div");
  card.className = `ppgwt__row ${compact ? "is-compact" : ""} ${fav ? "is-fav" : ""}`;

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

  const mainLine =
    item.State === "open" && typeof item.WaitingTime === "number"
      ? `Wachttijd: ${item.WaitingTime} min`
      : `Status: ${formatStateLabel(item.State)}`;

  let srLine = "";
  if (item.singlerider) {
    const sr = item.singlerider;
    if (sr.State === "open" && typeof sr.WaitingTime === "number")
      srLine = `Single Rider: ${sr.WaitingTime} min`;
    else srLine = `Single Rider: ${formatStateShort(sr.State)}`;
  }

  const maint = getMaintenanceHint(item);

  const lines = [mainLine];
  if (srLine) lines.push(srLine);
  if (maint) lines.push(maint);

  sub.innerHTML = lines
    .map((l, idx) => {
      if (
        idx === 1 &&
        srLine &&
        item.singlerider &&
        item.singlerider.State !== "open"
      ) {
        return `<div class="ppgwt__line">
        <span>${escapeHtml(l)}</span>
        <span class="ppgwt__miniBadge ${miniBadgeClass(item.singlerider.State)}">${escapeHtml(formatStateShort(item.singlerider.State))}</span>
      </div>`;
      }
      if (maint && l.startsWith("Let op:")) {
        return `<div class="ppgwt__line"><span class="ppgwt__warnText">⚠ ${escapeHtml(l)}</span></div>`;
      }
      return `<div class="ppgwt__line"><span>${escapeHtml(l)}</span></div>`;
    })
    .join("");

  left.appendChild(name);
  if (!compact) left.appendChild(sub);

  const right = document.createElement("div");
  right.className = "ppgwt__rowRight";

  const badge = document.createElement("span");
  badge.className = `ppgwt__badge ${badgeClassAttraction(item)}`;
  badge.textContent = badgeTextAttraction(item);

  const star = document.createElement("button");
  star.type = "button";
  star.className = `ppgwt__star ${fav ? "is-on" : ""}`;
  star.setAttribute("data-star-id", item.Id);
  star.setAttribute("aria-label", fav ? "Verwijder favoriet" : "Maak favoriet");
  star.innerHTML = fav ? "★" : "☆";

  right.appendChild(badge);
  right.appendChild(star);

  card.appendChild(left);
  card.appendChild(right);
  return card;
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

  const now = new Date();
  const times = Array.isArray(item.ShowTimes)
    ? item.ShowTimes.map((t) => ({
        start: t?.StartDateTime ? new Date(t.StartDateTime) : null,
      }))
        .filter((t) => t.start)
        .sort((a, b) => a.start - b.start)
    : [];

  const upcoming = times.filter((t) => t.start > now);
  const next = upcoming[0] || null;

  const statusLine = `Status: ${item.State === "open" ? "Open" : item.State === "gesloten" ? "Gesloten" : formatStateLabel(item.State)}`;
  const nextLine = next
    ? `Eerstvolgende show om: ${formatTime(next.start)}`
    : "Eerstvolgende show om: -";
  const rest = upcoming
    .slice(0, 6)
    .map((t) => formatTime(t.start))
    .join(", ");
  const restLine = rest ? `Vandaag nog: ${rest}` : "Vandaag nog: -";

  sub.innerHTML = `
    <div class="ppgwt__line"><span>${escapeHtml(statusLine)}</span></div>
    <div class="ppgwt__line"><span>${escapeHtml(nextLine)}</span></div>
    <div class="ppgwt__line"><span>${escapeHtml(restLine)}</span></div>
  `;

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
function applyGlobalFilters(list) {
  const q = (state.ui.query || "").toLowerCase();
  const favSet = new Set(state.favorites);

  return list.filter((a) => {
    if (q) {
      const hay = `${a.Name || ""} ${a.Id || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (state.ui.filterOpen && a.State !== "open") return false;
    if (state.ui.filterFavoritesOnly && !favSet.has(a.Id)) return false;
    if (state.ui.filterSingleRider && !a.singlerider) return false;

    if (state.ui.filterHasWaitTime) {
      if (!(typeof a.WaitingTime === "number" && a.WaitingTime >= 0))
        return false;
    }
    if (typeof state.ui.filterLt === "number") {
      if (!(typeof a.WaitingTime === "number" && a.WaitingTime >= 0))
        return false;
      if (a.WaitingTime >= state.ui.filterLt) return false;
    }
    return true;
  });
}

function sortByHipLongestWait(a, b) {
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
function badgeClassAttraction(item) {
  if (item.State === "open") return "is-open";
  if (item.State === "gesloten") return "is-closed";
  if (item.State === "inonderhoud") return "is-maint";
  if (item.State === "tijdelijkbuitenbedrijf" || item.State === "buitenbedrijf")
    return "is-issue";
  if (item.State === "nognietopen") return "is-upcoming";
  return "is-unknown";
}

function badgeTextAttraction(item) {
  if (item.State === "open") {
    if (typeof item.WaitingTime === "number") return `${item.WaitingTime} min`;
    return "Open";
  }
  return formatStateShort(item.State);
}

function miniBadgeClass(st) {
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
  if (which === "open") state.ui.filterOpen = !state.ui.filterOpen;
  if (which === "favorites")
    state.ui.filterFavoritesOnly = !state.ui.filterFavoritesOnly;
  if (which === "single")
    state.ui.filterSingleRider = !state.ui.filterSingleRider;
  if (which === "hasWait")
    state.ui.filterHasWaitTime = !state.ui.filterHasWaitTime;

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
    if (k === "open") on = state.ui.filterOpen;
    if (k === "favorites") on = state.ui.filterFavoritesOnly;
    if (k === "single") on = state.ui.filterSingleRider;
    if (k === "hasWait") on = state.ui.filterHasWaitTime;
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
    return arr;
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
function toggleFavorite(id) {
  const i = state.favorites.indexOf(id);
  if (i >= 0) state.favorites.splice(i, 1);
  else state.favorites.push(id);
  saveFavorites();
}
function setFavorite(id, on) {
  const exists = state.favorites.includes(id);
  if (on && !exists) state.favorites.push(id);
  if (!on && exists) state.favorites = state.favorites.filter((x) => x !== id);
  saveFavorites();
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
