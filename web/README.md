# NYC Public Space Access Map

Static interactive map for exploring how many public spaces are near a clicked
NYC census tract.

## Run locally

From the repository root:

```powershell
node scripts/build-web-data.mjs
node scripts/serve.mjs
```

Then open:

```text
http://localhost:4173
```

The app does not store clicked locations. Clicks stay in the browser and are only
used to select the matching census tract.

## GitHub Pages

Pushes to `main` deploy through `.github/workflows/pages.yml`. In the GitHub
repository settings, set Pages to use **GitHub Actions** as the source. Each push
publishes the committed `web/` directory as the site root.

The root `index.html` still redirects to `web/` for branch-based Pages or local
repository browsing, but the Actions deploy serves `web/index.html` directly at
the Pages URL.

Raw source files in `/data/` are intentionally ignored. The static site still
needs browser-readable files in `web/data/`, so after changing source data,
rebuild locally with `node scripts/build-web-data.mjs` and commit the updated
`web/data` outputs.

## Data pipeline

`scripts/build-web-data.mjs` creates:

- `web/data/tracts.geojson`
- `web/data/public_spaces.geojson`
- `web/data/modes.json`
- `web/data/walk_space_access.csv`
- `web/data/walk_tract_summaries.json`
- `web/data/walk_transit_space_access.csv`
- `web/data/walk_transit_tract_summaries.json`

The walking access data comes from `data/walk-ps-centroids.csv`.
The walking + transit access data comes from `data/walktransit-ps-centroids.csv`.
Both source files use `travel_time_p50`, which is normalized to `min_walk` in
the generated browser CSVs.
