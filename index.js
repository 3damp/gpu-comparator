const DEFAULT_GPU_DATABASE = [
  { id: "rtx-5090", name: "GeForce RTX 5090", score: 38969, brand: "NVIDIA" },
  { id: "rtx-4090", name: "GeForce RTX 4090", score: 38063, brand: "NVIDIA" },
  { id: "rtx-5080", name: "GeForce RTX 5080", score: 35683, brand: "NVIDIA" },
  { id: "rtx-4080", name: "GeForce RTX 4080", score: 34432, brand: "NVIDIA" },
  { id: "rtx-4080s", name: "GeForce RTX 4080 SUPER", score: 34265, brand: "NVIDIA" },
  { id: "rtx-5070ti", name: "GeForce RTX 5070 Ti", score: 32435, brand: "NVIDIA" },
  { id: "rtx-4070tis", name: "GeForce RTX 4070 Ti SUPER", score: 31810, brand: "NVIDIA" },
  { id: "rtx-4070ti", name: "GeForce RTX 4070 Ti", score: 31574, brand: "NVIDIA" },
  { id: "rx-7900xtx", name: "Radeon RX 7900 XTX", score: 31410, brand: "AMD" },
  { id: "rtx-4070s", name: "GeForce RTX 4070 SUPER", score: 29978, brand: "NVIDIA" },
  { id: "rtx-3090ti", name: "GeForce RTX 3090 Ti", score: 29685, brand: "NVIDIA" },
  { id: "rx-7900xt", name: "Radeon RX 7900 XT", score: 29010, brand: "AMD" },
  { id: "rtx-5070", name: "GeForce RTX 5070", score: 28754, brand: "NVIDIA" },
  { id: "rx-6950xt", name: "Radeon RX 6950 XT", score: 28440, brand: "AMD" },
  { id: "rtx-4070", name: "GeForce RTX 4070", score: 26908, brand: "NVIDIA" },
  { id: "rx-9070xt", name: "Radeon RX 9070 XT", score: 26904, brand: "AMD" },
  { id: "rx-7900gre", name: "Radeon RX 7900 GRE", score: 26799, brand: "AMD" },
  { id: "rtx-3080ti", name: "GeForce RTX 3080 Ti", score: 26774, brand: "NVIDIA" },
  { id: "rtx-3080", name: "GeForce RTX 3080", score: 24000, brand: "NVIDIA" },
  { id: "rx-7800xt", name: "Radeon RX 7800 XT", score: 21000, brand: "AMD" }
].sort((a, b) => b.score - a.score);

const CACHE_KEY = "gpuDatabaseCacheV1";
const CACHE_TIME_KEY = "gpuDatabaseCacheTimeV1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

let gpuDatabase = [...DEFAULT_SELECTION];

const selectedIds = new Set([
  "rtx-5090",
  "rtx-4090",
  "rx-7900xtx",
  "rtx-4080s",
  "rtx-4070s"
]);

const elements = {
  searchWrap: document.getElementById("searchWrap"),
  searchInput: document.getElementById("searchInput"),
  clearSearchBtn: document.getElementById("clearSearchBtn"),
  searchDropdown: document.getElementById("searchDropdown"),
  comparingCount: document.getElementById("comparingCount"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  selectedTags: document.getElementById("selectedTags"),
  chartContent: document.getElementById("chartContent")
};

let showDropdown = false;

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function detectBrand(name) {
  const value = name.toLowerCase();
  if (value.includes("radeon") || value.includes("amd")) return "AMD";
  if (
    value.includes("geforce") ||
    value.includes("nvidia") ||
    value.includes("rtx") ||
    value.includes("gtx")
  ) {
    return "NVIDIA";
  }
  return "Other";
}

function normalizeAndSort(data) {
  return data
    .filter((gpu) => gpu && gpu.id && gpu.name && Number.isFinite(gpu.score))
    .sort((a, b) => b.score - a.score);
}

function parseGpuRows(rawText) {
  const seenIds = new Set();
  const parsed = [];
  const lines = rawText.split("\n");

  for (const line of lines) {
    const cleaned = line.trim();
    if (!cleaned) continue;

    const match = cleaned.match(/^(.+?)\s{2,}([0-9][0-9,]*)\s+([0-9][0-9,]*)\s+/);
    if (!match) continue;

    const name = match[1].trim();
    const score = Number(match[2].replace(/,/g, ""));

    if (!name || !Number.isFinite(score)) continue;
    if (/^videocard name$/i.test(name)) continue;

    let id = slugify(name);
    if (!id) continue;

    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${slugify(name)}-${suffix}`;
      suffix += 1;
    }

    seenIds.add(id);
    parsed.push({
      id,
      name,
      score,
      brand: detectBrand(name)
    });
  }

  return normalizeAndSort(parsed);
}

function readCachedDatabase() {
  try {
    const rawData = localStorage.getItem(CACHE_KEY);
    const rawTime = localStorage.getItem(CACHE_TIME_KEY);
    if (!rawData || !rawTime) return null;

    const timestamp = Number(rawTime);
    if (!Number.isFinite(timestamp)) return null;
    if (Date.now() - timestamp > CACHE_TTL_MS) return null;

    const parsed = JSON.parse(rawData);
    const normalized = normalizeAndSort(parsed);
    return normalized.length > 0 ? normalized : null;
  } catch (_error) {
    return null;
  }
}

function writeCachedDatabase(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
  } catch (_error) {
    // Storage can fail in private mode or when quota is exceeded.
  }
}

async function fetchRemoteGpuListText() {
  const targetUrl = "https://www.videocardbenchmark.net/gpu_list.php";
  const sources = [
    `https://r.jina.ai/http://www.videocardbenchmark.net/gpu_list.php`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    targetUrl
  ];

  for (const source of sources) {
    try {
      console.log('> Fetching');
      
      const response = await fetch(source);
      if (!response.ok) continue;

      const text = await response.text();
      if (text && text.length > 1000) return text;
    } catch (_error) {
      // Try next source.
    }
  }

  return "";
}

function ensureSelectedIdsAreValid() {
  const validIds = new Set(gpuDatabase.map((gpu) => gpu.id));
  const current = [...selectedIds];

  current.forEach((id) => {
    if (!validIds.has(id)) selectedIds.delete(id);
  });

  if (selectedIds.size === 0) {
    gpuDatabase.slice(0, 5).forEach((gpu) => selectedIds.add(gpu.id));
  }
}

async function loadGpuDatabaseOnFirstLoad() {
  const cached = readCachedDatabase();
  if (cached) {
    gpuDatabase = cached;
    ensureSelectedIdsAreValid();
    return;
  }

  const rawText = await fetchRemoteGpuListText();
  const scraped = parseGpuRows(rawText);

  if (scraped.length >= 100) {
    gpuDatabase = scraped;
    ensureSelectedIdsAreValid();
    writeCachedDatabase(scraped);
  }
}

function getChartData() {
  return gpuDatabase.filter((gpu) => selectedIds.has(gpu.id)).sort((a, b) => b.score - a.score);
}

function getSearchResults() {
  const query = elements.searchInput.value.trim().toLowerCase();
  if (!query) return [];

  return gpuDatabase
    .filter((gpu) => gpu.name.toLowerCase().includes(query) && !selectedIds.has(gpu.id))
    .slice(0, 8);
}

function renderSearchDropdown() {
  const query = elements.searchInput.value.trim();
  const results = getSearchResults();
  const shouldShow = showDropdown && query.length > 0;

  elements.searchDropdown.classList.toggle("hidden", !shouldShow);
  elements.clearSearchBtn.classList.toggle("hidden", query.length === 0);

  if (!shouldShow) {
    elements.searchDropdown.innerHTML = "";
    return;
  }

  if (results.length === 0) {
    elements.searchDropdown.innerHTML = '<div class="dropdown-empty">No matching GPUs found.</div>';
    return;
  }

  elements.searchDropdown.innerHTML = results
    .map(
      (gpu) =>
        `<button type="button" class="dropdown-item" data-add-id="${gpu.id}">` +
        `<span>${gpu.name}</span>` +
        `<span class="dropdown-score">${gpu.score.toLocaleString()} pts</span>` +
        "</button>"
    )
    .join("");
}

function renderSelectedTags() {
  const chartData = getChartData();

  if (chartData.length === 0) {
    elements.selectedTags.innerHTML = '<div class="empty-selected">No GPUs selected. Search above to add.</div>';
    return;
  }

  elements.selectedTags.innerHTML = chartData
    .map(
      (gpu) =>
        `<div class="tag">` +
        `<span class="tag-dot ${gpu.brand === "NVIDIA" ? "nvidia" : "amd"}"></span>` +
        `<span>${gpu.name}</span>` +
        `<button type="button" class="tag-remove" data-remove-id="${gpu.id}" aria-label="Remove ${gpu.name}">x</button>` +
        `</div>`
    )
    .join("");
}

function renderChart() {
  const chartData = getChartData();

  if (chartData.length === 0) {
    elements.chartContent.innerHTML = '<div class="chart-empty">Select GPUs from the sidebar to compare.</div>';
    return;
  }

  const maxScore = Math.max(...chartData.map((gpu) => gpu.score));

  elements.chartContent.innerHTML = chartData
    .map((gpu) => {
      const percentage = (gpu.score / maxScore) * 100;
      const safeWidth = Math.max(percentage, 2);
      const brandClass = gpu.brand === "NVIDIA" ? "nvidia" : "amd";
      const scoreInside = percentage > 20 ? gpu.score.toLocaleString() : "";

      return (
        `<div class="bar-row">` +
        `<div class="bar-head">` +
        `<span class="bar-name">${gpu.name}</span>` +
        `<span class="bar-score-mobile">${gpu.score.toLocaleString()}</span>` +
        `</div>` +
        `<div class="bar-track-wrap">` +
        `<div class="bar-track">` +
        `<div class="bar-fill ${brandClass}" style="width: ${safeWidth}%">${scoreInside}</div>` +
        `</div>` +
        `<span class="bar-score-desktop">${gpu.score.toLocaleString()}</span>` +
        `</div>` +
        `</div>`
      );
    })
    .join("");
}

function renderHeader() {
  elements.comparingCount.textContent = `Comparing (${selectedIds.size})`;
  elements.clearAllBtn.disabled = selectedIds.size === 0;
}

function renderAll() {
  renderHeader();
  renderSearchDropdown();
  renderSelectedTags();
  renderChart();
}

elements.searchInput.addEventListener("input", () => {
  showDropdown = true;
  renderSearchDropdown();
});

elements.searchInput.addEventListener("focus", () => {
  showDropdown = true;
  renderSearchDropdown();
});

elements.clearSearchBtn.addEventListener("click", () => {
  elements.searchInput.value = "";
  showDropdown = false;
  renderSearchDropdown();
  elements.searchInput.focus();
});

elements.clearAllBtn.addEventListener("click", () => {
  selectedIds.clear();
  renderAll();
});

elements.searchDropdown.addEventListener("click", (event) => {
  const target = event.target.closest("[data-add-id]");
  if (!target) return;

  const id = target.getAttribute("data-add-id");
  selectedIds.add(id);
  elements.searchInput.value = "";
  showDropdown = false;
  renderAll();
});

elements.selectedTags.addEventListener("click", (event) => {
  const target = event.target.closest("[data-remove-id]");
  if (!target) return;

  const id = target.getAttribute("data-remove-id");
  selectedIds.delete(id);
  renderAll();
});

document.addEventListener("click", (event) => {
  if (!elements.searchWrap.contains(event.target)) {
    showDropdown = false;
    renderSearchDropdown();
  }
});

renderAll();

loadGpuDatabaseOnFirstLoad()
  .then(() => {
    renderAll();
  })
  .catch((_error) => {
    renderAll();
  });