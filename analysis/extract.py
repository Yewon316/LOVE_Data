# Step 0: keep only shooting plays (reads play_by_play.parquet row group by row group to save memory)
import pyarrow.parquet as pq, pyarrow as pa, pyarrow.compute as pc
f=pq.ParquetFile("play_by_play.parquet")
cols=["game_id","game_play_number","sequence_number","season","season_type","athlete_id_1","team_id","type_text","text","scoring_play","score_value","points_attempted","coordinate_x","coordinate_y","period_number","start_game_seconds_remaining","home_score","away_score","home_team_id","away_team_id","game_date"]
out=[]
for i in range(f.metadata.num_row_groups):
    t=f.read_row_group(i,columns=cols+["shooting_play"])
    out.append(t.filter(pc.equal(t["shooting_play"],True)).drop(["shooting_play"]))
pq.write_table(pa.concat_tables(out),"shots_raw.parquet",compression="zstd")
