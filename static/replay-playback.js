/* SPDX-License-Identifier: AGPL-3.0-only */
(() => {'use strict';
function create({advance,onState=()=>{},onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout,now=()=>performance.now()}){
 let playing=false,busy=false,speed=1,status='paused',generation=0,timer=null,lastStart=null;
 const state=()=>({playing,busy,speed,status});
 const emit=()=>onState(state());
 const cancel=()=>{if(timer!==null){clearTimer(timer);timer=null}};
 const delay=()=>lastStart===null?0:Math.max(0,200/speed-(now()-lastStart));
 function schedule(token,ms){cancel();timer=setTimer(()=>{timer=null;void tick(token)},ms)}
 function pause(reason='paused'){playing=false;status=reason;generation++;lastStart=null;cancel();emit()}
 async function tick(token){
  if(!playing||token!==generation||busy)return;
  busy=true;lastStart=now();emit();
  const valid=()=>playing&&token===generation;
  let more=true,error=null;
  try{more=await advance(valid)}catch(err){error=err}
  busy=false;
  if(valid()){
   if(error){pause('error');onError(error);return}
   if(more===false){pause('ended');return}
   schedule(token,delay());
  }else if(playing){schedule(generation,0)}
  emit();
 }
 function play(){if(playing)return;playing=true;status='playing';generation++;lastStart=null;emit();if(!busy)schedule(generation,0)}
 function setSpeed(value){
  if(![.25,.5,1,2].includes(value))throw Error('Unsupported replay speed');
  speed=value;if(playing&&!busy)schedule(generation,delay());emit();
 }
 return {play,pause,setSpeed,getState:state};
}
window.DepthPortReplayPlayback={create};
})();
