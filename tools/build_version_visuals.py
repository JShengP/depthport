# SPDX-License-Identifier: AGPL-3.0-only
"""Build deterministic SVG version schematics from generated data only."""
from __future__ import annotations
import argparse
from html import escape
from pathlib import Path
import math

BG='#0b1220'; PANEL='#132238'; TEXT='#edf4ff'; MUTED='#a8bbd3'
COLORS=['#53d5f5','#bca0ff','#68e4b0']

def rect(x,y,w,h,fill=PANEL,stroke='#29405e',rx=16):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}"/>'
def text(x,y,value,size=20,fill=TEXT,weight=400):
    return f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" font-weight="{weight}">{escape(value)}</text>'
def line(x,y,xx,yy,color=MUTED,width=2):
    return f'<path d="M{x},{y} L{xx},{yy}" fill="none" stroke="{color}" stroke-width="{width}"/>'
def cloud(x,y,w,h):
    s=rect(x,y,w,h,'#091729')
    for i in range(168):
        a=i*2.39996323; r=math.sqrt((i+.5)/168)
        xx=x+w/2+math.cos(a)*r*w*.39
        yy=y+h/2+math.sin(a)*r*h*.32+math.cos(a)*r*h*.1
        s+=f'<circle cx="{xx:.2f}" cy="{yy:.2f}" r="{2+(i%3)*.5}" fill="{["#53d5f5","#8de5dd","#6997f1"][i%3]}"/>'
    return s+text(x+15,y+28,'XYZRGB / synthetic points',16,MUTED)
def depth(x,y,w,h):
    s=rect(x,y,w,h,'#091729')
    palette=['#183c87','#4163bf','#9970c4','#ec9b82','#f7d8a1']
    for i in range(4):
        ox=x+12+(i%2)*(w/2);oy=y+12+(i//2)*(h/2)
        for j in range(10):
            s+=f'<rect x="{ox+j*(w/2-22)/10:.1f}" y="{oy}" width="{(w/2-22)/10+1:.1f}" height="{h/2-24}" fill="{palette[(j+i)%5]}"/>'
        s+=rect(ox+4,oy+h/2-49,78,25,'#091729','#091729',4)
        s+=text(ox+10,oy+h/2-32,['YOLO','V2','DA3','Metric'][i],13,'#ffffff',700)
    return s
def tracking(x,y,w,h):
    s=rect(x,y,w,h,'#091729')
    s+=line(x+10,y+h*.75,x+w-10,y+h*.75,'#29405e')
    for i,(ox,oy,c) in enumerate([(w*.17,h*.27,'#68e4b0'),(w*.53,h*.22,'#ffd580')]):
        s+=rect(x+ox,y+oy,w*.22,h*.43,'#1c3447',c,5)
        s+=text(x+ox,y+oy-10,f'Object {i+1:02}',16,c,700)
        for j in range(4): s+=f'<circle cx="{x+ox-j*12}" cy="{y+oy+h*.43+j*3}" r="3" fill="{c}" opacity="{1-j*.18}"/>'
    return s+text(x+15,y+h-15,'Frame 08 / 24 | A ---- B',16,MUTED)
VIS=[cloud,depth,tracking]
VERS=['v0.1','v0.2','v0.3']
NAMES=['Depth & point clouds','Spatial Analysis','Sessions & Tracking']
FEATURES=[['Image / RTSP inputs','Four depth engines','Same-frame PLY / NPY / ZIP'],['Pixel depth / XYZ inspector','Four-engine comparison','Semantic fusion / calibration'],['Local replay / boxes / IDs','A/B loops / bookmark review','Optional isolated BoT-SORT']]
GATES=['Hardware / real-model gates open','One-image GPU evidence; field gates open','Long occlusion / physical-camera gates open']

def svg(body,w,h,title,description):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(description)}</desc><g font-family="DejaVu Sans,Arial,sans-serif">{rect(0,0,w,h,BG,BG,0)}{body}</g></svg>\n'''
def overview():
    s=text(40,56,'DepthPort | Three generations',34,weight=700)
    s+=text(40,94,'Viewer foundation → spatial analysis → local temporal review',21,MUTED)
    for i in range(3):
        x=40+i*374;c=COLORS[i]
        s+=rect(x,126,350,510)+text(x+22,169,VERS[i],32,c,700)+text(x+22,205,NAMES[i],22,weight=700)
        s+=VIS[i](x+20,226,310,180)
        for j,label in enumerate(FEATURES[i]):s+=text(x+22,447+j*35,label,17)
        s+=text(x+22,587,['Foundation','Retains v0.1','Retains v0.1 + v0.2'][i],17,c,700)
    s+=text(40,682,'All versions: experimental Alpha • local-first • different depth units remain explicit',19,MUTED)
    s+=text(40,720,'Generated schematic data • illustrative workflows, not screenshots or accuracy evidence',16,MUTED)
    return svg(s,1180,752,'DepthPort version overview','Three version cards show retained foundations and additions. All pictures use generated schematic data; no camera image, private data or model output is embedded.')
def detail(i):
    c=COLORS[i];s=text(40,58,f'{VERS[i]} | {NAMES[i]}',36,c,700)
    s+=text(40,100,['Single-view depth and export','Inspect the same frame in several ways','Review saved frames over time'][i],23,MUTED)
    s+=VIS[i](40,138,530,300)
    s+=rect(596,138,544,300)
    s+=text(620,180,'WHAT THIS GENERATION ADDS',18,c,700)
    for j,f in enumerate(FEATURES[i]):s+=text(620,230+j*49,f,21)
    steps=[['RGB / RTSP','Depth worker','XYZRGB / export'],['Same frame','Analysis jobs','Inspector / compare'],['Manual archive','Offline tracking','Replay / review']][i]
    for j,t in enumerate(steps):
        x=40+j*374;s+=rect(x,476,330,70,stroke=c)+text(x+20,520,t,20,weight=700)
        if j<2:s+=line(x+335,511,x+369,511,c,3)+f'<path d="M{x+361},504 L{x+370},511 L{x+361},518" fill="none" stroke="{c}" stroke-width="3"/>'
    s+=text(40,597,GATES[i],22,c,700)
    s+=text(40,640,'Generated schematic data • no private media • no inference or benchmark claim',17,MUTED)
    return svg(s,1180,674,f'DepthPort {VERS[i]} capabilities and workflow','A generated schematic illustrates '+NAMES[i]+'. Exact architecture, units, implementation entry points and validation limitations are documented in the adjacent version README.')
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'docs/assets')
    out=p.parse_args().output;out.mkdir(parents=True,exist_ok=True)
    (out/'versions-overview.svg').write_text(overview(),encoding='utf-8')
    for i,v in enumerate(VERS):(out/f'{v}-workflow.svg').write_text(detail(i),encoding='utf-8')
    print('Built four SVG schematics from generated data only; no model, camera, session or private input was read.')
if __name__=='__main__':main()
