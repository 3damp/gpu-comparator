const DEFAULT_SELECTION_GROUPS = [
  {
    label: "RTX 50 Series",
    color: "#f87171",
    names: [
      "GeForce RTX 5080",
      "GeForce RTX 5070",
      "GeForce RTX 5060",
    ]
  },
  {
    label: "RTX 50 Series Laptop",
    color: "#22d3ee",
    names: [
      "GeForce RTX 5080 Laptop GPU",
      "GeForce RTX 5070 Laptop GPU",
      "GeForce RTX 5060 Laptop GPU",
    ]
  },
  {
    label: "RTX 40 Series",
    color: "#f87171",
    names: [
      "GeForce RTX 4060",
      "GeForce RTX 4070",
      "GeForce RTX 4080",
    ]
  },
  {
    label: "RTX 40 Series Laptop",
    color: "#22d3ee",
    names: [
      "GeForce RTX 4060 Laptop GPU",
      "GeForce RTX 4070 Laptop GPU",
      "GeForce RTX 4080 Laptop GPU",
    ]
  },
  {
    label: "RTX 30 Series",
    color: "#f87171",
    names: [
      "GeForce RTX 3080",
      "GeForce RTX 3070",
      "GeForce RTX 3060",
    ]
  },
  {
    label: "RTX 30 Series Laptop",
    color: "#22d3ee",
    names: [
      "GeForce RTX 3080 Laptop GPU",
      "GeForce RTX 3070 Laptop GPU",
      "GeForce RTX 3060 Laptop GPU",
    ]
  },
];

const CACHE_KEY = "gpuRawTextCacheV1";
const CACHE_TIME_KEY = "gpuRawTextCacheTimeV1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const SELECTION_KEY = "gpuSelectionV1";

let rawGpuText = "";
/** @type {Map<string, {id: string, name: string, score: number, rank: number, brand: string}>} */
let rawGpuMap = new Map();
let searchCache = new Map();

/** @type {Array<{id: string, label: string, color: string, gpus: Map<string, {id: string, name: string, score: number, rank: number, brand: string}>}>} */
let groups = [];
let activeGroupId = null;

const SWATCH_PALETTE = [
  "#f87171", "#fb923c", "#facc15", "#4ade80", "#34d399",
  "#22d3ee", "#60a5fa", "#a78bfa", "#f472b6", "#e879f9",
  "#67e8f9", "#86efac", "#fde68a", "#c4b5fd", "#fdba74",
  "#ffffff", "#94a3b8", "#475569", "#1e293b", "#020617",
];

let colorPopoverTargetGroupId = null;
let selectionReady = false;

const elements = {
  searchWrap: document.getElementById("searchWrap"),
  searchInput: document.getElementById("searchInput"),
  clearSearchBtn: document.getElementById("clearSearchBtn"),
  searchDropdown: document.getElementById("searchDropdown"),
  comparingCount: document.getElementById("comparingCount"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  addGroupBtn: document.getElementById("addGroupBtn"),
  chartRuler: document.getElementById("chartRuler"),
  colorPopover: document.getElementById("colorPopover"),
  colorPopoverSwatches: document.getElementById("colorPopoverSwatches"),
  colorPopoverInput: document.getElementById("colorPopoverInput"),
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

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseGpuLine(line) {
  // Each GPU row is: name\tscore\trank\tvalue\tprice
  const parts = line.split("\t");
  if (parts.length < 3) return null;

  const name = parts[0].trim();
  const score = Number(parts[1].trim().replace(/,/g, ""));
  const rank = Number(parts[2].trim().replace(/,/g, ""));

  if (!name || !Number.isFinite(score) || score <= 0) return null;
  if (!Number.isFinite(rank) || rank <= 0) return null;
  if (/^videocard name$/i.test(name)) return null;

  return {
    id: slugify(`${name}-${rank}`),
    name,
    score,
    rank,
    brand: detectBrand(name)
  };
}

function rebuildGpuMap(text) {
  rawGpuText = text || "";
  rawGpuMap = new Map();
  searchCache = new Map();

  for (const line of rawGpuText.split("\n")) {
    const gpu = parseGpuLine(line);
    if (!gpu) continue;
    rawGpuMap.set(gpu.name, gpu);
  }
}

function readCachedDatabase() {
  console.log('> read cached db');
  try {
    const rawData = localStorage.getItem(CACHE_KEY);
    const rawTime = localStorage.getItem(CACHE_TIME_KEY);
    if (!rawData || !rawTime) return null;

    const timestamp = Number(rawTime);
    if (!Number.isFinite(timestamp)) return null;
    if (Date.now() - timestamp > CACHE_TTL_MS) return null;

    return rawData && rawData.length > 1000 ? rawData : null;
  } catch (_error) {
    return null;
  }
}

function writeCachedDatabase(data) {
  console.log('> store data');
  
  try {
    localStorage.setItem(CACHE_KEY, data);
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
  } catch (_error) {
    // Storage can fail in private mode or when quota is exceeded.
    console.warn("Failed to write GPU database to localStorage:", _error);
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

async function loadGpuDatabaseOnFirstLoad() {
  let rawText = readCachedDatabase();
  
  if (!rawText) {
    rawText = await fetchRemoteGpuListText();
    if (rawText && rawText.length > 1000) 
      writeCachedDatabase(rawText);
  }
  rebuildGpuMap(rawText);
  if (!loadSavedSelection()) applyDefaultSelection();
  selectionReady = true;
}

function saveSelection() {
  if (!selectionReady) return;
  const serializable = groups.map((g) => ({
    id: g.id,
    label: g.label,
    color: g.color,
    gpuIds: [...g.gpus.keys()],
  }));
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify({ groups: serializable, activeGroupId }));
  } catch (_e) {
    // Storage full — skip silently
  }
}

/** Restores groups from localStorage. Returns true if successful, false if nothing saved or data invalid. */
function loadSavedSelection() {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return false;
    const { groups: saved, activeGroupId: savedActiveId } = JSON.parse(raw);
    if (!Array.isArray(saved) || saved.length === 0) return false;

    const restored = [];
    for (const g of saved) {
      const gpus = new Map();
      for (const gpuId of g.gpuIds) {
        // Find the GPU by id in rawGpuMap
        for (const gpu of rawGpuMap.values()) {
          if (gpu.id === gpuId) { gpus.set(gpuId, gpu); break; }
        }
      }
      restored.push({ id: g.id, label: g.label, color: g.color, gpus });
    }

    groups = restored;
    activeGroupId = groups.some((g) => g.id === savedActiveId) ? savedActiveId : (groups[0]?.id ?? null);
    return true;
  } catch (_e) {
    return false;
  }
}

function applyDefaultSelection() {
  groups = [];
  for (const groupDef of DEFAULT_SELECTION_GROUPS) {
    const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const gpus = new Map();
    for (const name of groupDef.names) {
      const gpu = rawGpuMap.get(name);
      if (gpu) gpus.set(gpu.id, gpu);
    }
    groups.push({ id, label: groupDef.label, color: groupDef.color, gpus });
  }
  activeGroupId = groups.length > 0 ? groups[0].id : null;
  saveSelection();
}

function getAllSelectedIds() {
  const all = new Set();
  for (const g of groups) g.gpus.forEach((_, id) => all.add(id));
  return all;
}

function getSearchResults() {
  const query = elements.searchInput.value.trim().toLowerCase();
  if (!query) return [];

  if (searchCache.has(query)) return searchCache.get(query);

  const allSelectedIds = getAllSelectedIds();
  const results = [];
  for (const [name, gpu] of rawGpuMap) {
    if (!name.toLowerCase().includes(query)) continue;
    if (allSelectedIds.has(gpu.id)) continue;
    results.push(gpu);
    if (results.length >= 8) break;
  }

  searchCache.set(query, results);
  return results;
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
        `<button type="button" class="dropdown-item" data-add-id="${gpu.id}" data-gpu-name="${escapeHtmlAttr(gpu.name)}" data-gpu-score="${gpu.score}" data-gpu-rank="${gpu.rank}" data-gpu-brand="${gpu.brand}">` +
        `<span>${gpu.name}</span>` +
        `<span class="dropdown-score">${gpu.score.toLocaleString()} pts</span>` +
        "</button>"
    )
    .join("");
}

function renderSelectedTags() {
  if (groups.length === 0) {
    elements.selectedTags.innerHTML = '<div class="empty-selected">No groups yet. Click "+ Group" to add one.</div>';
    return;
  }

  const tabsHtml = groups
    .map(
      (g) =>
        `<div class="group-tab${g.id === activeGroupId ? " active" : ""}" data-group-id="${g.id}">` +
        `<button type="button" class="group-color-swatch" data-swatch-group="${g.id}" style="background:${g.color}" aria-label="Change color"></button>` +
        `<span class="group-tab-label">${escapeHtmlAttr(g.label)}</span>` +
        `<button type="button" class="group-tab-delete" data-delete-group="${g.id}" aria-label="Delete group">&times;</button>` +
        `</div>`
    )
    .join("");

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  let tagsHtml;
  if (activeGroup && activeGroup.gpus.size > 0) {
    tagsHtml = Array.from(activeGroup.gpus.values())
      .sort((a, b) => b.score - a.score)
      .map(
        (gpu) =>
          `<div class="tag">` +
          `<span class="tag-dot" style="background:${activeGroup.color}"></span>` +
          `<span>${escapeHtmlAttr(gpu.name)}</span>` +
          `<button type="button" class="tag-remove" data-remove-id="${gpu.id}" data-remove-group="${activeGroupId}" aria-label="Remove ${escapeHtmlAttr(gpu.name)}">x</button>` +
          `</div>`
      )
      .join("");
  } else {
    tagsHtml = '<div class="empty-selected">No GPUs in this group. Search above to add.</div>';
  }

  elements.selectedTags.innerHTML =
    `<div class="group-tabs">${tabsHtml}</div>` +
    `<div class="group-gpu-tags">${tagsHtml}</div>`;
}

function renderChart() {
  const nonEmptyGroups = groups.filter((g) => g.gpus.size > 0);

  if (nonEmptyGroups.length === 0) {
    elements.chartContent.innerHTML = '<div class="chart-empty">Add GPUs to groups to compare.</div>';
    return;
  }

  const allGpus = nonEmptyGroups.flatMap((g) => Array.from(g.gpus.values()));
  const maxScore = Math.max(...allGpus.map((gpu) => gpu.score));

  elements.chartContent.innerHTML = nonEmptyGroups
    .map((group) => {
      const sortedGpus = Array.from(group.gpus.values()).sort((a, b) => b.score - a.score);
      const barsHtml = sortedGpus
        .map((gpu) => {
          const percentage = (gpu.score / maxScore) * 100;
          const safeWidth = Math.max(percentage, 2);
          const brandClass = gpu.brand === "NVIDIA" ? "nvidia" : "amd";
          const scoreInside = percentage > 20 ? gpu.score.toLocaleString() : "";
          return (
            `<div class="bar-row">` +
            `<div class="bar-head">` +
            `<span class="bar-name">${escapeHtmlAttr(gpu.name)}</span>` +
            `<span class="bar-score-mobile">${gpu.score.toLocaleString()}</span>` +
            `</div>` +
            `<div class="bar-track-wrap">` +
            `<div class="bar-track">` +
            `<div class="bar-fill" style="width:${safeWidth}%;background:linear-gradient(90deg,${group.color}cc,${group.color})">${scoreInside}</div>` +
            `</div>` +
            `<span class="bar-score-desktop">${gpu.score.toLocaleString()}</span>` +
            `</div>` +
            `</div>`
          );
        })
        .join("");
      return (
        `<div class="chart-group">` +
        `<div class="chart-group-label">${escapeHtmlAttr(group.label)}</div>` +
        barsHtml +
        `</div>`
      );
    })
    .join("");
}

function renderHeader() {
  const totalGpus = groups.reduce((sum, g) => sum + g.gpus.size, 0);
  elements.comparingCount.textContent = `${groups.length} group${groups.length !== 1 ? "s" : ""}, ${totalGpus} GPU${totalGpus !== 1 ? "s" : ""}`;
  const activeGroup = groups.find((g) => g.id === activeGroupId);
  elements.clearAllBtn.disabled = !activeGroup || activeGroup.gpus.size === 0;
}

function renderAll() {
  saveSelection();
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
  const activeGroup = groups.find((g) => g.id === activeGroupId);
  if (activeGroup) {
    activeGroup.gpus.clear();
    searchCache = new Map();
  }
  renderAll();
});

elements.addGroupBtn.addEventListener("click", () => {
  const label = prompt("Group name:", `Group ${groups.length + 1}`);
  if (!label || !label.trim()) return;
  const id = `group-${Date.now()}`;
  const color = SWATCH_PALETTE[groups.length % SWATCH_PALETTE.length];
  groups.push({ id, label: label.trim(), color, gpus: new Map() });
  activeGroupId = id;
  renderAll();
});

elements.searchDropdown.addEventListener("click", (event) => {
  const target = event.target.closest("[data-add-id]");
  if (!target || !activeGroupId) return;

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  if (!activeGroup) return;

  const id = target.getAttribute("data-add-id");
  const name = target.getAttribute("data-gpu-name") || "";
  const score = Number(target.getAttribute("data-gpu-score"));
  const rank = Number(target.getAttribute("data-gpu-rank"));
  const brand = target.getAttribute("data-gpu-brand") || detectBrand(name);

  if (name && Number.isFinite(score)) {
    activeGroup.gpus.set(id, {
      id,
      name,
      score,
      rank: Number.isFinite(rank) ? rank : null,
      brand
    });
  }

  searchCache = new Map();
  elements.searchInput.value = "";
  showDropdown = false;
  renderAll();
});

elements.selectedTags.addEventListener("click", (event) => {
  // Change group color — open popover
  const swatchBtn = event.target.closest(".group-color-swatch");
  if (swatchBtn) {
    const groupId = swatchBtn.getAttribute("data-swatch-group");
    openColorPopover(swatchBtn, groupId);
    return;
  }

  // Switch active group
  const tab = event.target.closest(".group-tab");
  if (tab && !event.target.closest(".group-tab-delete")) {
    activeGroupId = tab.getAttribute("data-group-id");
    renderAll();
    return;
  }

  // Delete a group
  const deleteBtn = event.target.closest("[data-delete-group]");
  if (deleteBtn) {
    const groupId = deleteBtn.getAttribute("data-delete-group");
    groups = groups.filter((g) => g.id !== groupId);
    if (activeGroupId === groupId) {
      activeGroupId = groups.length > 0 ? groups[0].id : null;
    }
    searchCache = new Map();
    renderAll();
    return;
  }

  // Remove a GPU from its group
  const removeBtn = event.target.closest("[data-remove-id]");
  if (removeBtn) {
    const gpuId = removeBtn.getAttribute("data-remove-id");
    const groupId = removeBtn.getAttribute("data-remove-group");
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      group.gpus.delete(gpuId);
      searchCache = new Map();
    }
    renderAll();
  }
});

document.addEventListener("click", (event) => {
  if (!elements.searchWrap.contains(event.target)) {
    showDropdown = false;
    renderSearchDropdown();
  }
  if (
    !elements.colorPopover.contains(event.target) &&
    !event.target.closest(".group-color-swatch")
  ) {
    closeColorPopover();
  }
});

function openColorPopover(anchor, groupId) {
  colorPopoverTargetGroupId = groupId;
  const group = groups.find((g) => g.id === groupId);

  elements.colorPopoverSwatches.innerHTML = SWATCH_PALETTE
    .map(
      (c) =>
        `<button type="button" class="cp-swatch${group && group.color === c ? " selected" : ""}" data-pick-color="${c}" style="background:${c}" aria-label="${c}"></button>`
    )
    .join("");

  elements.colorPopoverInput.value = group ? group.color : "#ffffff";

  // Position near the anchor
  const rect = anchor.getBoundingClientRect();
  const popover = elements.colorPopover;
  popover.classList.remove("hidden");
  const popoverWidth = popover.offsetWidth || 200;
  const left = Math.min(rect.left + window.scrollX, window.innerWidth - popoverWidth - 8);
  popover.style.left = `${Math.max(8, left)}px`;
  popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
}

function closeColorPopover() {
  elements.colorPopover.classList.add("hidden");
  colorPopoverTargetGroupId = null;
}

function applyColorToGroup(color) {
  if (!colorPopoverTargetGroupId) return;
  const group = groups.find((g) => g.id === colorPopoverTargetGroupId);
  if (group) {
    group.color = color;
    renderAll();
  }
}

elements.colorPopover.addEventListener("click", (event) => {
  const swatch = event.target.closest("[data-pick-color]");
  if (swatch) {
    applyColorToGroup(swatch.getAttribute("data-pick-color"));
    closeColorPopover();
  }
});

elements.colorPopoverInput.addEventListener("input", (event) => {
  applyColorToGroup(event.target.value);
});

elements.colorPopoverInput.addEventListener("change", () => {
  closeColorPopover();
});

elements.chartContent.addEventListener("mousemove", (event) => {
  const fill = event.target.closest(".bar-fill");
  if (!fill) {
    elements.chartRuler.classList.add("hidden");
    return;
  }
  const fillRect = fill.getBoundingClientRect();
  const cardRect = elements.chartContent.closest(".chart-card").getBoundingClientRect();
  elements.chartRuler.style.left = `${fillRect.right - cardRect.left}px`;
  elements.chartRuler.classList.remove("hidden");
});

elements.chartContent.addEventListener("mouseleave", () => {
  elements.chartRuler.classList.add("hidden");
});

renderAll();

loadGpuDatabaseOnFirstLoad()
  .then(() => {
    renderAll();
  })
  .catch((_error) => {
    renderAll();
  });