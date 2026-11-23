import sys,glob,pickle,json,numpy as np
mode=sys.argv[1]
obs=None;null={}
for f in sorted(glob.glob(f"chunk_{mode}_*.pkl")):
    o,nl=pickle.load(open(f,"rb")); obs=o
    for k,v in nl.items(): null.setdefault(k,[]).extend(v)
out={}
N=len(next(iter(null.values())))
for k,v in obs.items():
    arr=np.array(null[k])
    if k[3] in("nH","nM","pH","pM"): out[str(k)]={"obs":float(v),"null_mean":float(arr.mean())}; continue
    m=arr.mean(); sd=arr.std(ddof=1)
    p=(1+np.sum(np.abs(arr-m)>=abs(v-m)))/(len(arr)+1)
    out[str(k)]={"obs":float(v),"null_mean":float(m),"null_sd":float(sd),"effect":float(v-m),"p":float(p),"ci95":[float(v-m-1.96*sd),float(v-m+1.96*sd)]}
out["_nperm"]=N
json.dump(out,open(f"res_{mode}.json","w"),indent=1)
for k in ["all","k3"]: pass
for kk in (1,2,3):
    np.save(f"null_{mode}_k{kk}.npy",np.array(null[(kk,"all",0,"all")]))
print(mode,"nperm",N)
