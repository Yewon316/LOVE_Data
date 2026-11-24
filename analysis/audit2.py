import pandas as pd, numpy as np
d=pd.read_parquet("shots_d.parquet",columns=["game","play","season","ath","team","home","away","sv","hs","as_","y","typ","secs","period"])
d=d.sort_values(["game","play"]).reset_index(drop=True)
same=d.game.values[1:]==d.game.values[:-1]
back=(d.secs.values[1:]>d.secs.values[:-1]+1)&same
print("E. clock running backwards between consecutive shots in a game:", int(back.sum()), "of", int(same.sum()), "(%.3f%%)"%(back.sum()/same.sum()*100))
print("   in OT periods:", int((back & (d.period.values[1:]>4)).sum()))
print("   secs range:", d.secs.min(), d.secs.max(), "| negative secs rows:", int((d.secs<0).sum()))
# score margin before the shot
diff=(d.hs-d.as_).astype(float); sign=np.where(d.team==d.home,1,-1)
before=diff-np.where(d.y==1,d.sv.fillna(0)*sign,0)
prev_diff=pd.Series(diff).groupby(d.game).shift(1)
ok=prev_diff.notna()
print("F. margin-before equals previous shot's margin:", "%.1f%%"%((before[ok]==prev_diff[ok]).mean()*100), "(other plays between shots can change it)")
print("   shooter team is neither home nor away:", int(((d.team!=d.home)&(d.team!=d.away)).sum()))
print("   share of shots counted as close (|margin|<=5):", "%.1f%%"%((np.abs(before)<=5).mean()*100))
# same play number twice in a game
print("G. duplicate (game, play) rows:", int(d.duplicated(["game","play"]).sum()))
# a player appearing on both teams in one game
tg=d.groupby(["game","ath"]).team.nunique(); print("H. player on 2 teams in the same game:", int((tg>1).sum()))
