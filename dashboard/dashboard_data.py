"""
Hot Hand dashboard: data export
Usage:  python dashboard_data.py play_by_play.csv teams.csv [game_box.csv]

Writes three CSVs into ./data for the dashboard:
  cells.csv      shot counts by player x shot type x situation x streak,
                 plus what pure chance would give (from shuffling shot order)
  players.csv    one row per player (name, team, conference, volume, percentages)
  sequences.csv  each player's shots game by game ("10110..."), for the detail panel

Column names differ between data sources, so check COL / TEAM_COL / BOX_COL below
against the column list this script prints first.
"""
import sys, os
import numpy as np
import pandas as pd

PBP_PATH = sys.argv[1] if len(sys.argv) > 1 else "play_by_play.csv"
TEAMS_PATH = sys.argv[2] if len(sys.argv) > 2 else "teams.csv"
BOX_PATH = sys.argv[3] if len(sys.argv) > 3 else None

# ---- play_by_play columns ----
COL = {
    "game": "game_id",
    "seq": "sequence_number",
    "player": "athlete_id_1",
    "team": "team_id",
    "shooting": "shooting_play",
    "scoring": "scoring_play",
    "type": "type_text",
    "text": "text",
    "period": "period_number",
    "home_score": "home_score",
    "away_score": "away_score",
}
# ---- teams.csv columns ----
TEAM_COL = {"team": "team_id", "name": "team_location", "conference": "conference_short_name"}
# ---- game_box.csv columns (optional, for player names) ----
BOX_COL = {"player": "athlete_id", "name": "athlete_display_name"}

N_PERM = 200          # shuffles for the chance baseline (200 is plenty for expected counts)
CLOSE_MARGIN = 5      # "close game" = score within this many points when the shot is taken
MIN_SEQ_SHOTS = 5     # games with fewer shots than this are left out of sequences.csv
MIN_PLAYER_SHOTS = 30 # players with fewer shots (FG + FT) are left out, to keep files small
SEED = 7
OUT = "data"
os.makedirs(OUT, exist_ok=True)

# =====================================================================
# 1. Load and check columns
# =====================================================================
head = pd.read_csv(PBP_PATH, nrows=1000)
print("play_by_play columns:", list(head.columns))
missing = [v for v in COL.values() if v not in head.columns]
if missing:
    sys.exit(f"Missing columns {missing}. Edit COL at the top of this script.")

pbp = pd.read_csv(PBP_PATH, usecols=list(COL.values()),
                  dtype={COL["game"]: str, COL["player"]: str, COL["team"]: str})
pbp = pbp.rename(columns={v: k for k, v in COL.items()})

def to_bool(s):
    return s.astype(str).str.strip().str.lower().isin(["true", "1", "t", "yes"])

pbp["shooting"] = to_bool(pbp["shooting"])
pbp["scoring"] = to_bool(pbp["scoring"])

# score margin BEFORE each play = the score on the previous play of the same game
pbp = pbp.sort_values(["game", "seq"])
prev_home = pbp.groupby("game")["home_score"].shift(1).fillna(0)
prev_away = pbp.groupby("game")["away_score"].shift(1).fillna(0)
pbp["margin_before"] = (prev_home - prev_away).abs()

# =====================================================================
# 2. Shots only, with type and situation
# =====================================================================
s = pbp[pbp["shooting"] & pbp["player"].notna()].copy()
txt = s["text"].fillna("").str.lower()
typ = s["type"].fillna("").str.lower()
is_ft = typ.str.contains("free ?throw") | txt.str.contains("free throw")
is_3 = ~is_ft & txt.str.contains("three point")
s["shot_type"] = np.select([is_ft, is_3], ["FT", "3PT"], default="2PT")
s["group"] = np.where(is_ft, "FT", "FG")          # streaks are counted separately for FT and FG
s["made"] = s["scoring"].astype(int)

s["close"] = (s["margin_before"] <= CLOSE_MARGIN).astype(int)
s["half"] = np.where(s["period"] >= 3, "OT", np.where(s["period"] == 1, "1st", "2nd"))

tot = s.groupby("player")["made"].transform("size")
s = s[tot >= MIN_PLAYER_SHOTS]
s = s.sort_values(["game", "player", "group", "seq"]).reset_index(drop=True)
KEYS = ["game", "player", "group"]
gid = s.groupby(KEYS, sort=False).ngroup().values
print(f"{len(s):,} shots, {s['player'].nunique():,} players, {s['game'].nunique():,} games")

# =====================================================================
# 3. Streak tag for each shot: +k = previous k shots all made (3 = 3 or more),
#    -k = previous k all missed. Counted within one game only.
# =====================================================================
def streak_tags(made, gid):
    made = made.astype(np.int8)
    same1 = np.r_[False, gid[1:] == gid[:-1]]
    same2 = np.r_[False, False, gid[2:] == gid[:-2]]
    same3 = np.r_[False, False, False, gid[3:] == gid[:-3]]
    p1 = np.where(same1, np.r_[-1, made[:-1]], -1)
    p2 = np.where(same2, np.r_[-1, -1, made[:-2]], -1)
    p3 = np.where(same3, np.r_[-1, -1, -1, made[:-3]], -1)
    hit = np.where(p1 == 1, 1 + (p2 == 1) + ((p2 == 1) & (p3 == 1)), 0)
    miss = np.where(p1 == 0, 1 + (p2 == 0) + ((p2 == 0) & (p3 == 0)), 0)
    return (hit - miss).astype(np.int8)     # 0 = first shot of the game (no streak)

s["streak"] = streak_tags(s["made"].values, gid)
s["avg"] = s.groupby(["player", "group"])["made"].transform("mean")   # player's own rate

# =====================================================================
# 4. Chance baseline: shuffle each player's shot outcomes within each game,
#    re-tag streaks, and average the counts per cell over N_PERM shuffles.
# =====================================================================
CELL = ["player", "shot_type", "close", "half", "streak"]
rng = np.random.default_rng(SEED)
made_arr = s["made"].values
avg_arr = s["avg"].values
cell_keys = s[["player", "shot_type", "close", "half"]].copy()

acc = None
for i in range(N_PERM):
    order = np.lexsort((rng.random(len(s)), gid))
    shuffled = made_arr[order]                 # positions keep their situation; outcomes move
    tag = streak_tags(shuffled, gid)
    df = cell_keys.assign(streak=tag, made=shuffled, avg=avg_arr)
    agg = df.groupby(CELL).agg(n=("made", "size"), made=("made", "sum"), avg_sum=("avg", "sum"))
    acc = agg if acc is None else acc.add(agg, fill_value=0)
    if (i + 1) % 50 == 0:
        print(f"  shuffle {i + 1}/{N_PERM}")
exp = (acc / N_PERM).rename(columns={"n": "exp_n", "made": "exp_made", "avg_sum": "exp_avg_sum"})

act = s.groupby(CELL).agg(n=("made", "size"), made=("made", "sum"), avg_sum=("avg", "sum"))
cells = act.join(exp, how="outer").fillna(0).reset_index()
cells = cells[cells["streak"] != 0]
for c in ["avg_sum", "exp_n", "exp_made", "exp_avg_sum"]:
    cells[c] = cells[c].round(3)
cells[["n", "made"]] = cells[["n", "made"]].astype(int)

# =====================================================================
# 5. Players: names, team, conference, volume
# =====================================================================
team_of = s.groupby("player")["team"].agg(lambda x: x.mode().iat[0])
teams = pd.read_csv(TEAMS_PATH, dtype={TEAM_COL["team"]: str})
teams = teams.rename(columns={v: k for k, v in TEAM_COL.items()})[["team", "name", "conference"]]

names = None
if BOX_PATH:
    box = pd.read_csv(BOX_PATH, usecols=list(BOX_COL.values()), dtype={BOX_COL["player"]: str})
    names = box.rename(columns={v: k for k, v in BOX_COL.items()}).drop_duplicates("player").set_index("player")["name"]

ps = s.groupby(["player", "group"])["made"].agg(["size", "mean"]).unstack()
players = pd.DataFrame({
    "player": ps.index,
    "fga": ps[("size", "FG")].fillna(0).astype(int).values,
    "fg_pct": ps[("mean", "FG")].round(4).values,
    "fta": ps[("size", "FT")].fillna(0).astype(int).values,
    "ft_pct": ps[("mean", "FT")].round(4).values,
})
players["team"] = players["player"].map(team_of)
players = players.merge(teams.rename(columns={"name": "team_name"}), on="team", how="left")
players["name"] = (players["player"].map(names) if names is not None else None)
players["name"] = players["name"].fillna("Player " + players["player"].astype(str))

# volume tiers by field goal attempts
q75, q40 = players["fga"].quantile(0.75), players["fga"].quantile(0.40)
players["tier"] = np.select([players["fga"] >= q75, players["fga"] >= q40],
                            ["High volume", "Regular"], "Low volume")
players = players[["player", "name", "team", "team_name", "conference", "tier",
                   "fga", "fg_pct", "fta", "ft_pct"]]

# =====================================================================
# 6. Shot sequences for the detail panel
# =====================================================================
seq = (s.groupby(["player", "group", "game"], sort=False)["made"]
         .agg(lambda x: "".join(map(str, x))).reset_index(name="shots"))
seq = seq[seq["shots"].str.len() >= MIN_SEQ_SHOTS]

cells.to_csv(f"{OUT}/cells.csv", index=False)
players.to_csv(f"{OUT}/players.csv", index=False)
seq.to_csv(f"{OUT}/sequences.csv", index=False)
print(f"Wrote {OUT}/cells.csv ({len(cells):,} rows), players.csv ({len(players):,}), sequences.csv ({len(seq):,})")
