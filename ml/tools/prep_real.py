import glob,os,random,sys
from PIL import Image, ImageOps
src,out=sys.argv[1],sys.argv[2]; rng=random.Random(0)
def labs(f):
    l=f.replace('/images/','/labels/').rsplit('.',1)[0]+'.txt'
    return [list(map(float,x.split())) for x in open(l) if x.strip()] if os.path.exists(l) else None
def save(im,ls,split,name):
    os.makedirs(f'{out}/images/{split}',exist_ok=True); os.makedirs(f'{out}/labels/{split}',exist_ok=True)
    im.save(f'{out}/images/{split}/{name}.jpg',quality=92)
    open(f'{out}/labels/{split}/{name}.txt','w').write(''.join(f'{int(c)} {x:.6f} {y:.6f} {w:.6f} {h:.6f}\n' for c,x,y,w,h in ls))
def crop(im,ls,box):
    W,H=im.size; x0,y0,x1,y1=box; cw,ch=x1-x0,y1-y0; nl=[]
    for c,x,y,w,h in ls:
        a,b,cc,d=(x-w/2)*W,(y-h/2)*H,(x+w/2)*W,(y+h/2)*H; A,B,C,D=max(a,x0),max(b,y0),min(cc,x1),min(d,y1)
        if C<=A or D<=B or (C-A)*(D-B)<0.4*(cc-a)*(d-b): continue
        nl.append((c,((A+C)/2-x0)/cw,((B+D)/2-y0)/ch,(C-A)/cw,(D-B)/ch))
    return im.crop(box),nl
n={'train':0,'test':0}
for f in sorted(glob.glob(src+'/images/*/*')):
    split_src=f.split('/')[-2]; raw='transformed' not in f; ls=labs(f)
    if ls is None: continue
    if split_src in ('test','val'):
        if not raw: continue           # rectified views of possibly the same scenes: never used
        split='test'
    else: split='train'
    im=ImageOps.exif_transpose(Image.open(f)).convert('RGB'); base=os.path.basename(f).rsplit('.',1)[0][:40]
    if im.width>1600: s=1600/im.width; im=im.resize((1600,round(im.height*s)))
    save(im,ls,split,base); n[split]+=1
    if split=='train' and raw:
        b=[l for l in ls if int(l[0])==0]
        if not b: continue
        _,bx,by,bw,bh=b[0]; W,H=im.size
        for k in range(4):
            z=rng.uniform(1.05,1.6); cw=min(W,bw*W*z); ch=min(H,cw*0.75)
            cx=bx*W+rng.uniform(-0.15,0.15)*cw; cy=by*H+rng.uniform(-0.15,0.15)*ch
            x0=int(min(max(0,cx-cw/2),W-cw)); y0=int(min(max(0,cy-ch/2),H-ch)); r=crop(im,ls,(x0,y0,int(x0+cw),int(y0+ch)))
            if r: save(r[0],r[1],'train',f'{base}_z{k}'); n['train']+=1
print(n)
