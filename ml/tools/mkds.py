"""Build train/val lists: real train photos (oversampled) + synthetic renders. Real test photos never enter."""
import glob,os,sys,random
S=sys.argv[1]; out=sys.argv[2]; rep=int(sys.argv[3]) if len(sys.argv)>3 else 3; extra=sys.argv[4:]  # extra real dirs (her photos, train split)
rng=random.Random(0)
syn=sorted(glob.glob(f'{S}/syn/images/train/*.jpg')); rng.shuffle(syn)
sval=syn[:max(20,len(syn)//10)]; strain=syn[len(sval):]
real=sorted(glob.glob(f'{S}/real/images/train/*.jpg'))
for d in extra: real+=sorted(glob.glob(f'{d}/images/train/*.jpg'))
os.makedirs(out,exist_ok=True)
open(f'{out}/train.txt','w').write('\n'.join(strain+real*rep)+'\n'); open(f'{out}/val.txt','w').write('\n'.join(sval)+'\n')
open(f'{out}/data.yaml','w').write(f"path: {out}\ntrain: {out}/train.txt\nval: {out}/val.txt\nnames: {{0: board, 1: led, 2: arduino, 3: resistor, 4: wire}}\n")
print('syn train',len(strain),'syn val',len(sval),'real',len(real),'x',rep)
