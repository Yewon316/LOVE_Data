# Example shots for the "Test your gut" game: taken right after 3 makes or 3 misses in a row,
# same streak rules as the dashboard (per game, FT and FG counted separately, putbacks skipped),
# score margin shown is the margin BEFORE the shot.
import numpy as np, pandas as pd, json, os
B=np.load("dash_base.npz",allow_pickle=True)
d=pd.read_parquet("shots_d.parquet",columns=["game","play","season","ath","y","typ","period","home","team","sv","hs","as_"])
d["ft"]=(d.typ==0).astype(np.int8)
d=d.sort_values(["game","ath","ft","play"],kind="stable").reset_index(drop=True)
assert (d.y.values==B["y"]).all()
seq=B["seq"]; y=d.y.values; pb=B["putback"]
ok=np.ones(len(d),bool); prev=[]
for k in (1,2,3):
    p=np.r_[np.full(k,-1),y[:-k]]; s=np.r_[np.zeros(k,bool),seq[k:]==seq[:-k]]; ok&=s; prev.append(p)
hot=ok&~pb&(prev[0]==1)&(prev[1]==1)&(prev[2]==1); cold=ok&~pb&(prev[0]==0)&(prev[1]==0)&(prev[2]==0)
diff=(d.hs-d.as_).astype(float); sign=np.where(d.team==d.home,1,-1)
d["before"]=np.abs(diff-np.where(d.y==1,d.sv.fillna(0)*sign,0)).astype(int)
cnt=d.groupby(["ath","ft"]).y.agg(["mean","size"])
d=d.join(cnt,on=["ath","ft"])
rng=np.random.default_rng(11); out=[]
for kind,ftv,n in (("ft",1,150),("fg",0,250)):
    for tag,mask in (("hot",hot),("cold",cold)):
        c=d[mask&(d.ft.values==ftv)&(d["size"].values>=150)&(d.season.values>=2020)]
        c=c.iloc[rng.choice(len(c),n,replace=False)]
        for r in c.itertuples():
            out.append({"kind":kind,"streak":tag,"made":int(r.y),"base":round(float(r.mean),3),"typ":int(r.typ),"period":int(r.period),"margin":int(r.before),"season":int(r.season)})
rng.shuffle(out)
p=os.path.expanduser("~/mnt/untitled folder/hothand_site/public/data/situations.json")
json.dump(out,open(p,"w"),separators=(",",":"))
o=pd.DataFrame(out); print(len(o)); print(o.groupby(["kind","streak"]).made.agg(["size","mean"]).round(3))
