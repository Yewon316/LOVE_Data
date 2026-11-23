# Data for the explorer dashboard (Shinyoung's design) from the real shots.
# usage: python dash.py prep            -> dash_base.npz (sorted arrays, indices)
#        python dash.py shuffle CH NS   -> dash_null_CH.npz (summed expected counts)
import sys, time, numpy as np, pandas as pd
mode=sys.argv[1]
if mode=="prep":
    d=pd.read_parquet("shots_d.parquet",columns=["game","play","season","ath","team","home","sv","hs","as_","y","typ","secs","date","away","period"])
    d["ft"]=(d.typ==0).astype(np.int8)
    d=d.sort_values(["game","ath","ft","play"],kind="stable").reset_index(drop=True)
    seqraw=(d.game.values.astype(np.int64)*10_000_000+d.ath.values.astype(np.int64))*2+d.ft.values
    seq=np.unique(seqraw,return_inverse=True)[1].astype(np.int64)
    secs=d.secs.values.astype(float); gap=np.r_[np.nan,secs[:-1]-secs[1:]]
    same1=np.r_[False,seq[1:]==seq[:-1]]
    putback=(d.ft.values==0)&same1&np.isfinite(gap)&(gap<=6)
    # score margin before the shot
    diff=(d.hs-d.as_).values.astype(float)
    sign=np.where(d.team.values==d.home.values,1,-1)
    before=diff-np.where(d.y.values==1,d.sv.fillna(0).values*sign,0)
    close=(np.abs(before)<=5).astype(np.int64)
    typ3=np.where(d.typ.values==0,0,np.where(d.typ.values==1,2,1)).astype(np.int64)   # 0 FT,1 2PT,2 3PT
    pid_u,pid=np.unique(d.ath.values,return_inverse=True)
    grp=d.ft.values==0   # True = FG
    # player own average per group, volume per group
    key=pid*2+grp
    cnt=np.bincount(key,minlength=len(pid_u)*2); mk=np.bincount(key,weights=d.y.values,minlength=len(pid_u)*2)
    avg=(mk/np.maximum(cnt,1))[key]
    vol=np.digitize(cnt[key],[50,200,500]).astype(np.int64)   # 0:<50 1:50-199 2:200-499 3:500+
    # primary team per player
    tp=d.groupby(["ath","team"]).size().reset_index(name="n").sort_values("n").drop_duplicates("ath",keep="last").set_index("ath").team
    pteam=tp.reindex(pid_u).values
    tu,tidx_p=np.unique(pteam,return_inverse=True)
    tidx=tidx_p[pid]
    strat=np.unique(seq*4+d.typ.values.astype(np.int64),return_inverse=True)[1]
    # halves: before 2015-16 games had 2 halves; since then 4 quarters. 0=1st half,1=2nd half,2=OT
    per=d.period.values; q=d.season.values>=2016
    half=np.where(q,np.where(per<=2,0,np.where(per<=4,1,2)),np.where(per<=1,0,np.where(per<=2,1,2))).astype(np.int64)
    np.savez("dash_base.npz",y=d.y.values.astype(np.int8),seq=seq,putback=putback,close=close,typ3=typ3,pid=pid,pid_u=pid_u,
             avg=avg.astype(np.float32),vol=vol,tidx=tidx,tu=tu,pteam=pteam,strat=strat,half=half,cnt=cnt.reshape(-1,2),mk=mk.reshape(-1,2),
             game=d.game.values,date=d.date.values.astype("datetime64[D]").astype(str) if False else d.date.astype(str).values,
             home=d.home.values,away=d.away.values,team=d.team.values,season=d.season.values)
    print("prep done",len(d),"players",len(pid_u),"teams",len(tu)); sys.exit()

B=np.load("dash_base.npz",allow_pickle=True)
y0=B["y"]; seq=B["seq"]; n=len(y0)
elig=~B["putback"]
close=B["close"]; half=B["half"]; typ3=B["typ3"]; pid=B["pid"]; avg=B["avg"].astype(np.float64); vol=B["vol"]; tidx=B["tidx"]; strat=B["strat"]
P=len(B["pid_u"]); T=len(B["tu"])
same={k:np.r_[np.zeros(k,bool),seq[k:]==seq[:-k]] for k in (1,2,3)}
def states(y):
    p=[np.where(same[k],np.r_[np.full(k,-1,np.int8),y[:-k]],-1) for k in (1,2,3)]
    hit=np.where(p[0]==1,1+(p[1]==1)+((p[1]==1)&(p[2]==1)),0)
    mis=np.where(p[0]==0,1+(p[1]==0)+((p[1]==0)&(p[2]==0)),0)
    return (hit-mis).astype(np.int64)
SI=lambda s: np.where(s<0,s+3,s+2)       # -3..-1 -> 0..2 ; 1..3 -> 3..5
GL=T*4*3*2*3*6; PL=P*3*2*3*6
gbase=((((tidx*4+vol)*3+typ3)*2+close)*3+half)*6
pbase=(((pid*3+typ3)*2+close)*3+half)*6
def counts(y):
    s=states(y); m=elig&(s!=0); si=SI(s)
    gi=(gbase+si)[m]; pi=(pbase+si)[m]; yy=y[m].astype(float); aa=avg[m]
    return (np.bincount(gi,minlength=GL),np.bincount(gi,weights=yy,minlength=GL),np.bincount(gi,weights=aa,minlength=GL),
            np.bincount(pi,minlength=PL),np.bincount(pi,weights=yy,minlength=PL),np.bincount(pi,weights=aa,minlength=PL))
if mode=="obs":
    np.savez("dash_obs.npz",*counts(y0)); print("obs ok"); sys.exit()
CH=int(sys.argv[2]); NS=int(sys.argv[3]); rng=np.random.default_rng(500+CH); t0=time.time()
p0=np.argsort(strat,kind="stable"); acc=None
for i in range(NS):
    order=np.lexsort((rng.random(n),strat)); yp=np.empty(n,np.int8); yp[p0]=y0[order]
    c=counts(yp); acc=list(c) if acc is None else [a+b for a,b in zip(acc,c)]
    print(i,round(time.time()-t0,1),flush=True)
np.savez(f"dash_null_{CH}.npz",*acc,ns=NS); print("DONE",flush=True)
