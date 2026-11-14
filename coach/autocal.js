/* Miras automatic board calibration: finds the breadboard hole grid in one camera frame, with no taps.
   Pure functions (no DOM, no OpenCV) so the same file runs in the browser and in node tests.
   Input: RGBA pixels, width, height, and the board box from the detector [x0,y0,x1,y1].
   Output: {ok:true, cols, taps:[4 corner holes in image px, same order as MirasBoard.calibHoles], rails:{plus,minus}|null,
            inliers, rms} or {ok:false, why}.  It refuses (ok:false) rather than guess: the caller then asks for manual taps. */
(function(root){
'use strict';
const ROW_Y=[0,1,2,3,4,7,8,9,10,11];

function solve(A,b){ const n=b.length, M=A.map((r,i)=>r.concat([b[i]]));
  for(let c=0;c<n;c++){ let p=c; for(let r=c+1;r<n;r++) if(Math.abs(M[r][c])>Math.abs(M[p][c])) p=r; if(Math.abs(M[p][c])<1e-12) return null; [M[c],M[p]]=[M[p],M[c]];
    for(let r=0;r<n;r++) if(r!==c){ const f=M[r][c]/M[c][c]; for(let k=c;k<=n;k++) M[r][k]-=f*M[c][k]; } }
  return M.map((r,i)=>r[n]/r[i]); }
// least-squares homography from many pairs (normal equations of the 8-parameter form)
function fitH(src,dst){ const N=Array.from({length:8},()=>new Array(8).fill(0)), v=new Array(8).fill(0);
  for(let i=0;i<src.length;i++){ const [x,y]=src[i],[u,w]=dst[i];
    for(const [r,t] of [[[x,y,1,0,0,0,-u*x,-u*y],u],[[0,0,0,x,y,1,-w*x,-w*y],w]]){ for(let a=0;a<8;a++){ v[a]+=r[a]*t; for(let b=0;b<8;b++) N[a][b]+=r[a]*r[b]; } } }
  const h=solve(N,v); return h?h.concat([1]):null; }
function ap(H,x,y){ const w=H[6]*x+H[7]*y+H[8]; return [(H[0]*x+H[1]*y+H[2])/w,(H[3]*x+H[4]*y+H[5])/w]; }
function inv3(m){ const [a,b,c,d,e,f,g,h,i]=m, A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g, det=a*A+b*B+c*C; if(Math.abs(det)<1e-14) return null;
  return [A,-(b*i-c*h),b*f-c*e,B,a*i-c*g,-(a*f-c*d),C,-(a*h-b*g),a*e-b*d].map(x=>x/det); }
const median=a=>{ const s=a.slice().sort((x,y)=>x-y); return s.length?s[s.length>>1]:0; };

/* dark small blobs = hole candidates */
function findHoles(rgba,W,H,box){
  const x0=Math.max(0,Math.floor(box[0])), y0=Math.max(0,Math.floor(box[1])), x1=Math.min(W,Math.ceil(box[2])), y1=Math.min(H,Math.ceil(box[3]));
  const w=x1-x0, h=y1-y0; if(w<60||h<30) return {pts:[],w,h};
  const g=new Float32Array(w*h); for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=((y+y0)*W+x+x0)*4; g[y*w+x]=0.299*rgba[i]+0.587*rgba[i+1]+0.114*rgba[i+2]; }
  const I=new Float64Array((w+1)*(h+1)); for(let y=0;y<h;y++){ let s=0; for(let x=0;x<w;x++){ s+=g[y*w+x]; I[(y+1)*(w+1)+x+1]=I[y*(w+1)+x+1]+s; } }
  const R=Math.max(3,Math.round(Math.max(w,h)/90));
  const mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++){ const ya=Math.max(0,y-R), yb=Math.min(h,y+R+1); for(let x=0;x<w;x++){ const xa=Math.max(0,x-R), xb=Math.min(w,x+R+1);
    const m=(I[yb*(w+1)+xb]-I[ya*(w+1)+xb]-I[yb*(w+1)+xa]+I[ya*(w+1)+xa])/((yb-ya)*(xb-xa));
    if(m>70 && g[y*w+x] < m*0.80) mask[y*w+x]=1; } }
  // connected components
  const lab=new Int32Array(w*h), pts=[], st=[]; const maxA=Math.max(12,(Math.max(w,h)/28)**2);
  for(let p=0;p<w*h;p++){ if(!mask[p]||lab[p]) continue; let n=0,sx=0,sy=0,mnx=1e9,mxx=-1,mny=1e9,mxy=-1,dk=255; st.push(p); lab[p]=1;
    while(st.length){ const q=st.pop(), x=q%w, y=(q-x)/w; n++; sx+=x; sy+=y; if(g[q]<dk) dk=g[q]; if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(y<mny)mny=y; if(y>mxy)mxy=y;
      if(x>0&&mask[q-1]&&!lab[q-1]){lab[q-1]=1;st.push(q-1);} if(x<w-1&&mask[q+1]&&!lab[q+1]){lab[q+1]=1;st.push(q+1);}
      if(y>0&&mask[q-w]&&!lab[q-w]){lab[q-w]=1;st.push(q-w);} if(y<h-1&&mask[q+w]&&!lab[q+w]){lab[q+w]=1;st.push(q+w);} }
    const bw=mxx-mnx+1, bh=mxy-mny+1; if(n>=2 && n<=maxA && bw<=3*bh+2 && bh<=3*bw+2 && n>=0.3*bw*bh) pts.push([sx/n+x0+0.5, sy/n+y0+0.5, n, dk]); }
  return {pts,w,h};
}

function autoCalibrate(rgba,W,H,box,opts){
  opts=opts||{};
  const pad=0.04*Math.max(box[2]-box[0],box[3]-box[1]); const bx=[box[0]-pad,box[1]-pad,box[2]+pad,box[3]+pad];
  const {pts}=findHoles(rgba,W,H,bx); if(pts.length<80) return {ok:false,why:'few_holes',n:pts.length};
  // nearest-neighbour vectors -> pitch and lattice angle
  const cell=Math.max(4,Math.max(bx[2]-bx[0],bx[3]-bx[1])/60), grid=new Map(), key=(x,y)=>Math.floor(x/cell)+','+Math.floor(y/cell);
  pts.forEach((p,i)=>{ const k=key(p[0],p[1]); (grid.get(k)||grid.set(k,[]).get(k)).push(i); });
  const near=(p,rad)=>{ const out=[], r=Math.ceil(rad/cell), cx=Math.floor(p[0]/cell), cy=Math.floor(p[1]/cell);
    for(let a=-r;a<=r;a++) for(let b=-r;b<=r;b++){ const l=grid.get((cx+a)+','+(cy+b)); if(l) for(const j of l){ const d=Math.hypot(pts[j][0]-p[0],pts[j][1]-p[1]); if(d>0&&d<=rad) out.push([d,j]); } } return out.sort((x,y)=>x[0]-y[0]); };
  const nn=pts.map(p=>{ const l=near(p,cell*3); return l.length?l[0][0]:0; }).filter(d=>d>1.5);
  if(nn.length<60) return {ok:false,why:'no_lattice'};
  const p0=median(nn);
  // angle histogram of neighbour vectors (mod 90 deg)
  const bins=new Float64Array(90); pts.forEach(p=>{ for(const [d,j] of near(p,p0*1.35)){ if(d<p0*0.7) continue; let a=Math.atan2(pts[j][1]-p[1],pts[j][0]-p[0])*180/Math.PI; a=((a%90)+90)%90; bins[Math.round(a)%90]+=1; } });
  let best=0; for(let i=0;i<90;i++){ const s=bins[i]+bins[(i+1)%90]+bins[(i+89)%90]; if(s>bins[best]+bins[(best+1)%90]+bins[(best+89)%90]) best=i; }
  let sw=0,sa=0; for(let k=-2;k<=2;k++){ const i=(best+k+90)%90; sw+=bins[i]; sa+=bins[i]*(best+k); } let th=(sa/Math.max(1,sw))*Math.PI/180;
  // keep holes that have >=2 lattice neighbours
  const ct=Math.cos(th), sn=Math.sin(th);
  let L=pts.map(p=>({x:p[0],y:p[1],u:(p[0]*ct+p[1]*sn),v:(-p[0]*sn+p[1]*ct)}));
  const good=[]; pts.forEach((p,i)=>{ let c=0; for(const [d,j] of near(p,p0*1.3)){ if(d<p0*0.75) continue; const du=Math.abs(L[j].u-L[i].u), dv=Math.abs(L[j].v-L[i].v); if(Math.min(du,dv)<0.3*p0) c++; } if(c>=2) good.push(L[i]); });
  if(good.length<70) return {ok:false,why:'no_lattice',n:good.length};
  L=good;
  // long axis = columns direction (u). swap if needed
  const rng=k=>{ const s=L.map(q=>q[k]).sort((a,b)=>a-b); return s[Math.floor(s.length*0.98)]-s[Math.floor(s.length*0.02)]; };
  if(rng('v')>rng('u')) L.forEach(q=>{ const t=q.u; q.u=q.v; q.v=-t; });
  const uc=median(L.map(q=>q.u));
  // rows from the central part (little perspective there)
  const tryRows=(half)=>{ const Cn=L.filter(q=>Math.abs(q.u-uc)<half*p0).sort((a,b)=>a.v-b.v); if(Cn.length<30) return null;
    const rows=[]; let cur=[Cn[0]]; for(let i=1;i<Cn.length;i++){ if(Cn[i].v-Cn[i-1].v>0.45*p0){ rows.push(cur); cur=[]; } cur.push(Cn[i]); } rows.push(cur);
    const R=rows.filter(r=>r.length>=Math.max(3,half*0.5)).map(r=>({v:median(r.map(q=>q.v)),n:r.length}));
    // find 5 rows, gap ~3p, 5 rows
    for(let i=0;i+9<R.length;i++){ let ok=true; const d=k=>R[i+k+1].v-R[i+k].v; const pl=(R[i+4].v-R[i].v)/4;
      if(pl<0.7*p0||pl>1.4*p0) continue;
      for(let k=0;k<9;k++){ const e=k===4?3:1; if(Math.abs(d(k)-e*pl)>0.3*pl*(k===4?1.6:1)) { ok=false; break; } }
      if(ok) return {R,i,pl}; }
    return null; };
  const rr=tryRows(9)||tryRows(6)||tryRows(14); if(!rr) return {ok:false,why:'rows_not_found'};
  const rowV=[]; for(let k=0;k<10;k++) rowV.push(rr.R[rr.i+k].v);
  // column pitch is measured along the rows (perspective makes it differ from the row pitch)
  const du=[]; for(let k=0;k<10;k++){ const us=L.filter(q=>Math.abs(q.u-uc)<10*p0 && Math.abs(q.v-rowV[k])<0.35*rr.pl).map(q=>q.u).sort((x,y)=>x-y); for(let i=1;i<us.length;i++){ const d=us[i]-us[i-1]; if(d>0.6*p0&&d<1.5*p0) du.push(d); } }
  if(du.length<20) return {ok:false,why:'col_pitch'};
  const pl=median(du), plv=rr.pl;
  // seed correspondences near the centre: relative column index from u, row from v
  const seedS=[],seedD=[]; for(const q of L){ if(Math.abs(q.u-uc)>8*pl) continue; let r=-1,bd=0.35*plv; for(let k=0;k<10;k++){ const d=Math.abs(q.v-rowV[k]); if(d<bd){bd=d;r=k;} } if(r<0) continue;
    const c=Math.round((q.u-uc)/pl); seedS.push([c,ROW_Y[r]]); seedD.push([q.x,q.y]); }
  // column phase: holes sit at integer multiples only after removing the common fractional offset
  { const fr=[]; for(const q of L){ if(Math.abs(q.u-uc)<8*pl){ const f=(q.u-uc)/pl; fr.push(f-Math.round(f)); } }
    // circular mean of fractional parts
    let sx=0,sy=0; for(const q of L){ if(Math.abs(q.u-uc)<8*pl){ const a=2*Math.PI*((q.u-uc)/pl); sx+=Math.cos(a); sy+=Math.sin(a); } } const off=Math.atan2(sy,sx)/(2*Math.PI);
    seedS.length=0; seedD.length=0; for(const q of L){ if(Math.abs(q.u-uc)>8*pl) continue; let r=-1,bd=0.35*plv; for(let k=0;k<10;k++){ const d=Math.abs(q.v-rowV[k]); if(d<bd){bd=d;r=k;} } if(r<0) continue;
      const f=(q.u-uc)/pl-off; if(Math.abs(f-Math.round(f))>0.3) continue; seedS.push([Math.round(f),ROW_Y[r]]); seedD.push([q.x,q.y]); } }
  if(seedS.length<25) return {ok:false,why:'few_seeds',n:seedS.length};
  let Hm=fitH(seedS,seedD); if(!Hm) return {ok:false,why:'fit'};
  // grow: assign every hole to the nearest lattice node under the current homography, refit
  const all=pts; let S2=[],D2=[],rms=0;
  for(let it=0;it<14;it++){ const Hi=inv3(Hm); if(!Hi) return {ok:false,why:'fit'}; S2=[];D2=[]; let se=0; const reach=10+it*5;
    for(const p of all){ const [bxq,byq]=ap(Hi,p[0],p[1]); const c=Math.round(bxq); if(Math.abs(c)>reach) continue; let r=-1,bd=0.3; for(let k=0;k<10;k++){ const d=Math.abs(byq-ROW_Y[k]); if(d<bd){bd=d;r=k;} } if(r<0||Math.abs(bxq-c)>0.3) continue;
      S2.push([c,ROW_Y[r],p[3]]); D2.push([p[0],p[1]]); const e=ap(Hm,c,ROW_Y[r]); se+=(e[0]-p[0])**2+(e[1]-p[1])**2; }
    if(S2.length<40) return {ok:false,why:'few_inliers',n:S2.length}; rms=Math.sqrt(se/S2.length); const Hn=fitH(S2,D2); if(!Hn) break; Hm=Hn; }
  // column range actually occupied (a column counts when >=4 of its 10 holes were seen)
  const cnt=new Map(); S2.forEach(s=>cnt.set(s[0],(cnt.get(s[0])||0)+1)); const colsSeen=[...cnt.entries()].filter(e=>e[1]>=4).map(e=>e[0]).sort((a,b)=>a-b);
  if(!colsSeen.length) return {ok:false,why:'cols'}; let c0=colsSeen[0], c1=colsSeen[colsSeen.length-1], n=c1-c0+1;
  // printed row letters beside column 1 / the last column can look like one more column of holes: they are greyer than holes.
  { const dark=new Map(); S2.forEach(s=>{ const e=dark.get(s[0])||[]; e.push(s[2]); dark.set(s[0],e); }); const dm=c=>median(dark.get(c)||[255]);
    const mid=median(colsSeen.slice(3,-3).map(dm)); let guard=0;
    if(n===65||n===32){ c0++; c1--; n-=2; }   // letters are printed on both ends: both extra columns are letters
    while((n===64||n===65||n===31||n===32) && guard++<2){ const a=dm(c0), b=dm(c1); const worst=a>=b?c0:c1, w=Math.max(a,b), other=Math.min(a,b);
      if(w>mid+18 && w>other+10){ if(worst===c0) c0++; else c1--; n=c1-c0+1; } else break; } }
  let cols = (n>=60&&n<=63)?63 : (n>=28&&n<=30)?30 : 0; if(!cols) return {ok:false,why:'cols_'+n,dbg:[...cnt.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]).join(' '),taps:[[c0,0],[c1,0],[c1,11],[c0,11]].map(q=>ap(Hm,q[0],q[1])),colsDbg:n};
  if(n<cols){ // some end columns hidden: we cannot know which side, refuse unless caller allows
    return {ok:false,why:'cols_partial_'+n}; }
  const pitchPx=Math.hypot(...[0,1].map(i=>ap(Hm,1,5)[i]-ap(Hm,0,5)[i]));
  if(rms>0.22*pitchPx) return {ok:false,why:'rms',rms,pitchPx};
  const need=cols*10*0.45; if(S2.length<need) return {ok:false,why:'few_inliers',n:S2.length,need};
  // board frame: x=0 at c0
  const toImg=(x,y)=>ap(Hm,x+c0,y);
  // rails on both sides: cluster leftover holes by board-y
  const Hi=inv3(Hm), side={neg:[],pos:[]};
  for(const p of all){ const [x,y]=ap(Hi,p[0],p[1]); const xx=x-c0; if(xx<-0.5||xx>cols-0.5||Math.abs(x-Math.round(x))>0.3) continue; if(y<-1.4&&y>-5) side.neg.push(y); else if(y>12.4&&y<16) side.pos.push(y); }
  const two=a=>{ if(a.length<12) return null; a=a.slice().sort((x,y)=>x-y); let bi=-1,bg=0; for(let i=1;i<a.length;i++){ const gp=a[i]-a[i-1]; if(gp>bg){bg=gp;bi=i;} } if(bg<0.45||bi<5||a.length-bi<5) return null; const lo=median(a.slice(0,bi)), hi=median(a.slice(bi)); return (hi-lo>0.6&&hi-lo<1.6)?[lo,hi]:null; };
  const rn=two(side.neg), rp=two(side.pos);
  const redness=(y)=>{ let s=0,k=0; for(let c=1;c<cols-1;c+=0.5){ const [x,yy]=toImg(c,y), xi=Math.round(x), yi=Math.round(yy); if(xi<1||yi<1||xi>=W-1||yi>=H-1) continue; const i=(yi*W+xi)*4; s+=rgba[i]-rgba[i+2]; k++; } return k?s/k:0; };
  const polarity=(pair)=>{ if(!pair) return null; const [a,b]=pair, g=b-a; // lines are printed just outside the pair
    const ra=Math.max(redness(a-0.5*g),redness(a-0.7*g)), rb=Math.max(redness(b+0.5*g),redness(b+0.7*g));
    const ba=Math.min(redness(a-0.5*g),redness(a-0.7*g)), bb=Math.min(redness(b+0.5*g),redness(b+0.7*g));
    // one side must look red and the other blue, clearly
    if(ra>12 && bb<-4 && ra-bb>25) return {plus:a,minus:b,margin:ra-bb}; if(rb>12 && ba<-4 && rb-ba>25) return {plus:b,minus:a,margin:rb-ba}; return {plus:null,minus:null,rows:pair}; };
  let polN=polarity(rn), polP=polarity(rp);
  // choose the rail side: the one nearer to opts.near (e.g. the Arduino centre), else the lower one in the image
  const ref=opts.near||[W/2,H*2]; const dist=y=>{ const m=toImg((cols-1)/2,y); return Math.hypot(m[0]-ref[0],m[1]-ref[1]); };
  let useNeg = rn && (!rp || dist(-3)<dist(14));
  // a side whose red and blue lines were read clearly wins over one where they were not
  const clear=q=>!!(q&&q.plus!=null); if(clear(polN)!==clear(polP)) useNeg=clear(polN);
  if(!rn&&!rp) { const taps=[[0,0],[cols-1,0],[cols-1,11],[0,11]].map(q=>toImg(q[0],q[1])); return {ok:true,cols,taps,rails:null,inliers:S2.length,rms,pitchPx}; }
  let taps, rails;
  if(useNeg){ taps=[[0,0],[cols-1,0],[cols-1,11],[0,11]].map(q=>toImg(q[0],q[1])); rails=polN; }
  else { taps=[[cols-1,11],[0,11],[0,0],[cols-1,0]].map(q=>toImg(q[0],q[1])); rails=polP&&{plus:polP.plus==null?null:11-polP.plus, minus:polP.minus==null?null:11-polP.minus, rows:polP.rows&&polP.rows.map(y=>11-y), margin:polP.margin}; }
  if(rails && rails.plus==null) rails=null;
  return {ok:true,cols,taps,rails:rails&&{plus:rails.plus,minus:rails.minus},inliers:S2.length,rms,pitchPx};
}
const api={autoCalibrate,findHoles,fitH};
if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.MirasAutoCal=api;
})(this);
