# Independent recheck with plain pandas shift/groupby (different code path from hh.py)
import pandas as pd, numpy as np
d=pd.read_parquet("shots_clean.parquet")
def check(sub, label, putback=False):
    sub=sub.sort_values(["game","ath","play"]).copy()
    g=sub.groupby(["game","ath"]).y
    for k in (1,2,3): sub[f"p{k}"]=g.shift(k)
    if putback:
        gap=sub.groupby(["game","ath"]).secs.shift(1)-sub.secs
        sub=sub[~(gap<=6)]
    s=sub.dropna(subset=["p1","p2","p3"])
    hot=s[(s.p1==1)&(s.p2==1)&(s.p3==1)]; cold=s[(s.p1==0)&(s.p2==0)&(s.p3==0)]
    print(label,"pooled pH",round(hot.y.mean(),4),"pM",round(cold.y.mean(),4),"nH",len(hot),"nM",len(cold))
    a=hot.groupby("ath").y.agg(["sum","size"]).join(cold.groupby("ath").y.agg(["sum","size"]),lsuffix="H",rsuffix="M",how="inner")
    diff=a.sumH/a.sizeH-a.sumM/a.sizeM; w=a.sizeH*a.sizeM/(a.sizeH+a.sizeM)
    print(label,"within-player weighted diff (pp)",round((diff*w).sum()/w.sum()*100,3),"players",len(a))
check(d[d.typ==0],"FT")
check(d[d.typ>0],"FG",putback=True)
