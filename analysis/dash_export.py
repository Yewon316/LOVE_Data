import numpy as np, pandas as pd, json, glob, os
B=np.load("dash_base.npz",allow_pickle=True); O=np.load("dash_obs.npz")
acc=None; S=0
for f in sorted(glob.glob("dash_null_*.npz")):
    z=np.load(f); a=[z[f"arr_{i}"] for i in range(6)]; S+=int(z["ns"]); acc=a if acc is None else [x+y for x,y in zip(acc,a)]
E=[a/S for a in acc]; R=[O[f"arr_{i}"] for i in range(6)]
P=len(B["pid_u"]); T=len(B["tu"])
gN,gM,gA=[r.reshape(T,4,3,2,3,6) for r in R[:3]]; gEN,gEM,gEA=[e.reshape(T,4,3,2,3,6) for e in E[:3]]
def her(types,k):
    sl=lambda a: a[:,:,types].sum(axis=(0,1,2,3,4))   # per state (6)
    n,m,a,en,em,ea=[sl(x) for x in (gN,gM,gA,gEN,gEM,gEA)]
    H=[i for i,s in enumerate([-3,-2,-1,1,2,3]) if s>=k]; M=[i for i,s in enumerate([-3,-2,-1,1,2,3]) if s<=-k]
    f=lambda idx:( (m[idx].sum()-a[idx].sum())/n[idx].sum()*100, (em[idx].sum()-ea[idx].sum())/en[idx].sum()*100, n[idx].sum(), m[idx].sum()/n[idx].sum())
    h=f(H); mm=f(M); raw=h[0]-mm[0]; ch=h[1]-mm[1]
    se=np.sqrt(h[3]*(1-h[3])/h[2]+mm[3]*(1-mm[3])/mm[2])*100
    return round(raw,2),round(ch,2),round(raw-ch,2),round(1.96*se,2),int(h[2]),int(mm[2])
print("shuffles",S)
for lab,ty in (("FT",[0]),("FG",[1,2]),("2PT",[1]),("3PT",[2])):
    for k in (1,2,3): print(lab,k,"raw,chance,effect,±,nH,nM",her(ty,k))

# ---------------- write files ----------------
import shutil
out=os.path.expanduser("~/mnt/untitled folder/hothand_site/public/data/dash")
os.makedirs(out+"/team",exist_ok=True)
for f in glob.glob(out+"/team/*.json"): os.rename(f, f+".old") if False else None
names=pd.read_parquet("names.parquet").set_index("ath").name
teams=pd.read_parquet("teams.parquet").set_index("team").name
tu=B["tu"]; pid_u=B["pid_u"]; cnt=B["cnt"]; mk=B["mk"]
r1=lambda a: np.round(a,1)
# fold small (mostly non-Division I) teams into one "Other" bucket; drop the volume axis
tshots=gN.sum(axis=(1,2,3,4,5))
big=np.where(tshots>=1000)[0]; K=len(big)
newt=np.full(T,K); newt[big]=np.arange(K)
tnames=[str(teams.get(int(tu[t]),f"Team {int(tu[t])}")) for t in big]+["Other teams"]
def fold(a):
    a=a.sum(axis=1)                      # drop volume
    o=np.zeros((K+1,)+a.shape[1:]); np.add.at(o,newt,a); return o
G=[fold(x).ravel() for x in (gN,gM,gA,gEN,gEM,gEA)]
nz=np.where((G[0]>0)|(G[3]>=0.05))[0]
cells={"k":nz.tolist(),"n":G[0][nz].astype(int).tolist(),"m":G[1][nz].astype(int).tolist(),"a":r1(G[2][nz]).tolist(),
       "en":r1(G[3][nz]).tolist(),"em":r1(G[4][nz]).tolist(),"ea":r1(G[5][nz]).tolist()}
ptidx=newt[np.unique(B["pteam"],return_inverse=True)[1]]
tot=cnt.sum(1); keep=np.where(tot>=30)[0]
players=[[int(pid_u[i]),str(names.get(int(pid_u[i]),f"Player {pid_u[i]}")),int(ptidx[i]),int(cnt[i,0]),round(float(mk[i,0]/max(cnt[i,0],1)),3),int(cnt[i,1]),round(float(mk[i,1]/max(cnt[i,1],1)),3)] for i in keep]
pN,pM,pA,pEN,pEM,pEA=[x.reshape(P,3,2,3,6) for x in (R[3],R[4],R[5],E[3],E[4],E[5])]
def pcells(i):
    a=[x[i].ravel() for x in (pN,pM,pA,pEN,pEM,pEA)]
    z=np.where((a[0]>0)|(a[3]>=0.05))[0]
    return [z.tolist(),a[0][z].astype(int).tolist(),a[1][z].astype(int).tolist(),r1(a[2][z]).tolist(),r1(a[3][z]).tolist(),r1(a[4][z]).tolist(),r1(a[5][z]).tolist()]
top=keep[np.argsort(-tot[keep])][:400]
core={"meta":{"shuffles":S,"layout":"key = (((team*3+type)*2+close)*3+half)*6+state","types":["FT","2PT","3PT"],"halves":["1st","2nd","OT"],
      "states":[-3,-2,-1,1,2,3],"purdue":int(newt[np.where(tu==2509)[0][0]])},
      "teams":tnames,"cells":cells,"players":players,"top":{int(pid_u[i]):pcells(i) for i in top}}
json.dump(core,open(out+"/core.json","w"),separators=(",",":"))
y=B["y"]; seq=B["seq"]; date=B["date"]; home=B["home"]; away=B["away"]; team=B["team"]; pid=B["pid"]; ftg=(B["typ3"]==0)
starts=np.r_[0,np.where(seq[1:]!=seq[:-1])[0]+1]; ends=np.r_[starts[1:],len(seq)]
tid_new={int(tu[t]):int(newt[t]) for t in range(T)}
seqs={}
for st,en in zip(starts,ends):
    if en-st<3: continue
    i=int(pid[st])
    if tot[i]<30 or ptidx[i]==K: continue
    opp=int(away[st] if team[st]==home[st] else home[st])
    d=str(date[st])[:10].replace("-","")
    seqs.setdefault(i,[]).append([int(d[2:]),tid_new.get(opp,K),0 if ftg[st] else 1,"".join(map(str,y[st:en].tolist()))])
by_team={}
for i in keep:
    if ptidx[i]<K: by_team.setdefault(int(ptidx[i]),[]).append(int(i))
sizes=[]
for t,ids in by_team.items():
    obj={str(int(pid_u[i])):{"c":pcells(i),"g":sorted(seqs.get(i,[]))} for i in ids}
    p=f"{out}/team/{t}.json"; json.dump(obj,open(p,"w"),separators=(",",":")); sizes.append(os.path.getsize(p))
print("core bytes",os.path.getsize(out+"/core.json"),"cells",len(nz),"players",len(players),"teams kept",K,"team files",len(sizes),"max",max(sizes),"total",sum(sizes))
