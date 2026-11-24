import pyarrow.parquet as pq, pyarrow.compute as pc, pandas as pd, numpy as np
t=pq.read_table("../shots_raw.parquet",columns=["text","type_text","score_value","scoring_play","season","period_number","athlete_id_1"]).to_pandas()
low=t.text.fillna("").str.lower(); tt=t.type_text.fillna("").str.lower()
made=low.str.contains(" made | makes ",regex=True); miss=low.str.contains(" missed | misses ",regex=True)
ft=low.str.contains("free throw")|tt.str.contains("freethrow|free throw",regex=True)
three=low.str.contains("three")|tt.str.contains("three")
print("A. rows",len(t),"| neither made nor missed:",int((~made&~miss).sum()), "| both:",int((made&miss).sum()))
x=t[~made&~miss]; print("   sample excluded texts:"); print(x.text.fillna("<none>").str.slice(0,60).value_counts().head(8).to_string())
print("B. made vs scoring_play disagreement:", int(((made)!=(t.scoring_play==True))[made|miss].sum()))
mm=made&~ft
print("C. made FG with score_value 3 but not tagged three:", int((mm&(t.score_value==3)&~three).sum()), "| tagged three but score_value 2:", int((mm&three&(t.score_value==2)).sum()))
print("   made FT with score_value!=1:", int((made&ft&(t.score_value!=1)).sum()), "| made non-FT with score_value 1:", int((mm&(t.score_value==1)).sum()))
p=t.groupby("season").period_number.max(); q=t[t.period_number<=6].groupby("season").period_number.agg(lambda s:(s==3).mean().round(3))
print("D. share of shots in period 3 by season (halves era should be ~0 or OT only):"); print(pd.DataFrame({"max_period":p,"share_p3":q}).T.to_string())
