import numpy as np, glob, json, os
B=np.load("dash_base.npz",allow_pickle=True); O=np.load("dash_obs.npz")
acc=None; S=0
for f in sorted(glob.glob("dash_null_*.npz")):
    z=np.load(f); a=[z[f"arr_{i}"] for i in range(6)]; S+=int(z["ns"]); acc=a if acc is None else [x+y for x,y in zip(acc,a)]
T=len(B["tu"])
R=[O[f"arr_{i}"].reshape(T,4,3,2,3,6) for i in range(3)]; E=[(a/S).reshape(T,4,3,2,3,6) for a in acc[:3]]
st=[-3,-2,-1,1,2,3]
def m(types,k=3,close=None):
    def sl(a):
        a=a[:,:,types]; a=a if close is None else a[:,:,:,[close]]
        return a.sum(axis=(0,1,2,3,4))
    n,mm,a=[sl(x) for x in R]; en,em,ea=[sl(x) for x in E]
    H=[i for i,s in enumerate(st) if s>=k]; M=[i for i,s in enumerate(st) if s<=-k]
    g=lambda I:(n[I].sum(),mm[I].sum(),a[I].sum(),en[I].sum(),em[I].sum(),ea[I].sum())
    h=g(H); q=g(M)
    pH=h[1]/h[0]; pM=q[1]/q[0]
    act=(h[1]-h[2])/h[0]*100-(q[1]-q[2])/q[0]*100
    ch=(h[4]-h[5])/h[3]*100-(q[4]-q[5])/q[3]*100
    se=np.sqrt(pH*(1-pH)/h[0]+pM*(1-pM)/q[0])*100
    r=lambda v,d=2: round(float(v),d)
    return {"pH":r(pH,4),"pM":r(pM,4),"pooled":r((pH-pM)*100),"own":r(act),"chance":r(ch),"effect":r(act-ch),"ci":r(1.96*se),"nH":int(h[0]),"nM":int(q[0])}
H={"shuffles":S,"ft":m([0]),"fg":m([1,2]),"three":m([2]),"two":m([1]),
   "ft_close":m([0],close=1),"fg_close":m([1,2],close=1),"ft_k1":m([0],1),"fg_k1":m([1,2],1)}
p=os.path.expanduser("~/mnt/untitled folder/hothand_site/public/data/dash/headline.json")
json.dump(H,open(p,"w"),indent=1); print(json.dumps(H,indent=0))
