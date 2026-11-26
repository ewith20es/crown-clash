import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { World } from '../js/sim/world.js';
import { applyGradient, emptyHead, HIDDEN, MODEL_VERSION } from '../js/ai/network.js';
import { describeMove, MatchLearning, RivalLearning } from '../js/ai/live-learning.js';
import { FilePolicy, learningApi } from '../tools/learning.mjs';
import { loadState, saveState } from '../js/game/store.js';
import { normalizeSettings } from '../js/ui/format.js';

const origin = 'https://example.github.io';
function storage() {
  const items = new Map();
  return {getItem:k=>items.get(k),setItem:(k,v)=>items.set(k,v)};
}
function playedMatch() {
  const w = new World({seed:237});
  const lesson = new MatchLearning(emptyHead());
  for (let i=0;i<4;i++) {
    const index = i%4;
    w.players[0].aether=10;
    const move=w.canPlay(0,index,-4,5);
    const signal=describeMove(w,0,index,move,lesson.head);
    assert.equal(signal.length,HIDDEN);
    assert.ok(w.playCard(0,index,-4,5));
    lesson.record(signal);
    for (let tick=0;tick<100;tick++) w.step(1/30);
  }
  return lesson;
}

test('accepted actions and match outcomes train the output layer; abandoned and idle games are excluded',()=>{
  const lesson=playedMatch();
  const win=lesson.finish('win','citadel'), loss=lesson.finish('lose','citadel');
  assert.ok(win.some(n=>n!==0));
  assert.ok(win.some((n,i)=>n*loss[i]<0));
  assert.equal(lesson.finish('win','disconnect'),null);
  assert.equal(lesson.finish('lose','surrender'),null);
  assert.equal(lesson.finish('draw','draw'),null);
  assert.equal(new MatchLearning(emptyHead()).finish('win','citadel'),null);
});

test('two independent browsers share learning through the match host and retries count once',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'crown-learning-'));
  const file=join(dir,'head.json');
  let store=new FilePolicy(file);
  let storeCalls=0;
  const api=learningApi({request:report=>{storeCalls++; return store.request(report);}},origin);
  const server=http.createServer(api).listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async()=>{server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); await rm(dir,{recursive:true,force:true});});
  const endpoint='http://127.0.0.1:'+server.address().port+'/api/learning';
  const wake = await fetch(endpoint,{method:'HEAD',headers:{Origin:origin}});
  assert.equal(wake.status,204);
  assert.equal(wake.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal(storeCalls,0);
  const reports=[];
  const request=(url,init)=>{
    if (init.body) reports.push(init.body);
    return fetch(url,{...init,headers:{...init.headers,Origin:origin}});
  };
  const device=storage();
  const a=new RivalLearning({endpoint,storage:device,request});
  const update=playedMatch().finish('win','citadel');
  await a.learn(update);
  assert.deepEqual(a.head(),applyGradient(emptyHead(),update.map(n=>n/100)));
  assert.deepEqual(new RivalLearning({endpoint,storage:device}).head(),a.head());
  await a.connect();
  assert.equal(reports.length,1);
  const post=body=>fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body});
  const again=await Promise.all([post(reports[0]),post(reports[0])]);
  for (const res of again) assert.equal((await res.json()).matches,1);
  store = new FilePolicy(file);
  const b=new RivalLearning({endpoint,storage:storage(),request});
  await b.connect();
  assert.equal(b.state.communityMatches,1);
  assert.deepEqual(b.head(),applyGradient(emptyHead(),update.map(n=>n/100)));
  const extra = [1,2].map(()=>post(JSON.stringify({...JSON.parse(reports[0]),id:crypto.randomUUID()})));
  const counts = await Promise.all(extra.map(async res=>(await (await res).json()).matches));
  assert.deepEqual(counts.sort(),[2,3]);
  const pre=await fetch(endpoint,{method:'OPTIONS',headers:{Origin:origin}});
  assert.equal(pre.status,204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal((await fetch(endpoint,{headers:{Origin:'https://other.example'}})).status,403);
  assert.equal((await post(' '.repeat(2048))).status,413);
  assert.equal((await post(JSON.stringify({...JSON.parse(reports[0]),version:'other'}))).status,400);
});

test('an opted-out client sends nothing; disabling sharing clears unsubmitted contributions',async()=>{
  const a=new RivalLearning({storage:storage(),endpoint:'https://example.test/api/learning',request:()=>assert.fail('network request')});
  await a.learn(Array(HIDDEN).fill(20));
  a.setEnabled(false);
  await a.change(()=>{});
  await a.connect();
  await a.learn(Array(HIDDEN).fill(20));
  assert.equal(a.state.matches,1);
  assert.equal(a.state.pending.length,0);
});

test('solo training wakes a sleeping server without waiting and uploads after the result',async()=>{
  const sent=[];
  const a=new RivalLearning({storage:storage(),endpoint:'https://example.test/api/learning',syncAfterMatch:true,
    request:async(url,init)=>{
      sent.push(init.method);
      assert.equal(init.priority,'low');
      if (init.method === 'HEAD') {
        return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('closed')),{once:true}));
      }
      return Response.json({version:MODEL_VERSION,head:emptyHead(),matches:1});
    }});
  assert.deepEqual(sent,[]);
  assert.equal(a.beginSolo(),undefined);
  const before = a.head();
  const gradient = playedMatch().finish('win','citadel');
  await a.sync();
  assert.deepEqual(a.head(),before);
  assert.deepEqual(sent,['HEAD']);
  a.endSolo();
  await a.learn(gradient);
  assert.deepEqual(sent,['HEAD','POST']);
  assert.equal(a.state.pending.length,0);
});

test('solo preference survives a reload and overrides the site default',t=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage()});
  t.after(()=>{if (original) Object.defineProperty(globalThis,'localStorage',original); else delete globalThis.localStorage;});
  const player=loadState();
  assert.equal(player.settings.soloTrainingServer,false);
  for (const on of [true,false]) {
    player.settings=normalizeSettings({soloTrainingServer:on},player.settings);
    saveState(player);
    assert.equal(loadState().settings.soloTrainingServer,on);
  }
});

test('turning solo training off queues future solo results even after visiting multiplayer',async()=>{
  const sent=[];
  const a=new RivalLearning({storage:storage(),endpoint:'https://example.test/api/learning',request:async(_,init)=>{
    sent.push(init.method);
    return Response.json({version:MODEL_VERSION,head:emptyHead(),matches:0});
  }});
  await a.connect();
  a.setSoloServer(true);
  a.setSoloServer(false);
  a.beginSolo();
  a.endSolo();
  await a.learn(Array(HIDDEN).fill(11));
  assert.deepEqual(sent,['GET']);
  assert.equal(a.state.pending.length,1);
  a.setSoloServer(true);
  a.beginSolo(true); // Autoplay never contributes.
  a.endSolo();
  a.setEnabled(false);
  a.beginSolo();
  a.endSolo();
  assert.deepEqual(sent,['GET']);
});

test('a rematch defers a previous upload and retries the same report after play',async()=>{
  const posts=[];
  let release;
  const response=()=>Response.json({version:MODEL_VERSION,head:emptyHead(),matches:posts.length});
  const a=new RivalLearning({storage:storage(),endpoint:'https://example.test/api/learning',syncAfterMatch:true,
    request:async(_,init)=>{
      if (init.method === 'HEAD') return new Response(null,{status:204});
      posts.push(JSON.parse(init.body).id);
      if (posts.length===1) return new Promise(resolve=>{release=()=>resolve(response());});
      return response();
    }});
  const uploading=a.learn(Array(HIDDEN).fill(10));
  while (!release) await new Promise(resolve=>setImmediate(resolve));
  a.beginSolo();
  release();
  await uploading;
  assert.equal(a.state.pending.length,1);
  assert.equal(a.state.communityMatches,0);
  await a.sync();
  assert.equal(posts.length,1);
  a.endSolo();
  await a.learn(Array(HIDDEN).fill(15));
  assert.equal(posts[1],posts[0]);
  assert.notEqual(posts[2],posts[0]);
  assert.equal(a.state.pending.length,0);
});

test('a lost acknowledgement is safe to retry after reloading',async()=>{
  const device=storage();
  let first;
  const update=Array(HIDDEN).fill(25);
  const a=new RivalLearning({storage:device,endpoint:'https://example.test/api/learning',request:async(_,init)=>{
    first=JSON.parse(init.body); throw Error('lost response');
  }});
  await a.learn(update);
  await a.connect();
  clearTimeout(a.retryTimer);
  const b=new RivalLearning({storage:device,endpoint:a.endpoint,request:async(_,init)=>{
    assert.equal(JSON.parse(init.body).id,first.id);
    return Response.json({version:MODEL_VERSION,head:emptyHead(),matches:1});
  }});
  await b.connect();
  assert.equal(b.state.pending.length,0);
  assert.equal(b.state.matches,1);
});
