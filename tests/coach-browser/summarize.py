import json,sys
from collections import defaultdict
d=json.load(open(sys.argv[1]));print('setup',d['setupOk'],d['railsB'])
g=defaultdict(list)
for r in d['res']: g[r['tag']].append(r)
for t,L in g.items():
  e=[r['err'] for r in L]; v=defaultdict(int)
  for r in L: v[r['view']]+=1
  print(t,len(L),'err mean %.1f max %.1f'%(sum(e)/len(e),max(e)),dict(v),'ends',L[-1].get('ends'),'recal',any(r['needRecal'] for r in L),'inl',L[-1]['inl'])
