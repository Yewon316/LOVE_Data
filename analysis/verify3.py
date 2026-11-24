# Independent recompute of the "real" side with pandas (different code path from dash.py)
import pandas as pd, numpy as np
d=pd.read_parquet("shots_d.parquet",columns=["game","play","ath","y","typ","secs"])
d["grp"]=np.where(d.typ==0,"FT","FG"); d["t3"]=np.where(d.typ==0,"FT",np.where(d.typ==1,"3PT","2PT"))
d=d.sort_values(["game","ath","grp","play"])
g=d.groupby(["game","ath","grp"],sort=False)
for k in (1,2,3): d[f"p{k}"]=g.y.shift(k)
gap=g.secs.shift(1)-d.secs
d["elig"]=~((d.grp=="FG")&(gap<=6))
d["avg"]=d.groupby(["ath","t3"]).y.transform("mean")
ok=d.elig&d.p1.notna()&d.p2.notna()&d.p3.notna()
H=ok&(d.p1==1)&(d.p2==1)&(d.p3==1); M=ok&(d.p1==0)&(d.p2==0)&(d.p3==0)
def own(mask):
    a=d[mask]; return (a.y.sum()-a.avg.sum())/len(a)*100, len(a)
for lab,sel in (("FT",d.t3=="FT"),("FG",d.grp=="FG"),("3PT",d.t3=="3PT"),("2PT",d.t3=="2PT")):
    h,nh=own(H&sel); m,nm=own(M&sel); print(lab,"own gap %.2f"%(h-m),"nH",nh,"nM",nm)
