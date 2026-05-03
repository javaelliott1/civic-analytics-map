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

## Data pipeline

`scripts/build-web-data.mjs` creates:

- `web/data/tracts.geojson`
- `web/data/public_spaces.geojson`
- `web/data/tract_space_access.csv`
- `web/data/tract_summaries.json`

The walking access data comes from `data/ps_and_centroids.csv`.
