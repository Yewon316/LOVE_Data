import pandas as pd, numpy as np
d=pd.read_parquet("shots_d.parquet",columns=["game","play","season","ath","y","typ","secs","period"])
q=d.season>=2016
reg_end=np.where(q,4,2)
d["ot"]=d.period.values>reg_end
print("OT shots:",int(d.ot.sum()))
print("secs in OT — describe:"); print(d.loc[d.ot,"secs"].describe().round(1).to_string())
print("secs > 2400 rows:", int((d.secs>2400).sum()), "| by period:", d.loc[d.secs>2400,"period"].value_counts().head().to_dict())
# putback exclusion rate, regulation vs OT (same logic as dash.py)
d["ft"]=(d.typ==0)
d=d.sort_values(["game","ath","ft","play"]).reset_index(drop=True)
seq=(d.game.astype("int64")*10_000_000+d.ath.astype("int64"))*2+d.ft
same=np.r_[False,seq.values[1:]==seq.values[:-1]]
gap=np.r_[np.nan,d.secs.values[:-1]-d.secs.values[1:]]
pb=(~d.ft.values)&same&np.isfinite(gap)&(gap<=6)
fg=~d.ft.values
for lab,m in (("regulation",~d.ot.values),("OT",d.ot.values)):
    mm=m&fg&same
    print(f"{lab}: FG with an earlier FG by same player in game: {int(mm.sum())}, excluded as putback: {pb[mm].mean()*100:.1f}%, gap<0: {(gap[mm]<0).mean()*100:.1f}%")
