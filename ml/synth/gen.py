"""Miras synthetic scene generator (Blender / bpy). Renders breadboard + Arduino + LED + resistor + jumper wires
with random camera, light, table and circuit case, and writes YOLO boxes plus exact ground truth (tips, holes, case).
Run:  python3 ml/synth/gen.py --out DIR --n 200 --seed 1 --split train|test [--res 640] [--samples 24]
Everything is generated: no photographs are used. Units: millimetres."""
import bpy, sys, os, json, math, random, argparse
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
from PIL import Image, ImageDraw

P = 2.54
ROW_Y = [0,1,2,3,4,7,8,9,10,11]           # same map as coach/board.js
CLASSES = ['board','led','arduino','resistor','wire']   # same order as the deployed model
CASES = ['correct','correct','red_in_minus','short_plus','short_minus','led_reversed','led_across_rails','no_resistor','third_wire','parts_on_table','empty','wires_only']

def hole(col,row): return ((col-1)*P, -ROW_Y[row]*P)
def rail(sign,col,side='top'):
    y = (3.6 if sign=='+' else 2.6)*P if side=='top' else -(11+(2.6 if sign=='+' else 3.6))*P
    return ((col-1)*P, y)

# ---------- materials ----------
def mat(name, rgb, rough=0.5, metal=0.0, emit=0.0, alpha=1.0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    b=m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value=(*rgb,1); b.inputs['Roughness'].default_value=rough; b.inputs['Metallic'].default_value=metal
    if emit: b.inputs['Emission Color'].default_value=(*rgb,1); b.inputs['Emission Strength'].default_value=emit
    if alpha<1: b.inputs['Alpha'].default_value=alpha
    return m
def tex_mat(name, path, rough=0.6):
    m=bpy.data.materials.new(name); m.use_nodes=True; nt=m.node_tree
    t=nt.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(path)
    nt.links.new(t.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    nt.nodes['Principled BSDF'].inputs['Roughness'].default_value=rough
    return m

# ---------- primitives ----------
def box(name, cx,cy,cz, sx,sy,sz, m, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx,cy,cz), rotation=rot); o=bpy.context.object
    o.name=name; o.scale=(sx,sy,sz); o.data.materials.append(m); return o
def cyl(name, p0, p1, r, m, verts=16):
    p0,p1=Vector(p0),Vector(p1); d=p1-p0
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(p0+p1)/2); o=bpy.context.object
    o.name=name; o.rotation_mode='QUATERNION'; o.rotation_quaternion=d.to_track_quat('Z','Y'); o.data.materials.append(m); return o
def tube(name, pts, r, m):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.bevel_depth=r; cu.bevel_resolution=3; cu.resolution_u=10
    s=cu.splines.new('NURBS'); s.points.add(len(pts)-1)
    for p,q in zip(s.points,pts): p.co=(*q,1)
    s.use_endpoint_u=True; s.order_u=min(4,len(pts))
    o=bpy.data.objects.new(name,cu); bpy.context.collection.objects.link(o); o.data.materials.append(m); return o

# ---------- breadboard texture ----------
def board_texture(path, cols, rng, style):
    S=12  # px per mm
    x0,x1=-2.2*P,(cols-1+2.2)*P; y1,y0=5.0*P,-(16.0)*P
    W,H=int((x1-x0)*S),int((y1-y0)*S)
    base=style['base']; im=Image.new('RGB',(W,H),base); d=ImageDraw.Draw(im)
    px=lambda x,y:((x-x0)*S,(y1-y)*S)
    def sq(x,y,h=0.55,c=(28,26,24)):
        a,b=px(x,y); d.rectangle([a-h*S,b-h*S,a+h*S,b+h*S],fill=c)
        d.rectangle([a-h*S*0.55,b-h*S*0.55,a+h*S*0.55,b+h*S*0.55],fill=(8,8,8))
    for c in range(1,cols+1):
        for r in range(10): sq(*hole(c,r))
        if (c-1)%6!=5 and 2<=c<=cols-1:
            for side in ('top','bottom'):
                for s in '+-': sq(*rail(s,c,side))
    # centre channel
    a,b=px(x0,-4.9*P); a2,b2=px(x1,-6.1*P); d.rectangle([a,b,a2,b2],fill=tuple(max(0,v-28) for v in base))
    # rail lines
    for side,sg in (('top',1),('bottom',-1)):
        yp=rail('+',1,side)[1]+ (0.75*P if side=='top' else 0.75*P); ym=rail('-',1,side)[1]-0.75*P
        if side=='bottom': yp=rail('+',1,side)[1]+0.75*P; ym=rail('-',1,side)[1]-0.75*P
        for y,col in ((yp,(200,40,40)),(ym,(40,70,190))):
            a,b=px(0,y); a2,_=px((cols-1)*P,y); d.line([a,b,a2,b],fill=col,width=max(2,int(0.35*S)))
    # column numbers every 5 (tiny grey ticks, not readable text: enough for texture)
    for c in range(5,cols+1,5):
        for y in (0.9*P,-11.9*P):
            a,b=px(hole(c,0)[0],y); d.rectangle([a-3,b-5,a+3,b+5],fill=(120,120,120))
    im.save(path); return (x0,x1,y0,y1)

# ---------- parts ----------
WIRE_COL={'red':(0.75,0.03,0.03),'black':(0.02,0.02,0.02),'yellow':(0.85,0.7,0.05),'green':(0.05,0.5,0.1),'blue':(0.05,0.15,0.7),'white':(0.85,0.85,0.85),'orange':(0.9,0.35,0.02)}
def jumper(name, start, end, colour, rng, M):
    """dupont jumper: housings at both ends, cable between. start/end = (x,y,z of the surface the pin enters)"""
    m=mat(name+'_m',WIRE_COL[colour],rough=0.45); hm=M['housing']
    objs=[]; tops=[]
    for i,(x,y,z) in enumerate((start,end)):
        tx,ty=rng.uniform(-0.18,0.18),rng.uniform(-0.18,0.18); L=13.5
        top=(x+tx*L,y+ty*L,z+L)
        objs.append(cyl(f'{name}_h{i}',(x,y,z+0.3),top,1.3,hm,verts=4)); objs.append(cyl(f'{name}_p{i}',(x,y,z-1),(x,y,z+0.6),0.32,M['metal'],8)); tops.append(top)
    a,b=Vector(tops[0]),Vector(tops[1]); mid=(a+b)/2; n=(b-a).length
    side=Vector((-(b-a).y,(b-a).x,0)); side=side.normalized()*rng.uniform(-0.25,0.25)*n if side.length else side
    pts=[a, a+Vector((0,0,rng.uniform(8,20))), mid+side+Vector((0,0,rng.uniform(15,45))), b+Vector((0,0,rng.uniform(8,20))), b]
    objs.append(tube(name+'_c',[tuple(p) for p in pts],0.8,m)); return objs
def resistor(name, pa, pb, rng, M, z=0.0, lying=False):
    a=Vector((*pa,z)); b=Vector((*pb,z)); h=0.0 if lying else rng.uniform(2.5,5.0); up=Vector((0,0,h+1.2))
    d=(b-a); L=d.length; u=d.normalized(); mid=(a+b)/2+up; bl=min(6.3,L*0.7)
    body=mat(name+'_b',rng.choice([(0.82,0.68,0.45),(0.35,0.6,0.8),(0.8,0.7,0.5)]),rough=0.4)
    objs=[cyl(name+'_body',mid-u*bl/2,mid+u*bl/2,1.15,body)]
    for i,c in enumerate(rng.sample([(0.6,0.05,0.05),(0.3,0.15,0.05),(0.05,0.05,0.05),(0.8,0.6,0.1),(0.9,0.4,0.0)],3)+[(0.75,0.6,0.2)]):
        t=-bl*0.32+i*bl*0.2 if i<3 else bl*0.36
        objs.append(cyl(f'{name}_band{i}',mid+u*(t-0.3),mid+u*(t+0.3),1.2,mat(f'{name}_bm{i}',c,rough=0.4)))
    for i,(p,q) in enumerate(((a,mid-u*bl/2),(b,mid+u*bl/2))):
        objs.append(tube(f'{name}_lead{i}',[tuple(p-Vector((0,0,1.5 if not lying else 0))),tuple(p+up*0.9),tuple(q-u*(1 if i==0 else -1)*0.2*0+Vector((0,0,0))),tuple(q)],0.3,M['metal']))
    return objs
LED_COL={'red':(0.9,0.05,0.05),'blue':(0.1,0.2,0.95),'green':(0.1,0.8,0.15),'yellow':(0.95,0.8,0.1),'white':(0.9,0.9,0.92)}
def led(name, p_long, p_short, colour, rng, M, z=0.0, lying=False):
    a=Vector((*p_long,z)); b=Vector((*p_short,z)); mid=(a+b)/2; h=rng.uniform(3,9)
    m=mat(name+'_m',LED_COL[colour],rough=0.15,emit=rng.choice([0,0,0.3]))
    objs=[]
    if lying:
        u=Vector((rng.uniform(-1,1),rng.uniform(-1,1),0)).normalized(); c=mid+Vector((0,0,2.6))
        objs.append(cyl(name+'_body',c,c+u*6.0,2.5,m,24)); bpy.ops.mesh.primitive_uv_sphere_add(radius=2.5,location=c+u*6.0); s=bpy.context.object; s.data.materials.append(m); objs.append(s)
        for i,off in enumerate((-1.27,1.27)):
            side=Vector((-u.y,u.x,0))*off; objs.append(cyl(f'{name}_leg{i}',c+side,c+side-u*(22 if i==0 else 19),0.25,M['metal'],6))
        return objs
    top=mid+Vector((rng.uniform(-1.5,1.5),rng.uniform(-1.5,1.5),h))
    objs.append(cyl(name+'_flange',top,top+Vector((0,0,1.0)),2.9,m,24)); objs.append(cyl(name+'_body',top+Vector((0,0,1.0)),top+Vector((0,0,6.2)),2.5,m,24))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.5,location=top+Vector((0,0,6.2))); s=bpy.context.object; s.name=name+'_dome'; s.data.materials.append(m); objs.append(s)
    u=(b-a).normalized() if (b-a).length else Vector((1,0,0))
    for i,(p,off) in enumerate(((a,-1.27),(b,1.27))):
        objs.append(tube(f'{name}_leg{i}',[tuple(p-Vector((0,0,1.5))),tuple(p+Vector((0,0,h*0.5))),tuple(top+u*off)],0.25,M['metal']))
    return objs
def arduino(cx,cy,z,rot,rng,M):
    pcb=mat('uno_pcb',rng.choice([(0.0,0.32,0.38),(0.02,0.2,0.45),(0.0,0.4,0.42)]),rough=0.35)
    objs=[box('uno_pcb',0,0,0.8,68.6,53.4,1.6,pcb)]
    objs.append(box('uno_usb',-29,-11,6.5,16,12,11,M['metal'])); objs.append(box('uno_jack',-29,17,6.5,14,9,11,M['housing']))
    objs.append(box('uno_chip',10,8,3.6,35,7.5,4,M['housing'])); objs.append(box('uno_hdrA',8,24.5,5.8,48,2.5,8.5,M['housing'])); objs.append(box('uno_hdrB',14,-24.5,5.8,36,2.5,8.5,M['housing']))
    objs.append(cyl('uno_cap1',(-12,-14,1.6),(-12,-14,9),3.2,M['metal'])); objs.append(box('uno_btn',-31,-23,3.0,6,6,3.5,M['metal']))
    bpy.ops.object.empty_add(location=(cx,cy,z)); e=bpy.context.object; e.rotation_euler=(0,0,rot)
    for o in objs: o.parent=e
    bpy.context.view_layer.update()
    pin=lambda k:(e.matrix_world@Vector((-6+k*2.54,24.5,10.0)))    # power header pins, top of header
    return objs, pin

# ---------- scene ----------
def build(rng, split, texdir, idx):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc=bpy.context.scene; sc.unit_settings.scale_length=0.001
    M={'metal':mat('metal',(0.75,0.75,0.78),rough=0.25,metal=1.0),'housing':mat('housing',(0.015,0.015,0.015),rough=0.5)}
    cols=rng.choice([30,30,63]); style={'base':rng.choice([(238,236,228),(246,246,244),(228,226,214),(250,250,250)] if split=='train' else [(242,240,235),(233,231,224)])}
    tp=os.path.join(texdir,f'board_{idx}.png'); x0,x1,y0,y1=board_texture(tp,cols,rng,style)
    bm=tex_mat('board_m',tp); body=mat('board_side',tuple(v/255 for v in style['base']),rough=0.6)
    board=box('board',(x0+x1)/2,(y0+y1)/2,-4.25,x1-x0,y1-y0,8.5,body); board.data.materials.append(bm)
    # top face -> texture material with planar UV
    me=board.data; uvl=me.uv_layers[0] if me.uv_layers else me.uv_layers.new(name='uv')
    for poly in me.polygons:
        if poly.normal.z>0.9:
            poly.material_index=1
            for li in poly.loop_indices:
                v=me.vertices[me.loops[li].vertex_index].co; uvl.data[li].uv=(v.x+0.5,v.y+0.5)
    gt={'cols':cols,'objects':[],'tips':[]}
    groups={'board':[board]}
    # table
    tcol=[rng.uniform(0.15,0.95)]*3 if rng.random()<0.5 else [rng.uniform(0.3,0.8),rng.uniform(0.2,0.6),rng.uniform(0.1,0.4)]
    if split=='test': tcol=[rng.uniform(0.1,0.5),rng.uniform(0.25,0.6),rng.uniform(0.4,0.85)]     # table colours never used in train
    tm=mat('table',tuple(tcol),rough=rng.uniform(0.3,0.9)); nt=tm.node_tree
    nz=nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value=rng.uniform(0.005,0.08); mix=nt.nodes.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs['Fac'].default_value=rng.uniform(0.1,0.6)
    mix.inputs['Color1'].default_value=(*tcol,1); nt.links.new(nz.outputs['Fac'],mix.inputs['Color2']); nt.links.new(mix.outputs['Color'],nt.nodes['Principled BSDF'].inputs['Base Color'])
    box('table',0,0,-9.5,3000,3000,2,tm)
    case=rng.choice(CASES); gt['case']=case
    bx=(x0+x1)/2; by=(y0+y1)/2
    # arduino (below or beside the board)
    has_uno = case!='empty' or rng.random()<0.6
    pin=None
    if has_uno:
        where=rng.choice(['below','below','below','right','left'])
        if where=='below': ax,ay=rng.uniform(x0+30,x1-30),y0-rng.uniform(38,70)
        else: ax,ay=(x1+rng.uniform(45,75) if where=='right' else x0-rng.uniform(45,75)),by+rng.uniform(-25,25)
        objs,pin=arduino(ax,ay,-8.5,rng.uniform(-0.35,0.35)+(0 if where=='below' else rng.choice([1.57,-1.57])),rng,M); groups['arduino']=objs
    C=rng.randint(6,min(22,cols-6))
    parts = case not in ('empty','wires_only')
    lying = case=='parts_on_table'
    if parts:
        if lying:
            p=(rng.uniform(x0,x1),y1+rng.uniform(15,40)); groups['resistor']=resistor('res',p,(p[0]+10,p[1]+rng.uniform(-3,3)),rng,M,z=-7.4,lying=True)
            q=(rng.uniform(x0,x1),y1+rng.uniform(15,45)); groups['led']=led('led',q,(q[0]+2.5,q[1]),rng.choice(list(LED_COL)),rng,M,z=-8.5,lying=True)
        else:
            if case!='no_resistor':
                ra,rb=rail('+',C if (C-1)%6!=5 else C+1),hole(C,0)
                if case=='led_across_rails': rb=hole(C+rng.choice([-3,3]),0)
                groups['resistor']=resistor('res',ra,rb,rng,M); gt['tips']+= [{'part':'resistor','xyz':[*ra,0],'net':'R+'},{'part':'resistor','xyz':[*rb,0],'net':'T'}]
            sc_=C+3 if (C+2)%6!=5 else C+4
            lo,sh=hole(C,2),rail('-',sc_)
            if case=='led_reversed': lo,sh=sh,lo
            if case=='led_across_rails': lo,sh=rail('+',sc_),rail('-',sc_)
            groups['led']=led('led',lo,sh,rng.choice(list(LED_COL)),rng,M); gt['tips']+=[{'part':'led_long','xyz':[*lo,0]},{'part':'led_short','xyz':[*sh,0]}]
    wires=[]
    if case!='empty' and not lying and pin is not None:
        rr,bb={'red_in_minus':('-','-'),'short_plus':('+','+'),'short_minus':('-','-')}.get(case,('+','-'))
        if case=='red_in_minus': rr,bb='-',None
        okc=[c for c in range(2,min(cols-1,28)) if (c-1)%6!=5 and abs(c-C)>2 and abs(c-C-3)>1]
        for colour,sign,k in (('red',rr,0),('black',bb,2)):
            if sign is None or rng.random()<0.08: continue
            c=rng.choice(okc); e=rail(sign,c); s=pin(k+rng.choice([0,1]))
            col = colour if rng.random()<0.85 else rng.choice(['orange','yellow','green','blue','white'])
            wires.append(jumper(f'w_{colour}',tuple(s),(e[0],e[1],0),col,rng,M)); gt['tips'].append({'part':'wire','role':colour,'colour':col,'xyz':[e[0],e[1],0],'net':'R'+sign})
        if case=='third_wire':
            a=rail('+',rng.choice(okc)); b=rail('-',rng.choice(okc)); col=rng.choice(['yellow','green','blue','white','orange'])
            wires.append(jumper('w_third',(a[0],a[1],0),(b[0],b[1],0),col,rng,M)); gt['tips']+=[{'part':'wire','role':'third','colour':col,'xyz':[a[0],a[1],0],'net':'R+'},{'part':'wire','role':'third','colour':col,'xyz':[b[0],b[1],0],'net':'R-'}]
    # clutter (unlabelled)
    for i in range(rng.choice([0,0,1,2,3])):
        m=mat(f'cl{i}',(rng.random(),rng.random(),rng.random()),rough=rng.uniform(0.2,0.9)); px_,py_=rng.uniform(x0-120,x1+120),rng.choice([y1+rng.uniform(40,120),y0-rng.uniform(90,160)])
        if rng.random()<0.5: cyl(f'pen{i}',(px_,py_,-4.5),(px_+rng.uniform(-120,120),py_+rng.uniform(-30,30),-4.5),4,m)
        else: box(f'bx{i}',px_,py_,-8.5+rng.uniform(2,10),rng.uniform(15,70),rng.uniform(15,60),rng.uniform(4,20),m,rot=(0,0,rng.uniform(0,3.1)))
    # hand-like occluder (unlabelled), sometimes
    if rng.random()<0.15:
        hm=mat('skin',rng.choice([(0.85,0.62,0.48),(0.55,0.36,0.25),(0.95,0.76,0.62),(0.35,0.22,0.15)]),rough=0.6)
        hx,hy=rng.uniform(x0,x1),rng.choice([y1+10,y0-10]); bpy.ops.mesh.primitive_uv_sphere_add(radius=1,location=(hx,hy,25)); h=bpy.context.object; h.scale=(45,rng.uniform(60,90),18); h.rotation_euler=(0,0,rng.uniform(-0.6,0.6)); h.data.materials.append(hm)
    # light
    w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; bg=w.node_tree.nodes['Background']
    warm=rng.uniform(0,1); bg.inputs['Color'].default_value=(1,1-0.25*warm,1-0.5*warm,1); bg.inputs['Strength'].default_value=rng.uniform(0.15,1.0) if split=='train' else rng.uniform(0.08,1.3)
    for i in range(rng.choice([1,1,2])):
        ld=bpy.data.lights.new(f'L{i}','AREA'); ld.energy=rng.uniform(0.6e6,6e6); ld.size=rng.uniform(40,500); ld.color=(1,1-0.2*rng.random(),1-0.4*rng.random())
        lo_=bpy.data.objects.new(f'L{i}',ld); bpy.context.collection.objects.link(lo_); lo_.location=(bx+rng.uniform(-500,500),by+rng.uniform(-500,500),rng.uniform(300,900))
        d=Vector((bx,by,0))-lo_.location; lo_.rotation_mode='QUATERNION'; lo_.rotation_quaternion=d.to_track_quat('-Z','Y')
    # camera on a stand, looking at the working area
    cd=bpy.data.cameras.new('cam'); cam=bpy.data.objects.new('cam',cd); bpy.context.collection.objects.link(cam); sc.camera=cam
    tilt=math.radians(rng.uniform(0,38) if split=='train' else rng.uniform(5,45)); az=rng.uniform(-0.5,0.5)+math.pi*1.5; dist=rng.uniform(110,360)
    tgt=Vector((hole(C,0)[0]+rng.uniform(-25,25),by+rng.uniform(-40,10),0))
    cam.location=tgt+Vector((math.cos(az)*math.sin(tilt)*dist,math.sin(az)*math.sin(tilt)*dist,math.cos(tilt)*dist))
    d=tgt-cam.location; cam.rotation_mode='QUATERNION'; cam.rotation_quaternion=d.to_track_quat('-Z','Y'); cd.lens=rng.uniform(24,34); cd.sensor_width=36; cd.clip_end=5000; cd.clip_start=10
    cd.dof.use_dof=rng.random()<0.4; cd.dof.focus_distance=dist*rng.uniform(0.85,1.2); cd.dof.aperture_fstop=rng.uniform(2.5,8)
    groups['wires']=wires; gt['camera']={'tilt_deg':round(math.degrees(tilt),1),'dist_mm':round(dist),'lens':round(cd.lens,1)}
    return sc,cam,groups,gt

def bbox(sc,cam,objs,res):
    dg=bpy.context.evaluated_depsgraph_get(); xs=[];ys=[]
    for o in objs:
        eo=o.evaluated_get(dg)
        try: me=eo.to_mesh()
        except Exception: continue
        mw=eo.matrix_world
        for v in me.vertices:
            c=world_to_camera_view(sc,cam,mw@v.co)
            if c.z>0: xs.append(c.x); ys.append(1-c.y)
        eo.to_mesh_clear()
    if not xs: return None
    a,b,c,d=min(xs),min(ys),max(xs),max(ys); full=(c-a)*(d-b)
    a,b,c,d=max(0,a),max(0,b),min(1,c),min(1,d)
    if c-a<=0.004 or d-b<=0.004 or (c-a)*(d-b)<0.35*full: return None     # mostly outside the frame
    return [a,b,c,d]

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--out',required=True); ap.add_argument('--n',type=int,default=10); ap.add_argument('--seed',type=int,default=1)
    ap.add_argument('--split',default='train'); ap.add_argument('--res',type=int,default=640); ap.add_argument('--samples',type=int,default=24); ap.add_argument('--start',type=int,default=0)
    a=ap.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else None)
    for sub in ('images','labels','meta','tex'): os.makedirs(os.path.join(a.out,sub,a.split) if sub!='tex' else os.path.join(a.out,sub),exist_ok=True)
    for i in range(a.start,a.start+a.n):
        rng=random.Random(f'{a.split}-{a.seed}-{i}'); name=f'{a.split}_{a.seed}_{i:05d}'
        sc,cam,groups,gt=build(rng,a.split,os.path.join(a.out,'tex'),name)
        sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=a.samples; sc.cycles.use_denoising=True; sc.cycles.max_bounces=4
        sc.render.resolution_x=a.res; sc.render.resolution_y=int(a.res*0.75); sc.render.image_settings.file_format='JPEG'; sc.render.image_settings.quality=rng.randint(70,95)
        sc.view_settings.view_transform='Standard'; sc.view_settings.exposure=rng.uniform(-1.2,0.3); sc.render.filepath=os.path.join(a.out,'images',a.split,name+'.jpg')
        bpy.context.view_layer.update()
        lines=[]
        def add(cls,objs):
            b=bbox(sc,cam,objs,a.res)
            if b: lines.append(f'{CLASSES.index(cls)} {(b[0]+b[2])/2:.6f} {(b[1]+b[3])/2:.6f} {b[2]-b[0]:.6f} {b[3]-b[1]:.6f}'); gt['objects'].append({'cls':cls,'box':[round(v,5) for v in b]})
        for cls in ('board','arduino','resistor','led'):
            if cls in groups: add(cls,groups[cls])
        for w in groups['wires']: add('wire',w)
        for t in gt['tips']:
            c=world_to_camera_view(sc,cam,Vector(t['xyz'])); t['uv']=[round(c.x,5),round(1-c.y,5)]
        bpy.ops.render.render(write_still=True)
        open(os.path.join(a.out,'labels',a.split,name+'.txt'),'w').write('\n'.join(lines)+('\n' if lines else ''))
        json.dump(gt,open(os.path.join(a.out,'meta',a.split,name+'.json'),'w'))
        os.remove(os.path.join(a.out,'tex',f'board_{name}.png'))
        print('done',name,gt['case'],len(lines),flush=True)
main()
