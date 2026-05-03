const thresholds = [10, 20, 30];
const typeLabels = {
  misc: "Misc",
  park: "Parks",
  plaza: "Plazas",
  pops: "POPS",
  stp: "Schoolyards",
  wpaa: "Waterfront",
};

const state = {
  accessByTract: new Map(),
  spacesById: new Map(),
  summariesByTract: new Map(),
  selectedTract: null,
  selectedPoint: null,
  activeThreshold: 30,
  activeType: "all",
};

const els = {
  threshold: document.querySelector("#threshold"),
  typeFilter: document.querySelector("#typeFilter"),
  statusText: document.querySelector("#statusText"),
  totalCount: document.querySelector("#totalCount"),
  tractId: document.querySelector("#tractId"),
  typeCounts: document.querySelector("#typeCounts"),
  spaceList: document.querySelector("#spaceList"),
  resultMeta: document.querySelector("#resultMeta"),
};

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
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
  if (!state.selectedTract) return [];
  return (state.accessByTract.get(state.selectedTract) || [])
    .filter((row) => row.min_walk <= state.activeThreshold)
    .filter((row) => state.activeType === "all" || row.type === state.activeType)
    .sort((a, b) => a.min_walk - b.min_walk);
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
  for (const type of types) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = formatType(type);
    els.typeFilter.append(option);
  }
}

function renderPanel() {
  if (!state.selectedTract) {
    els.statusText.textContent =
      "The map will snap your click to a census tract and show nearby public spaces within a 30 minute walk.";
    els.totalCount.textContent = "-";
    els.tractId.textContent = "-";
    els.typeCounts.className = "type-counts empty";
    els.typeCounts.textContent = "Choose a tract to begin.";
    els.spaceList.innerHTML = "";
    els.resultMeta.textContent = "";
    return;
  }

  const rows = rowsForCurrentSelection();
  const summary = state.summariesByTract.get(state.selectedTract);
  const totalForThreshold = summary?.[`total_${state.activeThreshold}`] ?? rows.length;
  const total =
    state.activeType === "all"
      ? totalForThreshold
      : summary?.by_type?.[state.activeType]?.[`total_${state.activeThreshold}`] ?? rows.length;

  els.statusText.textContent = `Showing public spaces near census tract ${state.selectedTract}.`;
  els.totalCount.textContent = total.toLocaleString();
  els.tractId.textContent = state.selectedTract.slice(-6);
  els.resultMeta.textContent = `${rows.length.toLocaleString()} shown`;

  const byType = new Map();
  for (const row of (state.accessByTract.get(state.selectedTract) || []).filter(
    (item) => item.min_walk <= state.activeThreshold,
  )) {
    byType.set(row.type, (byType.get(row.type) || 0) + 1);
  }

  els.typeCounts.className = "type-counts";
  els.typeCounts.innerHTML = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(
      ([type, count]) =>
        `<span class="type-pill"><strong>${count.toLocaleString()}</strong>${escapeHtml(
          formatType(type),
        )}</span>`,
    )
    .join("");

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

function updateMapSources(map) {
  const rows = rowsForCurrentSelection();
  const visibleSpaces = publicSpaceFeatureCollection(rows);
  map.getSource("selected-spaces")?.setData(visibleSpaces);

  const selectedFilter = state.selectedTract
    ? ["==", ["get", "geoid"], state.selectedTract]
    : ["==", ["get", "geoid"], ""];
  if (map.getLayer("selected-tract-fill")) {
    map.setFilter("selected-tract-fill", selectedFilter);
  }
  if (map.getLayer("selected-tract-line")) {
    map.setFilter("selected-tract-line", selectedFilter);
  }
}

function clearSelection(map) {
  state.selectedTract = null;
  state.selectedPoint = null;
  updateMapSources(map);
  renderPanel();
}

function selectTract(map, feature, lngLat) {
  state.selectedTract = feature.properties.geoid;
  state.selectedPoint = [lngLat.lng, lngLat.lat];
  updateMapSources(map);
  renderPanel();
}

async function loadData() {
  const [tracts, spaces, accessCsv, summaries] = await Promise.all([
    fetch("./data/tracts.geojson").then((response) => response.json()),
    fetch("./data/public_spaces.geojson").then((response) => response.json()),
    fetch("./data/tract_space_access.csv").then((response) => response.text()),
    fetch("./data/tract_summaries.json").then((response) => response.json()),
  ]);

  for (const feature of spaces.features) {
    state.spacesById.set(feature.properties.space_id, feature);
  }

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
    if (!state.accessByTract.has(parsed.geoid)) {
      state.accessByTract.set(parsed.geoid, []);
    }
    state.accessByTract.get(parsed.geoid).push(parsed);
  }

  for (const rows of state.accessByTract.values()) {
    rows.sort((a, b) => a.min_walk - b.min_walk);
  }

  for (const summary of summaries) {
    state.summariesByTract.set(summary.geoid, summary);
  }

  renderTypeFilters([...types].sort());
  return { tracts };
}

function initMap(tracts) {
  const map = new maplibregl.Map({
    container: "map",
    center: [-73.94, 40.705],
    zoom: 10.15,
    minZoom: 9,
    maxZoom: 16,
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
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    },
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

  map.on("load", () => {
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
        "fill-color": "#23495f",
        "fill-opacity": 0.06,
      },
    });

    map.addLayer({
      id: "tract-line",
      type: "line",
      source: "tracts",
      paint: {
        "line-color": "#2d5266",
        "line-opacity": 0.34,
        "line-width": 0.45,
      },
    });

    map.addLayer({
      id: "selected-tract-fill",
      type: "fill",
      source: "tracts",
      filter: ["==", ["get", "geoid"], ""],
      paint: {
        "fill-color": "#1f6376",
        "fill-opacity": 0.28,
      },
    });

    map.addLayer({
      id: "selected-tract-line",
      type: "line",
      source: "tracts",
      filter: ["==", ["get", "geoid"], ""],
      paint: {
        "line-color": "#102f3d",
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
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.2,
        "circle-opacity": 0.9,
      },
    });

    map.on("click", (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ["tract-fill"] });
      if (!features.length) {
        clearSelection(map);
        return;
      }
      selectTract(map, features[0], event.lngLat);
    });

    map.on("mousemove", (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ["tract-fill"] });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
    });

    map.on("mouseleave", "tract-fill", () => {
      map.getCanvas().style.cursor = "";
    });
  });

  els.threshold.addEventListener("change", () => {
    state.activeThreshold = Number(els.threshold.value);
    updateMapSources(map);
    renderPanel();
  });

  els.typeFilter.addEventListener("change", () => {
    state.activeType = els.typeFilter.value;
    updateMapSources(map);
    renderPanel();
  });

  return map;
}

loadData()
  .then(({ tracts }) => {
    initMap(tracts);
    renderPanel();
  })
  .catch((error) => {
    console.error(error);
    els.statusText.textContent =
      "The web data did not load. Run `node scripts/build-web-data.mjs` from the project root and refresh.";
  });
