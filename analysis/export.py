import json, numpy as np, pandas as pd, os
out=os.path.expanduser("~/mnt/untitled folder/hothand_data"); os.makedirs(out,exist_ok=True)
R={m:json.load(open(f"res_{m}.json")) for m in ["ft","fg_np"]}
def g(m,k,dn="all",c=0,s="all"): return R[m][f"({k}, '{dn}', {c}, '{s}')"]
def rec(m,k,dn="all",c=0,s="all"):
    x=g(m,k,dn,c,s); return {"obs":round(x["obs"]*100,3),"null":round(x["null_mean"]*100,3),"effect":round(x["effect"]*100,3),
        "lo":round(x["ci95"][0]*100,3),"hi":round(x["ci95"][1]*100,3),"p":round(x["p"],4)}
res={"meta":{"perm_ft":R["ft"]["_nperm"],"perm_fg":R["fg_np"]["_nperm"]}}
res["streak"]={"ft":{str(k):rec("ft",k) for k in (1,2,3)},"fg":{str(k):rec("fg_np",k) for k in (1,2,3)}}
res["rates"]={}
for m,lab in [("ft","ft"),("fg_np","fg")]:
    res["rates"][lab]={str(k):{"pH":g(m,k,"all",0,"pH")["obs"],"pM":g(m,k,"all",0,"pM")["obs"],"nH":g(m,k,"all",0,"nH")["obs"],"nM":g(m,k,"all",0,"nM")["obs"]} for k in (1,2,3)}
tn=["3PT","2PT jumper","Inside (layup/dunk/tip)"]
res["sub"]={"fg":{"type":{tn[c]:rec("fg_np",3,"type",c) for c in range(3)},
  "era":{["2006-2019","2020-2026"][c]:rec("fg_np",3,"era",c) for c in range(2)},
  "game":{["Blowout (final margin > 5)","Close game (final margin <= 5)"][c]:rec("fg_np",3,"close",c) for c in range(2)},
  "player":{"Top 10% by attempts":rec("fg_np",3,"all",0,"star"),"Other players":rec("fg_np",3,"all",0,"rest")}},
 "ft":{"era":{["2006-2019","2020-2026"][c]:rec("ft",3,"era",c) for c in range(2)},
  "game":{["Blowout (final margin > 5)","Close game (final margin <= 5)"][c]:rec("ft",3,"close",c) for c in range(2)},
  "player":{"Top 10% by attempts":rec("ft",3,"all",0,"star"),"Other players":rec("ft",3,"all",0,"rest")}}}
def hist(m,k,lab):
    a=np.load(f"null_{m}_k{k}.npy")*100; o=g(m,k)["obs"]*100
    lo=min(a.min(),o)-0.0; hi=max(a.max(),o)
    pad=(hi-lo)*0.08; edges=np.linspace(lo-pad,hi+pad,31); c,_=np.histogram(a,bins=edges)
    return {"edges":[round(e,4) for e in edges],"counts":c.tolist(),"obs":round(o,4),"nullMean":round(a.mean(),4),"nullSd":round(a.std(ddof=1),4)}
res["hist"]={"ft":{str(k):hist("ft",k,"ft") for k in (1,2,3)},"fg":{str(k):hist("fg_np",k,"fg") for k in (1,2,3)}}
json.dump(res,open(f"{out}/results.json","w"))
# prediction game situations
d=pd.read_parquet("shots_clean.parquet")
rng=np.random.default_rng(7)
def sit(sub,lab,n_each):
    sub=sub.sort_values(["game","ath","play"],kind="stable").reset_index(drop=True)
    grp=(sub.game.astype(np.int64)*10_000_000+sub.ath.astype(np.int64)).values
    y=sub.y.values
    ok=np.ones(len(sub),bool)
    if lab=='fg':
        sc=sub.secs.values.astype(float); pv=np.r_[np.nan,sc[:-1]]; gp=pv-sc; ok&=~(np.isfinite(gp)&(gp<=6))
    prev=[]
    for j in (1,2,3):
        pj=np.zeros(len(sub),np.int8); pj[j:]=y[:-j]; sj=np.r_[np.zeros(j,bool),grp[j:]==grp[:-j]]; ok&=sj; prev.append(pj)
    H=ok&(prev[0]==1)&(prev[1]==1)&(prev[2]==1); M=ok&(prev[0]==0)&(prev[1]==0)&(prev[2]==0)
    base=sub.groupby("ath").y.agg(["mean","size"]); sub["base"]=sub.ath.map(base["mean"]); sub["bn"]=sub.ath.map(base["size"])
    res_=[]
    for mask,tag in((H,"hot"),(M,"cold")):
        c=sub[mask&(sub.bn>=150).values&(sub.season>=2020).values]
        c=c.iloc[rng.choice(len(c),n_each,replace=False)]
        for r in c.itertuples():
            res_.append({"kind":lab,"streak":tag,"made":int(r.y),"base":round(float(r.base),3),"typ":int(r.typ),"period":int(r.period),"margin":int(r.margin),"season":int(r.season)})
    return res_
sits=sit(d[d.typ==0],"ft",150)+sit(d[d.typ>0],"fg",250)
rng.shuffle(sits)
json.dump(sits,open(f"{out}/situations.json","w"))
print(len(sits),os.listdir(out))
print(pd.DataFrame(sits).groupby(["kind","streak"]).made.agg(["size","mean"]))
