# D.I.S.H.A.R.I — Sundarbans smart trip

A trip-first web app for the Indian Sundarbans: one full-screen map, and everything a traveller or local user needs on it.

| Part | What it does |
|---|---|
| **Smart trip** | Plan a journey through many places by boat, on foot or both. The boat keeps to the **safest** wide channels (not the shortcut through creeks and forest). Stays, leaving time, tide for every hop, ghats where you change; live 3D trip (satellite view by default) with GPS tracking; PDF / Word / Excel report, GPX, share link |
| **Touch a block** | Touch the map: the card shows that block in full — people, households, villages, area, forest permit zones, weather and tide, ghats and services — and the exact spot |
| **Show on the map** | Block boundaries (on by default; the line colour changes with the base map), and density maps of **tiger, fish, honey and crab zones** from the D.I.S.H.A.R.I models |
| **POIs** | Every point of interest in priority order (health, emergency, shelters, ghats, transport, markets …) — show on the map, search, filter by block, download as GeoJSON, Shapefile, KML or CSV |
| **Nearby** | Nearest ghats, hospitals, police, cyclone shelters, banks, markets, schools |
| **Dashboard** | Headline numbers, where people live, services, model zones and permit zones for every block, a sortable table, downloads |
| **Assistant** | The tiger 🐯 — ask anything in English, বাংলা or Banglish, typed, spoken or with photos. "Gosaba theke modhu ante jabo, ferar pothe mach o dhorbo" → the models mark the best honey and fish spots, and it plans the boat trip there and back |
| **Saved** | Places, trips and notes kept in your browser |
| **Base maps** | Dark and Light (CARTO), OSM, Esri Streets, Esri Satellite, Esri Topo |

English / বাংলা switch at the top. No login.

## Start it (Windows) — double-click

Double-click **D.I.S.H.A.R.I.bat** (on the Desktop). The first time it installs and builds (a few minutes); after that it opens in a few seconds at http://localhost:3100. Keep the black window open while you use it; close it to stop.

## The AI key (only on the server)

The assistant's AI runs on the small server in this folder (`server.mjs`). Users never type a key.

1. Get a key at https://aistudio.google.com/apikey
2. Open the file `.env` in this folder (copy `.env.example` to `.env` if it is not there) and put:
   ```
   GEMINI_API_KEY=your-key-here
   ```
3. Start again. Without a key the assistant still works with its built-in team (no photo understanding).

Any OpenAI-compatible service also works: `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE`.

## Run by hand

```
npm install
npm run build
npm start
```
Open http://localhost:3100. For development: `npm run dev` (the AI server is not part of dev mode; run `npm start` in a second window and set `NEXT_PUBLIC_AI_URL=http://localhost:3100` if you need it).

## Deploy on Render

Push the folder to GitHub → Render → New → Blueprint → pick the repo (`render.yaml`: a Node web service, build `npm ci && npm run build`, start `node server.mjs`). Then in Render → the service → Environment → add `GEMINI_API_KEY`.

## Data

Villages, towns and blocks: Census of India 2011. Ghats, services and place names: OpenStreetMap. Forest permit zones: Sundarban Tiger Reserve and reserve forest boundaries. Tiger zones: D.I.S.H.A.R.I tiger habitat model; fish, honey and crab zones: D.I.S.H.A.R.I indexes from satellite and river layers. Weather and tides: Open-Meteo (live).
