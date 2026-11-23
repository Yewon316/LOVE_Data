import sys, time, numpy as np, pandas as pd
CH=int(sys.argv[1]); NS=int(sys.argv[2])
d=pd.read_parquet("shots_x.parquet",columns=["game","play","season","ath","y","typ","secs"])
d["ft"]=(d.typ==0).astype(np.int8)
d=d.sort_values(["game","ath","ft","play"],kind="stable").reset_index(drop=True)
n=len(d)
seqraw=(d.game.values.astype(np.int64)*10_000_000+d.ath.values.astype(np.int64))*2+d.ft.values
seq=np.unique(seqraw,return_inverse=True)[1]
# putback exclusion for FG targets
secs=d.secs.values.astype(float); gap=np.r_[np.nan,secs[:-1]-secs[1:]]
same1=np.r_[False,seq[1:]==seq[:-1]]
elig=~((d.ft.values==0)&same1&np.isfinite(gap)&(gap<=6))
valid={k:np.r_[np.zeros(k,bool),seq[k:]==seq[:-k]]&elig for k in (1,2,3)}
# final margin per game: margin at last shot (by play number)
dm=pd.read_parquet("shots_x.parquet",columns=["game","play","margin"])
fm=dm.loc[dm.groupby("game").play.idxmax()].set_index("game").margin
close=(d.game.map(fm).values<=5).astype(np.int64); del dm
si=(d.season.values-2006).astype(np.int64)
typ=d.typ.values.astype(np.int64)
cell=typ*42+si*2+close
pid=np.unique(d.ath.values,return_inverse=True)[1].astype(np.int64); P=int(pid.max())+1
idx=pid*168+cell
y0=d.y.values.astype(np.int8)
strat=np.unique(seq.astype(np.int64)*4+typ,return_inverse=True)[1]
p0=np.argsort(strat,kind="stable")
def grp(a):  # a: (P,4,21,2) -> (P,5,22,3)
    t=np.stack([a[:,0],a[:,1]+a[:,2]+a[:,3],a[:,1],a[:,2],a[:,3]],axis=1)
    t=np.concatenate([t,t.sum(axis=2,keepdims=True)],axis=2)
    return np.concatenate([t,t.sum(axis=3,keepdims=True)],axis=3)
def agg(y,full=False):
    cube=np.full((3,5,22,3),np.nan); pd_=np.zeros((2,P)); pw=np.zeros((2,P)); tot=None
    if full: tot=np.zeros((3,4,5,22,3))
    H=None;M=None
    for ki,k in enumerate((1,2,3)):
        pk=np.zeros(n,np.int8); pk[k:]=y[:-k]
        h=valid[k]&(pk==1); m=valid[k]&(pk==0)
        H=h if H is None else H&h; M=m if M is None else M&m
        L=P*168
        def bc(mask,w=None): return np.bincount(idx[mask],weights=None if w is None else w[mask].astype(np.float32),minlength=L).astype(np.float32).reshape(P,4,21,2)
        nH=grp(bc(H)); hH=grp(bc(H,y)); nM=grp(bc(M)); hM=grp(bc(M,y))
        ok=(nH>0)&(nM>0)
        with np.errstate(all="ignore"):
            diff=np.where(ok,hH/nH-hM/nM,0).astype(np.float32); w=np.where(ok,nH*nM/(nH+nM),0).astype(np.float32)
        sw=w.sum(0)
        with np.errstate(all="ignore"): cube[ki]=np.where(sw>0,(w*diff).sum(0)/sw,np.nan)
        if full: tot[ki]=np.stack([nH.sum(0),hH.sum(0),nM.sum(0),hM.sum(0)])
        if k==3:
            for j in (0,1): pd_[j]=diff[:,j,21,2]; pw[j]=w[:,j,21,2]
        del nH,hH,nM,hM,ok,diff,w
    return cube,pd_,pw,tot
t0=time.time()
if CH==0 and NS==0:
    cube,pdif,pw,tot=agg(y0,True)
    ath=np.unique(d.ath.values)
    np.savez("cube_obs.npz",cube=cube,pdif=pdif,pw=pw,tot=tot,ath=ath)
    print("obs saved",round(time.time()-t0,1)); sys.exit()
rng=np.random.default_rng(1000+CH)
cubes=[]; s1=np.zeros((2,P)); s2=np.zeros((2,P))
for i in range(NS):
    order=np.lexsort((rng.random(n),strat))
    yp=np.empty(n,np.int8); yp[p0]=y0[order]
    c,pdif,pw,_=agg(yp); cubes.append(c); s1+=pdif; s2+=pdif**2
    print(i,round(time.time()-t0,1),flush=True)
np.savez(f"cube_null_{CH}.npz",cubes=np.array(cubes),s1=s1,s2=s2,ns=NS)
print("DONE",flush=True)
