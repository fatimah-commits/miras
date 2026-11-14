# Synthetic camera motion over a REAL breadboard photo -> frames + ground-truth homographies.
import json, math, sys, numpy as np
from PIL import Image, ImageEnhance, ImageDraw, ImageFilter
src=sys.argv[1]; out=sys.argv[2]
im=Image.open(src).convert('RGB'); W,H=im.size
def Hmat(t):
    # smooth path: rotation, scale, translation, slight perspective
    a=math.radians(6*math.sin(t*0.9)); s=1+0.08*math.sin(t*0.6); tx=50*math.sin(t*0.7); ty=30*math.sin(t*1.1)
    px=0.00006*math.sin(t*0.5); py=0.00004*math.cos(t*0.8)
    cx,cy=W/2,H/2
    T1=np.array([[1,0,-cx],[0,1,-cy],[0,0,1]]); R=np.array([[s*math.cos(a),-s*math.sin(a),0],[s*math.sin(a),s*math.cos(a),0],[px,py,1]]); T2=np.array([[1,0,cx+tx],[0,1,cy+ty],[0,0,1]])
    return T2@R@T1
def warp(img,M):
    Mi=np.linalg.inv(M); Mi=Mi/Mi[2,2]
    return img.transform((W,H),Image.PERSPECTIVE,tuple(Mi.flatten()[:8]),Image.BILINEAR,fillcolor=(120,120,120))
frames=[]
scen=[]
N=150
for i in range(N):
    t=i/15.0
    M=Hmat(t) if i<140 else Hmat(140/15.0)@np.array([[1,0,140],[0,1,60],[0,0,1]])  # sudden jump at 140
    f=warp(im,M)
    tag='motion'
    if 40<=i<70: # lighting sweep
        b=0.6+0.8*abs(math.sin((i-40)/30*math.pi)); f=ImageEnhance.Brightness(f).enhance(b); tag='light'
    if 80<=i<110: # hand-like occluder sweeping over the board
        d=ImageDraw.Draw(f); x=200+(i-80)*28; y=560
        d.ellipse((x-120,y-70,x+120,y+90),fill=(214,160,130)); d.rectangle((x-60,y+40,x+60,y+400),fill=(205,150,120))
        for k in range(4): d.ellipse((x-110+k*55,y-150,x-70+k*55,y-30),fill=(220,168,138))
        f=f.filter(ImageFilter.GaussianBlur(1)); tag='hand'
    if 110<=i<125: tag='after_hand'
    if i>=140: tag='jump'
    f.save(f'{out}/f{i:03d}.jpg',quality=88)
    frames.append({'i':i,'tag':tag,'H':(M/M[2,2]).flatten().tolist()})
json.dump(frames,open(f'{out}/gt.json','w'))
print(N)
