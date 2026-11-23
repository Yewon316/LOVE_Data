import pandas as pd, numpy as np
d=pd.read_parquet("shots_clean.parquet"); s=d[d.typ==0].sort_values(["game","ath","play"]).reset_index(drop=True)
key=s.game.astype(np.int64)*10_000_000+s.ath.astype(np.int64)
rng=np.random.default_rng(1); vals=[]
for r in range(30):
    o=np.lexsort((rng.random(len(s)),key.values))   # random order within each player-game
    t=s.copy(); t["y"]=s.y.values[o]
    g=t.groupby(["game","ath"]).y
    p=[g.shift(k) for k in (1,2,3)]
    ok=p[0].notna()&p[1].notna()&p[2].notna()
    hot=t[ok&(p[0]==1)&(p[1]==1)&(p[2]==1)]; cold=t[ok&(p[0]==0)&(p[1]==0)&(p[2]==0)]
    a=hot.groupby("ath").y.agg(["sum","size"]).join(cold.groupby("ath").y.agg(["sum","size"]),lsuffix="H",rsuffix="M",how="inner")
    diff=a.sumH/a.sizeH-a.sumM/a.sizeM; w=a.sizeH*a.sizeM/(a.sizeH+a.sizeM)
    vals.append((diff*w).sum()/w.sum()*100)
v=np.array(vals); print("FT k3 shuffled mean",round(v.mean(),3),"sd",round(v.std(ddof=1),3),"n",len(v),"-> effect",round(3.553-v.mean(),3))
