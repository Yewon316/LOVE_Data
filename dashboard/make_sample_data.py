"""
Makes a fake season of play-by-play in the same shape as the real data,
so the dashboard can be built and tested before the real files are ready.
A small hot hand (+3 points after two straight makes) is built in.
Usage: python make_sample_data.py   ->  sample/play_by_play.csv, sample/teams.csv
"""
import os
import numpy as np
import pandas as pd

rng = np.random.default_rng(3)
os.makedirs("sample", exist_ok=True)

N_TEAMS, PER_TEAM, GAMES = 24, 10, 30
confs = ["Conference A", "Conference B", "Conference C"]
teams = pd.DataFrame({
    "team_id": [str(100 + t) for t in range(N_TEAMS)],
    "team_location": [f"Team {t + 1:02d}" for t in range(N_TEAMS)],
    "conference_short_name": [confs[t % 3] for t in range(N_TEAMS)],
})
teams.to_csv("sample/teams.csv", index=False)

players = []
for t in range(N_TEAMS):
    for k in range(PER_TEAM):
        pid = f"{t * PER_TEAM + k + 1:04d}"
        players.append(dict(
            pid=pid, team=str(100 + t),
            vol=rng.choice([1.5, 3, 5, 8, 12], p=[.2, .2, .25, .2, .15]),
            p2=rng.normal(.50, .05), p3=rng.normal(.34, .04), pft=np.clip(rng.normal(.70, .09), .4, .92),
            share3=rng.uniform(.1, .5)))
by_team = {}
for p in players:
    by_team.setdefault(p["team"], []).append(p)

HOT = 0.03
rows, gid = [], 0
team_ids = list(by_team)
for g in range(N_TEAMS * GAMES // 2):
    home, away = rng.choice(team_ids, 2, replace=False)
    gid += 1
    events = []
    for team in (home, away):
        for p in by_team[team]:
            nfg = rng.poisson(p["vol"])
            nft = rng.poisson(p["vol"] * 0.35)
            for _ in range(nfg):
                events.append((rng.uniform(0, 40), p, "3PT" if rng.random() < p["share3"] else "2PT"))
            # free throws come in pairs
            for _ in range(nft // 2 + nft % 2):
                t0 = rng.uniform(0, 40)
                events += [(t0, p, "FT"), (t0 + 0.001, p, "FT")]
    events.sort(key=lambda e: e[0])

    last = {}   # (player, group) -> list of recent results in this game
    score = {home: 0, away: 0}
    for seq, (tm, p, st) in enumerate(events, start=1):
        grp = "FT" if st == "FT" else "FG"
        hist = last.setdefault((p["pid"], grp), [])
        base = {"2PT": p["p2"], "3PT": p["p3"], "FT": p["pft"]}[st]
        prob = base + (HOT if len(hist) >= 2 and hist[-1] and hist[-2] else 0)
        made = rng.random() < prob
        hist.append(made)
        if made:
            score[p["team"]] += {"2PT": 2, "3PT": 3, "FT": 1}[st]
        desc = {"2PT": "Jumper", "3PT": "Three Point Jumper", "FT": "Free Throw"}[st]
        rows.append(dict(
            game_id=str(400000 + gid), sequence_number=seq, athlete_id_1=p["pid"], team_id=p["team"],
            shooting_play=True, scoring_play=made,
            type_text="MadeFreeThrow" if st == "FT" else "JumpShot",
            text=f"Player {p['pid']} {'made' if made else 'missed'} {desc}.",
            period_number=1 if tm < 20 else 2,
            home_score=score[home], away_score=score[away]))

pd.DataFrame(rows).to_csv("sample/play_by_play.csv", index=False)
print(f"{len(rows):,} shots in {gid} games")
