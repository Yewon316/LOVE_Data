# Hot Hand Explorer (D3 dashboard)

A one-screen dashboard. Visitors filter the data themselves and every number,
chart and player view updates to match.

## Run it
VS Code -> install Live Server -> right-click index.html -> Open with Live Server
(Double-clicking the file blocks the CSVs from loading.)

The data/ folder currently holds FAKE sample data so the dashboard works right away.

## Use your real data
    python dashboard_data.py play_by_play.csv teams.csv game_box.csv

- The script prints the column names it finds first. If a name doesn't match,
  edit COL / TEAM_COL / BOX_COL at the top of the script and run it again.
- game_box.csv is optional; it only supplies player names.
- It writes data/cells.csv, data/players.csv, data/sequences.csv. Refresh the browser.
- On a full season expect a few minutes (200 shuffles). Lower N_PERM to test faster.

To rebuild the fake data: python make_sample_data.py, then run the command above
on sample/play_by_play.csv and sample/teams.csv.

## What the numbers mean
- Every shot is compared with that player's own average, so good shooters don't skew things.
- "What chance alone gives": the same comparison after shuffling each player's shots
  within each game. Because of the streak selection bias (Miller & Sanjurjo, 2018)
  this is usually below zero, not zero.
- "Hot hand effect" = real gap minus chance gap. "Clear" means it is bigger than
  about two standard errors; otherwise it's marked "Could be noise".
- Each dot in "Every player" uses streaks of 1 (after a make vs. after a miss),
  because longer streaks are too rare for single players.

## Filters
Shot type, streak length, close game (score within 5 before the shot), half,
player volume (top 25% / middle / bottom 40% of field goal attempts),
conference, team, minimum shots per player, and player search.

## Files
- index.html, style.css      layout and design (gold #DDCC77 = make, purple #332288 = miss)
- js/app.js                  loading, filtering, KPI cards, both charts, player detail
- dashboard_data.py          builds data/ from play-by-play
- make_sample_data.py        fake season for testing
