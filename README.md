# Is the Hot Hand Real? (Boiler Up, Hammer Data Challenge)

Static site: React + D3 (d3-scale, d3-array). Analysis: Python (see analysis/).

## Deploy (public URL required by the contest)
Option 1 (fastest): drag the `dist/` folder onto https://app.netlify.com/drop
Option 2: push this folder to GitHub, import it in Vercel (framework: Vite, build `npm run build`, output `dist`).

## Run locally
npm install && npm run dev

## Re-run analysis (needs play_by_play.parquet next to the scripts)
python extract.py; python prep.py
python hh.py ft 500 0     # free throws, 500 shuffles
python hh.py fg_np 100 0..3   # field goals, 4 chunks x 100 shuffles
python merge.py ft; python merge.py fg_np
python export.py          # writes results.json + situations.json for the site
