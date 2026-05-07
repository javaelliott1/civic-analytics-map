const typeLabels = {
  misc: "Misc",
  park: "Parks",
  plaza: "Plazas",
  pops: "POPS",
  stp: "Schoolyards",
  wpaa: "Waterfront",
};

const appVersion = "20260503-remove-is145";

const state = {
  modes: new Map(),
  spacesById: new Map(),
  selectedTract: null,
  selectedPoint: null,
  activeMode: "walk",
  activeThreshold: 30,
  activeType: "all",
  map: null,
};

const els = {
  modeFilter: document.querySelector("#modeFilter"),
  threshold: document.querySelector("#threshold"),
  typeFilter: document.querySelector("#typeFilter"),
  statusText: document.querySelector("#statusText"),
  totalCount: document.querySelector("#totalCount"),
  tractId: document.querySelector("#tractId"),
  typeChart: document.querySelector("#typeChart"),
  chartMeta: document.querySelector("#chartMeta"),
  chartEmpty: document.querySelector("#chartEmpty"),
  spaceList: document.querySelector("#spaceList"),
  resultMeta: document.querySelector("#resultMeta"),
  mapNotice: document.querySelector("#mapNotice"),
};

function parseCsv(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function currentMode() {
  return state.modes.get(state.activeMode);
}

function dataUrl(path) {
  if (window.location.protocol === "file:") return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${appVersion}`;
}

function walkBand(minutes) {
  if (minutes <= 10) return 10;
  if (minutes <= 20) return 20;
  return 30;
}

function formatType(type) {
  return typeLabels[type] || type?.toUpperCase() || "Other";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rowsForCurrentSelection() {
  const mode = currentMode();
  if (!state.selectedTract || !mode?.available) return [];
  return (mode.accessByTract.get(state.selectedTract) || [])
    .filter((row) => row.min_walk <= state.activeThreshold)
    .filter((row) => state.activeType === "all" || row.type === state.activeType)
    .sort((a, b) => a.min_walk - b.min_walk);
}

function rowsForChart() {
  const mode = currentMode();
  if (!state.selectedTract || !mode?.available) return [];
  return (mode.accessByTract.get(state.selectedTract) || []).filter(
    (row) => row.min_walk <= state.activeThreshold,
  );
}

function publicSpaceFeatureCollection(rows) {
  return {
    type: "FeatureCollection",
    features: rows
      .map((row) => {
        const source = state.spacesById.get(row.space_id);
        if (!source) return null;
        return {
          ...source,
          properties: {
            ...source.properties,
            min_walk: row.min_walk,
            band: walkBand(row.min_walk),
          },
        };
      })
      .filter(Boolean),
  };
}

function renderTypeFilters(types) {
  const previous = els.typeFilter.value;
  els.typeFilter.innerHTML = '<option value="all">All public spaces</option>';
  for (const type of types) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = formatType(type);
    els.typeFilter.append(option);
  }
  els.typeFilter.value = types.includes(previous) ? previous : "all";
  state.activeType = els.typeFilter.value;
}

function renderModeOptions() {
  els.modeFilter.innerHTML = "";
  for (const mode of state.modes.values()) {
    const option = document.createElement("option");
    option.value = mode.id;
    option.textContent = mode.available ? mode.label : `${mode.label} (data needed)`;
    els.modeFilter.append(option);
  }
  els.modeFilter.value = state.activeMode;
}

function showMapNotice(message) {
  els.mapNotice.textContent = message;
  els.mapNotice.hidden = false;
}

function hideMapNotice() {
  els.mapNotice.hidden = true;
}

function drawTypeChart(rows) {
  const ctx = els.typeChart.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = els.typeChart.getBoundingClientRect();
  els.typeChart.width = Math.max(1, Math.floor(rect.width * dpr));
  els.typeChart.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!rows.length) {
    els.typeChart.hidden = true;
    els.chartEmpty.hidden = false;
    els.chartMeta.textContent = "";
    return;
  }

  els.typeChart.hidden = false;
  els.chartEmpty.hidden = true;

  const counts = new Map();
  for (const row of rows) {
    counts.set(row.type, (counts.get(row.type) || 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, count]) => count));
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  els.chartMeta.textContent = `${total.toLocaleString()} spaces`;

  const paddingLeft = 94;
  const paddingRight = 14;
  const barGap = 10;
  const barHeight = Math.min(26, (rect.height - 18 - barGap * (entries.length - 1)) / entries.length);
  const chartWidth = rect.width - paddingLeft - paddingRight;
  const colors = ["#2f6f9f", "#7b5ea7", "#008b8b", "#c15f9f", "#5d6f84", "#8f6b32"];

  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";

  entries.forEach(([type, count], index) => {
    const y = 12 + index * (barHeight + barGap);
    const width = Math.max(4, (count / max) * chartWidth);
    const percent = Math.round((count / total) * 100);

    ctx.fillStyle = "#526170";
    ctx.textAlign = "right";
    ctx.fillText(formatType(type), paddingLeft - 10, y + barHeight / 2);

    ctx.fillStyle = "rgba(36, 49, 60, 0.08)";
    ctx.fillRect(paddingLeft, y, chartWidth, barHeight);

    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(paddingLeft, y, width, barHeight);

    ctx.fillStyle = "#18202a";
    ctx.textAlign = "left";
    ctx.fillText(`${count.toLocaleString()} (${percent}%)`, paddingLeft + width + 8, y + barHeight / 2);
  });
}

function renderPanel() {
  const mode = currentMode();
  const noSelection =
    "The map will snap your click to a census tract and show nearby public spaces within a 30 minute walk.";

  if (!mode?.available) {
    els.statusText.textContent = `${mode?.label || "This mode"} is wired into the app, but its source data has not been generated yet. Run the transit export script, then rebuild web data.`;
    els.totalCount.textContent = "-";
    els.tractId.textContent = state.selectedTract ? state.selectedTract.slice(-6) : "-";
    drawTypeChart([]);
    els.spaceList.innerHTML =
      '<li class="empty-list">Transit mode needs <code>data/walktransit-ps-centroids.csv</code>.</li>';
    els.resultMeta.textContent = mode?.rows ? `${mode.rows.toLocaleString()} source rows` : "";
    return;
  }

  if (!state.selectedTract) {
    els.statusText.textContent = noSelection;
    els.totalCount.textContent = "-";
    els.tractId.textContent = "-";
    drawTypeChart([]);
    els.chartEmpty.textContent = "Choose a tract to begin.";
    els.spaceList.innerHTML = "";
    els.resultMeta.textContent = `${mode.label} · ${mode.rows.toLocaleString()} source rows`;
    return;
  }

  const rows = rowsForCurrentSelection();
  const chartRows = rowsForChart();
  const summary = mode.summariesByTract.get(state.selectedTract);
  const totalForThreshold = summary?.[`total_${state.activeThreshold}`] ?? chartRows.length;
  const total =
    state.activeType === "all"
      ? totalForThreshold
      : summary?.by_type?.[state.activeType]?.[`total_${state.activeThreshold}`] ?? rows.length;

  els.statusText.textContent = `Showing ${mode.label.toLowerCase()} access near census tract ${state.selectedTract}.`;
  els.totalCount.textContent = total.toLocaleString();
  els.tractId.textContent = state.selectedTract.slice(-6);
  els.resultMeta.textContent = `${mode.label} · ${rows.length.toLocaleString()} shown`;
  drawTypeChart(chartRows);

  if (!rows.length) {
    els.spaceList.innerHTML =
      '<li class="empty-list">No public spaces match this threshold and type filter.</li>';
    return;
  }

  els.spaceList.innerHTML = rows
    .slice(0, 250)
    .map((row) => {
      const space = state.spacesById.get(row.space_id);
      const props = space?.properties || {};
      const band = walkBand(row.min_walk);
      return `<li class="space-card">
        <div class="space-meta">
          <span>${escapeHtml(formatType(row.type))}</span>
          <span class="band band-${band}">${row.min_walk.toFixed(1)} min</span>
        </div>
        <h3>${escapeHtml(props.name || row.space_id)}</h3>
        <p>${escapeHtml(props.location || props.description || "No description available.")}</p>
      </li>`;
    })
    .join("");
}

function updateMapSources() {
  if (!state.map?.getSource("selected-spaces")) return;
  const rows = rowsForCurrentSelection();
  state.map.getSource("selected-spaces").setData(publicSpaceFeatureCollection(rows));

  const selectedFilter = state.selectedTract
    ? ["==", ["get", "geoid"], state.selectedTract]
    : ["==", ["get", "geoid"], ""];
  if (state.map.getLayer("selected-tract-fill")) {
    state.map.setFilter("selected-tract-fill", selectedFilter);
  }
  if (state.map.getLayer("selected-tract-line")) {
    state.map.setFilter("selected-tract-line", selectedFilter);
  }
}

function clearSelection() {
  state.selectedTract = null;
  state.selectedPoint = null;
  updateMapSources();
  renderPanel();
}

function selectTract(feature, lngLat) {
  state.selectedTract = feature.properties.geoid;
  state.selectedPoint = [lngLat.lng, lngLat.lat];
  updateMapSources();
  renderPanel();
}

async function loadMode(modeInfo) {
  const [accessCsv, summaries] = await Promise.all([
    fetch(dataUrl(`./data/${modeInfo.access}`)).then((response) => response.text()),
    fetch(dataUrl(`./data/${modeInfo.summaries}`)).then((response) => response.json()),
  ]);

  const accessByTract = new Map();
  const summariesByTract = new Map();
  const types = new Set();

  for (const row of parseCsv(accessCsv)) {
    const parsed = {
      geoid: row.geoid,
      space_id: row.space_id,
      type: row.type,
      min_walk: Number(row.min_walk),
    };
    if (!Number.isFinite(parsed.min_walk)) continue;
    types.add(parsed.type);
    if (!accessByTract.has(parsed.geoid)) {
      accessByTract.set(parsed.geoid, []);
    }
    accessByTract.get(parsed.geoid).push(parsed);
  }

  for (const rows of accessByTract.values()) {
    rows.sort((a, b) => a.min_walk - b.min_walk);
  }

  for (const summary of summaries) {
    summariesByTract.set(summary.geoid, summary);
  }

  return {
    ...modeInfo,
    accessByTract,
    summariesByTract,
    types: [...types].sort(),
  };
}

async function loadData() {
  const [tracts, spaces, modeManifest] = await Promise.all([
    fetch(dataUrl("./data/tracts.geojson")).then((response) => response.json()),
    fetch(dataUrl("./data/public_spaces.geojson")).then((response) => response.json()),
    fetch(dataUrl("./data/modes.json")).then((response) => response.json()),
  ]);

  for (const feature of spaces.features) {
    state.spacesById.set(feature.properties.space_id, feature);
  }

  const modes = await Promise.all(modeManifest.map(loadMode));
  for (const mode of modes) {
    state.modes.set(mode.id, mode);
  }

  renderModeOptions();
  renderTypeFilters(currentMode()?.types || []);
  return { tracts };
}

function initMap(tracts) {
  const greaterNycBounds = [
    [-74.35, 40.45],
    [-73.62, 40.98],
  ];
  const map = new maplibregl.Map({
    container: "map",
    center: [-73.94, 40.705],
    zoom: 10.15,
    minZoom: 9,
    maxZoom: 16,
    maxBounds: greaterNycBounds,
    renderWorldCopies: false,
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#071017" },
        },
        {
          id: "osm-muted",
          type: "raster",
          source: "osm",
          paint: {
            "raster-brightness-min": 0.03,
            "raster-brightness-max": 0.48,
            "raster-contrast": 0.28,
            "raster-opacity": 0.62,
            "raster-saturation": -0.9,
          },
        },
      ],
    },
  });

  state.map = map;
  map.on("error", (event) => {
    console.warn(event?.error || event);
    showMapNotice(
      "Some map tiles failed to load. The tract layer should still be clickable once the data finishes loading.",
    );
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

  map.on("load", () => {
    hideMapNotice();
    map.addSource("tracts", { type: "geojson", data: tracts });
    map.addSource("selected-spaces", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    map.addLayer({
      id: "tract-fill",
      type: "fill",
      source: "tracts",
      paint: {
        "fill-color": "#243542",
        "fill-opacity": 0.1,
      },
    });

    map.addLayer({
      id: "tract-line",
      type: "line",
      source: "tracts",
      paint: {
        "line-color": "#6f8792",
        "line-opacity": 0.28,
        "line-width": 0.5,
      },
    });

    map.addLayer({
      id: "selected-tract-fill",
      type: "fill",
      source: "tracts",
      filter: ["==", ["get", "geoid"], ""],
      paint: {
        "fill-color": "#67b8c7",
        "fill-opacity": 0.25,
      },
    });

    map.addLayer({
      id: "selected-tract-line",
      type: "line",
      source: "tracts",
      filter: ["==", ["get", "geoid"], ""],
      paint: {
        "line-color": "#d7fbff",
        "line-width": 2,
      },
    });

    map.addLayer({
      id: "selected-spaces",
      type: "circle",
      source: "selected-spaces",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 8],
        "circle-color": [
          "match",
          ["get", "band"],
          10,
          "#d83f31",
          20,
          "#f0a51b",
          30,
          "#4f8a3d",
          "#4f8a3d",
        ],
        "circle-stroke-color": "#071017",
        "circle-stroke-width": 1.4,
        "circle-opacity": 0.95,
      },
    });

    map.on("click", (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ["tract-fill"] });
      if (!features.length) {
        clearSelection();
        return;
      }
      selectTract(features[0], event.lngLat);
    });

    map.on("mousemove", (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ["tract-fill"] });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
    });

    map.on("mouseleave", "tract-fill", () => {
      map.getCanvas().style.cursor = "";
    });
  });

  return map;
}

els.modeFilter.addEventListener("change", () => {
  state.activeMode = els.modeFilter.value;
  renderTypeFilters(currentMode()?.types || []);
  updateMapSources();
  renderPanel();
});

els.threshold.addEventListener("change", () => {
  state.activeThreshold = Number(els.threshold.value);
  updateMapSources();
  renderPanel();
});

els.typeFilter.addEventListener("change", () => {
  state.activeType = els.typeFilter.value;
  updateMapSources();
  renderPanel();
});

window.addEventListener("resize", () => {
  renderPanel();
});

loadData()
  .then(({ tracts }) => {
    initMap(tracts);
    renderPanel();
  })
  .catch((error) => {
    console.error(error);
    showMapNotice(
      "The app data did not load. If this was opened as a file, use GitHub Pages or run a local server so the browser can fetch the data files.",
    );
    els.statusText.textContent =
      "The web data did not load. Run `node scripts/build-web-data.mjs` from the project root and refresh.";
  });
