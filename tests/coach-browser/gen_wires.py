# Paint wire ends (coming from outside the board, the Arduino side) onto the REAL photo at known rail holes.
import json, numpy as np, sys
from PIL import Image, ImageDraw, ImageEnhance
src,out=sys.argv[1],sys.argv[2]
taps=[[1140.5,646],[113,656.4],[118,474.3],[1133.75,466.5]]; cols=63
B=[[0,0],[cols-1,0],[cols-1,11],[0,11]]
A=[];b=[]
for (x,y),(u,v) in zip(B,taps): A+= [[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]]; b+=[u,v]
h=np.linalg.solve(np.array(A,float),np.array(b,float)); H=np.append(h,1).reshape(3,3)
P=lambda x,y:(lambda w:(w[0]/w[2],w[1]/w[2]))(H@np.array([x,y,1.0]))
PLUS,MINUS=-2.85,-3.80
def wire(d,x,ry,color):
    # from below the board (outside) up into the rail hole at column x
    pts=[P(x+1.5,-9),P(x+0.8,-6),P(x,ry-0.9),P(x,ry)]
    d.line(pts,fill=(10,10,10) if color!='black' else (60,60,60),width=13,joint='curve')
    d.line(pts,fill=(205,25,30) if color=='red' else (22,22,24),width=10,joint='curve')
im=Image.open(src).convert('RGB')
sc=[('empty',[],{'red':None,'black':None}),
    ('red_plus',[('red',4,PLUS)],{'red':'+','black':None}),
    ('red_minus',[('red',4,MINUS)],{'red':'-','black':None}),
    ('correct',[('red',4,PLUS),('black',6,MINUS)],{'red':'+','black':'-'}),
    ('short_both_plus',[('red',4,PLUS),('black',6,PLUS)],{'red':'+','black':'+'}),
    ('black_plus_only',[('black',6,PLUS)],{'red':None,'black':'+'}),
    ('correct_dim',[('red',4,PLUS),('black',6,MINUS)],{'red':'+','black':'-'}),
    ('correct_bright',[('red',20,PLUS),('black',22,MINUS)],{'red':'+','black':'-'}),
    ('short_both_minus',[('red',20,MINUS),('black',22,MINUS)],{'red':'-','black':'-'})]
meta=[]
for i,(name,ws,exp) in enumerate(sc):
    f=im.copy(); d=ImageDraw.Draw(f)
    for c,x,ry in ws: wire(d,x,ry,c)
    if name.endswith('dim'): f=ImageEnhance.Brightness(f).enhance(0.6)
    if name.endswith('bright'): f=ImageEnhance.Brightness(f).enhance(1.3)
    f.save(f'{out}/s{i}.jpg',quality=90); meta.append({'i':i,'name':name,'exp':exp})
json.dump(meta,open(f'{out}/meta.json','w')); print(len(meta))
