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

Commit the repository with the generated `web/data` files and set GitHub Pages
to publish from the repository root. The root `index.html` redirects to
`web/index.html`, and all app assets use relative paths so project pages work.

## Data pipeline

`scripts/build-web-data.mjs` creates:

- `web/data/tracts.geojson`
- `web/data/public_spaces.geojson`
- `web/data/modes.json`
- `web/data/walk_space_access.csv`
- `web/data/walk_tract_summaries.json`
- `web/data/walk_transit_space_access.csv`
- `web/data/walk_transit_tract_summaries.json`

The walking access data comes from `data/ps_and_centroids.csv`.
The transit mode expects `data/transit_ps_and_centroids.csv`, which can be
created from `src/using_transit/export_ps_and_centroids_transit.R` in an R
environment with `r5r`.
