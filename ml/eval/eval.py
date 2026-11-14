"""Evaluate a detector (.onnx or .pt) on a labelled set and write per-class metrics + failure cases.
Run:  python3 ml/eval/eval.py --model lab/miras-parts.onnx --data DS/data.yaml --split test --out OUT
Numbers are only valid for the set they were measured on (synthetic set = synthetic numbers)."""
import argparse, json, os, glob
from ultralytics import YOLO
from PIL import Image, ImageDraw
ap=argparse.ArgumentParser(); ap.add_argument('--model',required=True); ap.add_argument('--data',required=True); ap.add_argument('--split',default='test'); ap.add_argument('--out',required=True); ap.add_argument('--conf',type=float,default=0.6)
a=ap.parse_args(); os.makedirs(a.out,exist_ok=True)
m=YOLO(a.model,task='detect'); r=m.val(data=a.data,split=a.split,imgsz=640,batch=1,device='cpu',plots=False,verbose=False,project=a.out,name='val',exist_ok=True)
names=r.names; res={'model':a.model,'split':a.split,'images':None,'per_class':{},'all':{'precision':float(r.box.mp),'recall':float(r.box.mr),'mAP50':float(r.box.map50),'mAP50_95':float(r.box.map)}}
for i,c in enumerate(r.box.ap_class_index):
    res['per_class'][names[int(c)]]={'precision':float(r.box.p[i]),'recall':float(r.box.r[i]),'mAP50':float(r.box.ap50[i]),'mAP50_95':float(r.box.ap[i])}
# failure cases at the operating threshold used by the safety gate (conf>=0.6, IoU>=0.5)
import yaml
d=yaml.safe_load(open(a.data)); root=d.get('path',os.path.dirname(a.data)); imgs=sorted(glob.glob(os.path.join(root,d[a.split],'*.jpg'))); res['images']=len(imgs)
def iou(p,q):
    x0,y0,x1,y1=max(p[0],q[0]),max(p[1],q[1]),min(p[2],q[2]),min(p[3],q[3]); i=max(0,x1-x0)*max(0,y1-y0); u=(p[2]-p[0])*(p[3]-p[1])+(q[2]-q[0])*(q[3]-q[1])-i; return i/u if u>0 else 0
gate={n:{'gt':0,'found':0,'false':0} for n in names.values()}; fails=[]
for f in imgs:
    W,H=Image.open(f).size; gts=[]
    lf=f.replace('/images/','/labels/').rsplit('.',1)[0]+'.txt'
    for l in open(lf) if os.path.exists(lf) else []:
        c,x,y,w,h=map(float,l.split()); gts.append((int(c),[(x-w/2)*W,(y-h/2)*H,(x+w/2)*W,(y+h/2)*H]))
    pr=m.predict(f,imgsz=640,conf=a.conf,device='cpu',verbose=False)[0]; preds=[(int(c),list(map(float,b))) for c,b in zip(pr.boxes.cls,pr.boxes.xyxy)]
    used=set(); miss=[]; 
    for c,g in gts:
        gate[names[c]]['gt']+=1; k=next((j for j,(pc,pb) in enumerate(preds) if j not in used and pc==c and iou(g,pb)>=0.5),None)
        if k is None: miss.append((c,g))
        else: used.add(k); gate[names[c]]['found']+=1
    fp=[p for j,p in enumerate(preds) if j not in used]
    for c,_ in fp: gate[names[c]]['false']+=1
    if miss or fp: fails.append((len(miss)+len(fp),f,miss,fp))
res['at_conf_%.2f'%a.conf]=gate; res['images_with_any_error']=len(fails)
fails.sort(reverse=True); os.makedirs(os.path.join(a.out,'failures'),exist_ok=True)
for n,f,miss,fp in fails[:12]:
    im=Image.open(f).convert('RGB'); dr=ImageDraw.Draw(im)
    for c,b in miss: dr.rectangle(b,outline=(255,0,0),width=3); dr.text((b[0]+3,b[1]+3),'MISSED '+names[c],fill=(255,0,0))
    for c,b in fp: dr.rectangle(b,outline=(255,160,0),width=3); dr.text((b[0]+3,b[3]-12),'FALSE '+names[c],fill=(255,160,0))
    im.save(os.path.join(a.out,'failures',os.path.basename(f)))
json.dump(res,open(os.path.join(a.out,'metrics.json'),'w'),indent=1); print(json.dumps(res,indent=1))
