/* SPDX-License-Identifier: AGPL-3.0-only */
/* Dependency-free local WebGL point-cloud viewer (no CDN, npm or network needed).
 * The input data is XYZ float32 + RGBA bytes, little-endian, 16 bytes / point.
 * Coordinates are YOLO26 estimated metres; not validated distance measurements.
 */
(function () {
'use strict';
const vertexSource = `
attribute vec3 aPosition;
attribute vec3 aColor;
uniform mat4 uProjection;
uniform mat4 uView;
uniform float uPointSize;
uniform float uDepthScale;
uniform float uDepthCenter;
uniform float uSceneScale;
varying vec3 vColor;
void main(){
  vec3 p = aPosition;
  p.z = uDepthCenter + (p.z - uDepthCenter) * uDepthScale;
  vec4 viewPoint = uView * vec4(p,1.0);
  gl_Position = uProjection * viewPoint;
  gl_PointSize = clamp(uPointSize * uSceneScale / max(0.01, -viewPoint.z), 1.0, 22.0);
  vColor = aColor;
}`;
const fragmentSource = `
precision mediump float;
varying vec3 vColor;
uniform float uRound;
uniform float uOpacity;
void main(){
 if(uRound > 0.5){
   float radius = length(gl_PointCoord - vec2(0.5));
   if (radius > 0.50) discard;
 }
 gl_FragColor = vec4(vColor,uOpacity);
}`;
function compile(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader,src); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
  return shader;
}
function link(gl) {
  const p=gl.createProgram();gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vertexSource));
  gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fragmentSource));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
  return p;
}
function perspective(fov, aspect, near, far){
  const f=1/Math.tan(fov/2),m=new Float32Array(16);
  m[0]=f/aspect;m[5]=f;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=2*far*near/(near-far);
  return m;
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((r,v,i)=>r+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function norm(v){const l=Math.hypot(...v)||1;return v.map(x=>x/l)}
function lookAt(eye,target,up){
  const z=norm(sub(eye,target)),x=norm(cross(up,z)),y=cross(z,x);
  const m=new Float32Array(16);
  m[0]=x[0];m[1]=y[0];m[2]=z[0];m[4]=x[1];m[5]=y[1];m[6]=z[1];
  m[8]=x[2];m[9]=y[2];m[10]=z[2];m[12]=-dot(x,eye);m[13]=-dot(y,eye);m[14]=-dot(z,eye);m[15]=1;
  return m;
}
function heat(t){
  const colors=[[17,37,103],[20,105,212],[40,201,182],[248,199,59],[249,74,65]];
  const q=Math.max(0,Math.min(.999999,t))*4,i=Math.floor(q),s=q-i;
  return [0,1,2].map(k=>Math.round(colors[i][k]*(1-s)+colors[i+1][k]*s));
}
class CloudViewer {
  constructor(canvas){
    this.canvas=canvas;
    this.gl=canvas.getContext('webgl',{antialias:true,alpha:false}) || canvas.getContext('experimental-webgl');
    this.is2D = !this.gl;
    // Browsers that block WebGL can still display a rotating 3D point cloud,
    // rendered in software onto 2D canvas. No third-party CDN is required.
    if(this.is2D){
      this.ctx=canvas.getContext('2d');
      if(!this.ctx) throw Error('Neither WebGL nor Canvas2D is available');
    }else{
      const gl=this.gl;this.program=link(gl);gl.useProgram(this.program);
      this.loc={position:gl.getAttribLocation(this.program,'aPosition'),color:gl.getAttribLocation(this.program,'aColor'),
        proj:gl.getUniformLocation(this.program,'uProjection'),view:gl.getUniformLocation(this.program,'uView'),
        size:gl.getUniformLocation(this.program,'uPointSize'),exag:gl.getUniformLocation(this.program,'uDepthScale'),
        center:gl.getUniformLocation(this.program,'uDepthCenter'),scale:gl.getUniformLocation(this.program,'uSceneScale'),
        round:gl.getUniformLocation(this.program,'uRound'),opacity:gl.getUniformLocation(this.program,'uOpacity')};
      this.posBuffer=gl.createBuffer();this.colorBuffer=gl.createBuffer();this.gridPos=gl.createBuffer();this.gridColor=gl.createBuffer();
      this._makeGrid();
      gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    }
    this.disposed=false;this.points=0;this.posData=null;this.originalColors=null;this.displayColors=null;this.colormode='rgb';
    this.size=3;this.exaggeration=1;this.autoSpin=false;this.target=[0,0,-3];this.radius=8.5;
    this.homeTarget=[0,0,-3];this.homeRadius=8.5;this.depthCenter=-3;this.sceneScale=8.5;this.colorRange=[0.1,20];
    this.theta=0.0;this.phi=Math.PI/2.12;this._drag=null;this._last2D=0;
    this._events();
    this._render=this._render.bind(this);requestAnimationFrame(this._render);
  }
  destroy(){this.disposed=true;}
  reset(){this.target=this.homeTarget.slice();this.radius=this.homeRadius;this.theta=0;this.phi=Math.PI/2.12;}
  setPoints(positions,colors,fit=false){
    const gl=this.gl;this.posData=positions;this.originalColors=colors;this.points=positions.length/3;
    if(gl){gl.bindBuffer(gl.ARRAY_BUFFER,this.posBuffer);gl.bufferData(gl.ARRAY_BUFFER,positions,gl.DYNAMIC_DRAW);}
    if(this.points){
      const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<positions.length;i+=3)for(let k=0;k<3;k++){
        const v=positions[i+k];if(!Number.isFinite(v))throw Error('Non-finite point coordinate');
        lo[k]=Math.min(lo[k],v);hi[k]=Math.max(hi[k],v);
      }
      this.homeTarget=lo.map((v,k)=>(v+hi[k])/2);
      const diagonal=Math.hypot(...hi.map((v,k)=>v-lo[k]));
      const aspect=Math.max(0.1,this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight));
      this.homeRadius=Math.max(.15,diagonal*1.1/Math.min(1,aspect));
      this.sceneScale=this.homeRadius;this.depthCenter=this.homeTarget[2];
      if(fit)this.reset();
    }
    this._updateColors();
  }
  setPacked(base64,count,fit=false,colorRange=[.1,20]){
    const str=atob(base64),n=count|0;
    if(str.length!==n*16)throw Error('Point-cloud payload has unexpected length');
    const buffer=new ArrayBuffer(str.length),bytes=new Uint8Array(buffer);
    for(let i=0;i<str.length;i++)bytes[i]=str.charCodeAt(i);
    const view=new DataView(buffer),p=new Float32Array(n*3),colors=new Uint8Array(n*3);
    for(let i=0;i<n;i++){
      const k=i*16,j=i*3;
      p[j]=view.getFloat32(k,true);p[j+1]=view.getFloat32(k+4,true);p[j+2]=view.getFloat32(k+8,true);
      colors[j]=view.getUint8(k+12);colors[j+1]=view.getUint8(k+13);colors[j+2]=view.getUint8(k+14);
    }
    this.colorRange=colorRange;this.setPoints(p,colors,fit);
  }
  setColorMode(mode){this.colormode=mode;this._updateColors();}
  _updateColors(){
    if(!this.originalColors)return;
    const gl=this.gl;let colors=this.originalColors;
    if(this.colormode==='depth'){
      colors=new Uint8Array(this.originalColors.length);
      for(let i=0;i<this.points;i++){
        const distance=-this.posData[i*3+2];
        const t=Math.max(0,Math.min(1,1-(distance-this.colorRange[0])/(this.colorRange[1]-this.colorRange[0]))),c=heat(t);
        colors.set(c,i*3);
      }
    }
    this.displayColors=colors;
    if(gl){gl.bindBuffer(gl.ARRAY_BUFFER,this.colorBuffer);gl.bufferData(gl.ARRAY_BUFFER,colors,gl.DYNAMIC_DRAW);}
  }
  _makeGrid(){
    const pos=[],col=[];
    // World-space grid on horizontal floor plane; reference graphic only.
    for(let i=-6;i<=6;i++){
      let x=i*.5;
      pos.push(x,-2.4,-7,x,-2.4,1);
      pos.push(-3,-2.4,-3+i*.5,3,-2.4,-3+i*.5);
    }
    for(let i=0;i<pos.length/3;i++)col.push(38,96,114);
    const gl=this.gl;
    this.gridCount=pos.length/3;
    gl.bindBuffer(gl.ARRAY_BUFFER,this.gridPos);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pos),gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.gridColor);gl.bufferData(gl.ARRAY_BUFFER,new Uint8Array(col),gl.STATIC_DRAW);
  }
  _bind(buffer,location,count,type,normalized){
    const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location,count,type,normalized,0,0);
  }
  _events(){
    const el=this.canvas;
    el.addEventListener('contextmenu',e=>e.preventDefault());
    el.addEventListener('pointerdown',e=>{
      el.setPointerCapture(e.pointerId);
      this._drag={x:e.clientX,y:e.clientY,button:e.button};
    });
    el.addEventListener('pointerup',()=>this._drag=null);
    el.addEventListener('pointercancel',()=>this._drag=null);
    el.addEventListener('pointermove',e=>{
      if(!this._drag)return;
      const dx=e.clientX-this._drag.x,dy=e.clientY-this._drag.y;
      this._drag.x=e.clientX;this._drag.y=e.clientY;
      if(this._drag.button===2 || e.shiftKey){
        const mag=.0021*this.radius;
        this.target[0]-=dx*mag;this.target[1]+=dy*mag;
      }else{
        this.theta-=dx*.006;this.phi=Math.min(Math.PI-.04,Math.max(.04,this.phi-dy*.006));
      }
    });
    el.addEventListener('wheel',e=>{e.preventDefault();this.radius=Math.max(this.homeRadius*.02,Math.min(this.homeRadius*30,this.radius*Math.exp(e.deltaY*.0015)));},{passive:false});
  }
  _render(){
    if(this.disposed)return;
    const gl=this.gl,canvas=this.canvas;
    const dpr=this.is2D?1:Math.min(window.devicePixelRatio||1,2);
    const ww=Math.max(2,Math.round(canvas.clientWidth*dpr)),hh=Math.max(2,Math.round(canvas.clientHeight*dpr));
    if(canvas.width!==ww||canvas.height!==hh){canvas.width=ww;canvas.height=hh;if(gl)gl.viewport(0,0,ww,hh);}
    if(this.is2D){
      this._draw2D(ww,hh);
      requestAnimationFrame(this._render);return;
    }
    gl.clearColor(.025,.066,.110,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    if(this.autoSpin)this.theta+=.0024;
    const sp=Math.sin(this.phi),eye=[this.target[0]+this.radius*sp*Math.sin(this.theta),
      this.target[1]+this.radius*Math.cos(this.phi),
      this.target[2]+this.radius*sp*Math.cos(this.theta)];
    gl.uniformMatrix4fv(this.loc.proj,false,perspective(Math.PI/3,ww/hh,Math.max(.001,this.homeRadius*.001),Math.max(100,this.radius+this.homeRadius*100)));
    gl.uniformMatrix4fv(this.loc.view,false,lookAt(eye,this.target,[0,1,0]));
    // No fabricated floor plane: only the estimated visible surface is drawn.
    gl.uniform1f(this.loc.center,this.depthCenter);
    gl.uniform1f(this.loc.scale,this.sceneScale);
    if(this.points){
      gl.uniform1f(this.loc.exag,this.exaggeration);
      gl.uniform1f(this.loc.size,this.size);
      gl.uniform1f(this.loc.round,1);gl.uniform1f(this.loc.opacity,1);
      this._bind(this.posBuffer,this.loc.position,3,gl.FLOAT,false);
      this._bind(this.colorBuffer,this.loc.color,3,gl.UNSIGNED_BYTE,true);
      gl.drawArrays(gl.POINTS,0,this.points);
    }
    requestAnimationFrame(this._render);
  }
  _draw2D(w,h){
    // Software 3D fallback for browsers with WebGL disabled by IT policy.
    // 20 fps cap is intentional to keep large point clouds usable on CPUs.
    const t=performance.now();if(t-this._last2D<50)return;this._last2D=t;
    const ctx=this.ctx;
    ctx.fillStyle='#081b2c';ctx.fillRect(0,0,w,h);
    // Decorative horizontal reference lines.
    ctx.strokeStyle='rgba(65,123,142,.14)';ctx.lineWidth=1;
    for(let i=1;i<=8;i++){
      const yy=Math.round(i*h/9)+.5;
      ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke();
    }
    if(this.autoSpin)this.theta+=.005;
    if(!this.points||!this.posData)return;
    const sp=Math.sin(this.phi),eye=[this.target[0]+this.radius*sp*Math.sin(this.theta),
      this.target[1]+this.radius*Math.cos(this.phi),this.target[2]+this.radius*sp*Math.cos(this.theta)];
    const mat=lookAt(eye,this.target,[0,1,0]);
    const foc=h*.8660254,pos=this.posData,col=this.displayColors;
    // Depth-sort an approximate subset by reducing heavy overdraw, only when necessary.
    const step=this.points>38000?Math.ceil(this.points/38000):1;
    for(let i=0;i<this.points;i+=step){
      const j=i*3,x=pos[j],y=pos[j+1],z=this.depthCenter+(pos[j+2]-this.depthCenter)*this.exaggeration;
      const xx=mat[0]*x+mat[4]*y+mat[8]*z+mat[12];
      const yy=mat[1]*x+mat[5]*y+mat[9]*z+mat[13];
      const zz=mat[2]*x+mat[6]*y+mat[10]*z+mat[14];
      if(zz>=-Math.max(.001,this.homeRadius*.001))continue;
      const depth=-zz,px=w/2+xx*foc/depth,py=h/2-yy*foc/depth;
      if(px<0||py<0||px>=w||py>=h)continue;
      const size=Math.min(9,Math.max(1,this.size*this.sceneScale/depth));
      ctx.fillStyle=`rgb(${col[j]},${col[j+1]},${col[j+2]})`;
      ctx.fillRect(px,py,size,size);
    }
  }
  syntheticDemo(){
    // Viewer-only geometry. Explicitly labelled as synthetic, never ML output.
    const cols=180,rows=115,p=new Float32Array(cols*rows*3),c=new Uint8Array(cols*rows*3);
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const u=(x/(cols-1)-.5)*6.8,v=(.5-y/(rows-1))*3.85;
      let depth=3.7+.32*Math.sin(u*2.6)*Math.cos(v*2.4);
      if(u<-.8 && u>-2.8 && Math.abs(v)<1.25)depth=2.25+.17*Math.sin(u*4)+.12*Math.cos(v*7);
      if(u>.75 && u<2.85 && Math.abs(v)<1.6)depth=2.75+.3*Math.cos(u*4)*Math.sin(v*3);
      const z=-depth,j=(y*cols+x)*3;
      p[j]=u;p[j+1]=v;p[j+2]=z;
      const color=heat((5-depth)/4);
      c[j]=color[0];c[j+1]=color[1];c[j+2]=color[2];
    }
    this.colorRange=[1,5];this.setPoints(p,c,true);
    this.reset();return cols*rows;
  }
}
window.CloudViewer=CloudViewer;
})();
