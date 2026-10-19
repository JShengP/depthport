/* SPDX-License-Identifier: AGPL-3.0-only */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');
const source=fs.readFileSync(path.resolve(__dirname,'../static/replay-playback.js'),'utf8');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}

// Real asynchronous advances, with deterministic timers. The tests observe when
// another frame can be requested and whether a pending frame may still commit.
function setup(){
 const window={};vm.runInNewContext(source,{window,setTimeout,clearTimeout,performance});
 let time=0,nextTimer=0;
 const timers=new Map(),calls=[],states=[],errors=[];
 const clock={
  now:()=>time,
  setTimer:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,at:time+Math.max(0,delay)});return id},
  clearTimer:id=>timers.delete(id),
  async tick(ms){
   const target=time+ms;await flush();
   for(let count=0;count<100;count++){
    const due=[...timers.entries()].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
    if(!due){time=target;await flush();return}
    time=due[1].at;timers.delete(due[0]);due[1].fn();await flush();
   }
   throw Error('Playback scheduled too many timers without advancing time');
  },
  get timerCount(){return timers.size}
 };
 const player=window.DepthPortReplayPlayback.create({
  advance:valid=>{const d=deferred();calls.push({valid,...d,at:time});return d.promise},
  onState:state=>states.push({...state}),onError:err=>errors.push(err),
  setTimer:clock.setTimer,clearTimer:clock.clearTimer,now:clock.now
 });
 return {player,clock,calls,states,errors};
}

test('1x presents saved frames at 5 frames/s and subtracts load time from the next wait',async()=>{
 const {player,clock,calls}=setup();player.play();await clock.tick(0);
 assert.equal(calls.length,1);assert.equal(calls[0].at,0);assert.equal(player.getState().busy,true);
 await clock.tick(80);calls[0].resolve(true);await flush();
 assert.equal(player.getState().busy,false);
 await clock.tick(119);assert.equal(calls.length,1);
 await clock.tick(1);assert.equal(calls.length,2);assert.equal(calls[1].at,200);
 player.pause();calls[1].resolve(true);await flush();
});

test('a slow frame is never skipped or overlapped by a timer',async()=>{
 const {player,clock,calls}=setup();player.play();await clock.tick(1000);
 assert.equal(calls.length,1);assert.equal(clock.timerCount,0);
 calls[0].resolve(true);await flush();await clock.tick(0);
 assert.equal(calls.length,2);assert.equal(calls[1].at,1000);
 await clock.tick(1000);assert.equal(calls.length,2);
 player.pause();calls[1].resolve(true);await flush();
});

test('changing speed while waiting reschedules from the preceding frame start',async()=>{
 const {player,clock,calls}=setup();player.play();await clock.tick(0);calls[0].resolve(true);await flush();
 await clock.tick(50);player.setSpeed(2);await flush();
 assert.equal(player.getState().speed,2);assert.equal(clock.timerCount,1);
 await clock.tick(49);assert.equal(calls.length,1);
 await clock.tick(1);assert.equal(calls.length,2);assert.equal(calls[1].at,100);
 player.pause();calls[1].resolve(true);await flush();
});

test('changing speed during load preserves its cancellation token and uses the new cadence',async()=>{
 const {player,clock,calls}=setup();player.play();await clock.tick(50);
 player.setSpeed(.5);assert.equal(calls[0].valid(),true);
 await clock.tick(20);calls[0].resolve(true);await flush();
 await clock.tick(329);assert.equal(calls.length,1);
 await clock.tick(1);assert.equal(calls.length,2);assert.equal(calls[1].at,400);
 player.pause();calls[1].resolve(true);await flush();
});

test('all supported rates have a fixed saved-frame cadence',async()=>{
 for(const speed of [.25,.5,1,2]){
  const {player,clock,calls}=setup();player.setSpeed(speed);player.play();await clock.tick(0);
  calls[0].resolve(true);await flush();await clock.tick(200/speed-1);assert.equal(calls.length,1);
  await clock.tick(1);assert.equal(calls.length,2);
  player.pause();calls[1].resolve(true);await flush();
 }
});

test('pause cancels a queued timer and invalidates a delayed presentation',async()=>{
 const {player,clock,calls}=setup();player.play();await clock.tick(0);
 assert.equal(calls[0].valid(),true);player.pause();assert.equal(calls[0].valid(),false);
 calls[0].resolve(true);await flush();await clock.tick(1000);
 assert.equal(calls.length,1);assert.equal(clock.timerCount,0);
 assert.equal(player.getState().playing,false);assert.equal(player.getState().status,'paused');
 player.play();await clock.tick(0);calls[1].resolve(true);await flush();
 assert.equal(clock.timerCount,1);player.pause();assert.equal(clock.timerCount,0);
 await clock.tick(1000);assert.equal(calls.length,2);
});

test('repeated Play cannot issue parallel requests while loading or waiting',async()=>{
 const {player,clock,calls}=setup();player.play();player.play();player.play();await clock.tick(0);
 assert.equal(calls.length,1);calls[0].resolve(true);await flush();
 player.play();player.play();assert.equal(clock.timerCount,1);
 await clock.tick(200);assert.equal(calls.length,2);
 player.pause();calls[1].resolve(true);await flush();
});

test('pause then resume waits for the cancelled load and never revives its token',async()=>{
 const {player,clock,calls}=setup();player.play();await clock.tick(0);
 player.pause();player.play();await clock.tick(500);
 assert.equal(calls.length,1);assert.equal(calls[0].valid(),false);
 calls[0].resolve(true);await flush();await clock.tick(0);
 assert.equal(calls.length,2);assert.equal(calls[0].valid(),false);assert.equal(calls[1].valid(),true);
 assert.equal(player.getState().playing,true);
 player.pause();calls[1].resolve(true);await flush();
});

test('the final frame ends playback without another timer',async()=>{
 const {player,clock,calls,errors}=setup();player.play();await clock.tick(0);
 calls[0].resolve(false);await flush();await clock.tick(1000);
 assert.equal(calls.length,1);assert.equal(player.getState().status,'ended');
 assert.equal(player.getState().playing,false);assert.equal(player.getState().busy,false);
 assert.equal(clock.timerCount,0);assert.equal(errors.length,0);
});

test('an active load error stops playback and is reported once',async()=>{
 const {player,clock,calls,errors}=setup();player.play();await clock.tick(0);
 const error=Error('Saved frame failed to decode');calls[0].reject(error);await flush();await clock.tick(1000);
 assert.equal(calls.length,1);assert.equal(player.getState().status,'error');
 assert.equal(player.getState().playing,false);assert.equal(player.getState().busy,false);
 assert.equal(clock.timerCount,0);assert.equal(errors.length,1);assert.equal(errors[0],error);
});

test('an error from a paused load cannot replace the paused state or announce a stale failure',async()=>{
 const {player,clock,calls,errors}=setup();player.play();await clock.tick(0);player.pause();
 calls[0].reject(Error('Late obsolete request failed'));await flush();await clock.tick(1000);
 assert.equal(player.getState().status,'paused');assert.equal(errors.length,0);
 assert.equal(calls.length,1);assert.equal(clock.timerCount,0);
});
