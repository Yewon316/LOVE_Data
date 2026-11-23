import numpy as np, pandas as pd, json, glob, os
o=np.load("cube_obs.npz"); obs=o["cube"]; tot=o["tot"]; ath=o["ath"]
cs=[];S=0;s1=0;s2=0
for f in sorted(glob.glob("cube_null_*.npz")):
    z=np.load(f); cs.append(z["cubes"]); s1=s1+z["s1"]; s2=s2+z["s2"]; S+=int(z["ns"])
C=np.concatenate(cs); print("shuffles",S,C.shape)
mu=np.nanmean(C,0); sd=np.nanstd(C,0,ddof=1)
eff=obs-mu
p=(1+(np.abs(C-mu)>=np.abs(obs-mu)[None]).sum(0))/(S+1)
r=lambda v,d=2: None if not np.isfinite(v) else round(float(v),d)
cube=[]
for ki in range(3):
  A=[]
  for t in range(5):
    B=[]
    for s in range(22):
      D=[]
      for q in range(3):
        nH,hH,nM,hM=tot[ki,:,t,s,q]
        D.append({"e":r(eff[ki,t,s,q]*100),"lo":r((eff[ki,t,s,q]-1.96*sd[ki,t,s,q])*100),"hi":r((eff[ki,t,s,q]+1.96*sd[ki,t,s,q])*100),
                  "p":r(p[ki,t,s,q],4),"o":r(obs[ki,t,s,q]*100),"nH":int(nH),"nM":int(nM),
                  "pH":r(hH/nH,4) if nH else None,"pM":r(hM/nM,4) if nM else None})
      B.append(D)
    A.append(B)
  cube.append(A)
# players
d=pd.read_parquet("shots_x.parquet",columns=["ath","team","typ","season"])
g=d.assign(ft=d.typ==0).groupby("ath")
info=pd.DataFrame({"nFT":g.ft.sum(),"nFG":g.size()-g.ft.sum(),"s0":g.season.min(),"s1":g.season.max()})
tm=d.groupby(["ath","team"]).size().reset_index(name="n").sort_values("n").drop_duplicates("ath",keep="last").set_index("ath").team
info["team"]=tm
names=pd.read_parquet("names.parquet").set_index("ath").name
teams=pd.read_parquet("teams.parquet").set_index("team")
pmu=s1/S; psd=np.sqrt(np.maximum(s2/S-pmu**2,0))
pdif=o["pdif"]; pw=o["pw"]
players=[]; band={}
for j,key in ((0,"ft"),(1,"fg")):
    m=(pw[j]>=4)&(psd[j]>0)
    band[key]=float(np.median(psd[j][m]*np.sqrt(pw[j][m]))*100)
    print(key,"players",m.sum(),"band c",band[key], "outside", (np.abs(pdif[j][m]-pmu[j][m])>1.96*psd[j][m]).mean())
recs={}
for j,key in ((0,"ft"),(1,"fg")):
    for i in np.where((pw[j]>=4)&(psd[j]>0))[0]:
        a=int(ath[i]); rr=recs.setdefault(a,{})
        rr[key]=[round(float((pdif[j][i]-pmu[j][i])*100),2),round(float(psd[j][i]*100),2),round(float(pw[j][i]),1)]
out=[]
for a,v in recs.items():
    if a not in info.index: continue
    it=info.loc[a]
    out.append({"id":a,"n":names.get(a,"Player "+str(a)),"t":int(it.team) if pd.notna(it.team) else None,
                "s":[int(it.s0),int(it.s1)],"c":[int(it.nFT),int(it.nFG)],**v})
used={x["t"] for x in out if x["t"] is not None}
tlist={int(k):str(teams.loc[k,"name"]) for k in used if k in teams.index}
res={"meta":{"shuffles":S,"seasons":list(range(2006,2027)),"types":["Free throws","All field goals","Three-pointers","Mid-range jumpers","Layups, dunks, tips"],
     "sits":["Blowouts","Close games","All games"],"band":band,"purdue":2509},"cube":cube,"teams":tlist,"players":out}
outd=os.path.expanduser("~/mnt/untitled folder/hothand_site/public/data"); 
json.dump(res,open(f"{outd}/explore.json","w"),separators=(",",":"))
print("players out",len(out),"teams",len(tlist),"bytes",os.path.getsize(f"{outd}/explore.json"))
pu=[x for x in out if x["t"]==2509]; print("purdue players",len(pu)); print(sorted(pu,key=lambda x:-x["c"][1])[:5])
print("check FT all",cube[2][0][21][2],"FG all",cube[2][1][21][2])
