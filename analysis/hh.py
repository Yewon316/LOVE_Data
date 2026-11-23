import sys, json, time, numpy as np, pandas as pd
mode=sys.argv[1]      # ft | fg_strat | fg_plain
NPERM=int(sys.argv[2])
CH=int(sys.argv[3]) if len(sys.argv)>3 else 0
rng=np.random.default_rng(20261123+CH)
d=pd.read_parquet("shots_clean.parquet")
d=d[(d.typ==0)] if mode=="ft" else d[(d.typ>0)]
NP=mode=="fg_np"
d=d.sort_values(["game","ath","play"],kind="stable").reset_index(drop=True)
n=len(d); print(mode,n,flush=True)
grp=(d.game.astype(np.int64)*10_000_000+d.ath.astype(np.int64)).values
gid=np.unique(grp,return_inverse=True)[1].astype(np.int64)
pid=np.unique(d.ath.values,return_inverse=True)[1].astype(np.int64); P=pid.max()+1
y0=d.y.values.astype(np.int8)
K=(1,2,3)
valid={k:np.r_[np.zeros(k,bool),gid[k:]==gid[:-k]] for k in K}
if NP:
    secs=d.secs.values.astype(float); prev=np.r_[np.nan,secs[:-1]]; gap=prev-secs
    elig=~(np.isfinite(gap)&(gap<=6))      # drop quick follow-ups (putback-like) as the target shot
    print("excluded share",1-elig.mean(),flush=True)
    for k in K: valid[k]=valid[k]&elig
# subgroup dims
typ=d.typ.values
era=(d.season.values>=2020).astype(np.int64)
fm=d.loc[d.groupby('game').play.idxmax(),['game','margin']].set_index('game').margin
close=(d.game.map(fm).values<=5).astype(np.int64)   # game-level: final margin <=5
dims={"all":(np.zeros(n,np.int64),1,["all"])}
if mode!="ft": dims["type"]=(typ.astype(np.int64)-1,3,["3PT","2PT jumper","inside (layup/dunk/tip)"])
dims["era"]=(era,2,["2006-2019","2020-2026"]); dims["close"]=(close,2,["blowout (final margin>5)","close game (final margin<=5)"])
att=np.bincount(pid,minlength=P); star_thr=np.quantile(att[att>0],0.9); star=(att>=star_thr)
# permutation cells
if mode in("fg_strat","fg_np"): cell=gid*4+typ
else: cell=gid
cellf=cell.astype(np.float64)
def agg(y,ks_dims):
    res={}
    allH=None; allM=None
    for k in K:
        pk=np.zeros(n,np.int8); pk[k:]=y[:-k]
        h=valid[k]&(pk==1); m=valid[k]&(pk==0)
        allH=h if allH is None else (allH&h); allM=m if allM is None else (allM&m)
        H=allH&valid[k]; M=allM&valid[k]
        for dn,(cat,C,names) in dims.items():
            if dn!="all" and k!=3: continue
            idx=pid*C+cat
            nH=np.bincount(idx[H],minlength=P*C).astype(float); hH=np.bincount(idx[H],weights=y[H],minlength=P*C)
            nM=np.bincount(idx[M],minlength=P*C).astype(float); hM=np.bincount(idx[M],weights=y[M],minlength=P*C)
            ok=(nH>0)&(nM>0)
            with np.errstate(all="ignore"):
                diff=np.where(ok,hH/nH-hM/nM,0.0); w=np.where(ok,nH*nM/(nH+nM),0.0)
                pH=np.where(nH>0,hH/nH,np.nan); pM=np.where(nM>0,hM/nM,np.nan)
            diff=diff.reshape(P,C); w=w.reshape(P,C)
            for c in range(C):
                res[(k,dn,c,"all")]=(w[:,c]*diff[:,c]).sum()/max(w[:,c].sum(),1e-12)
                if dn=="all":
                    res[(k,dn,c,"star")]=(w[star,c]*diff[star,c]).sum()/max(w[star,c].sum(),1e-12)
                    res[(k,dn,c,"rest")]=(w[~star,c]*diff[~star,c]).sum()/max(w[~star,c].sum(),1e-12)
                    # raw counts for descriptive rates (pooled over players, equal)
                    res[(k,dn,c,"nH")]=nH.sum(); res[(k,dn,c,"nM")]=nM.sum()
                    res[(k,dn,c,"pH")]=hH.sum()/max(nH.sum(),1); res[(k,dn,c,"pM")]=hM.sum()/max(nM.sum(),1)
    return res
obs=agg(y0,None); print("obs done",flush=True)
null={k:[] for k in obs}
t0=time.time()
for i in range(NPERM):
    key=cellf+rng.random(n)
    order=np.argsort(key,kind="quicksort")
    p0=np.argsort(cellf,kind="stable") if i==0 else p0
    yp=np.empty(n,np.int8); yp[p0]=y0[order]
    r=agg(yp,None)
    for k,v in r.items(): null[k].append(v)
    if i%10==0: print(i,round(time.time()-t0),flush=True)
import pickle
pickle.dump((obs,null),open(f'chunk_{mode}_{CH}.pkl','wb'))
print('DONE',flush=True)
