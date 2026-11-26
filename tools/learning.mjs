import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { applyGradient, emptyHead, isHead, MODEL_VERSION, MAX_AGE, validReport } from '../js/ai/network.js';

const initial = () => ({version:MODEL_VERSION,head:emptyHead(),matches:0});
const next = (p,r) => ({...p,head:applyGradient(p.head,r.gradient.map(n=>n/100)),matches:p.matches+1});
const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };

export class FilePolicy {
  constructor(file) { this.file=file; this.serial=Promise.resolve(); }
  async read() {
    if (!this.data) {
      try {
        const data = JSON.parse(await readFile(this.file,'utf8'));
        if (data.policy.version !== MODEL_VERSION || !isHead(data.policy.head)) throw Error('Invalid stored policy');
        this.data = data;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        this.data = {policy:initial(),receipts:{}};
      }
    }
    return this.data;
  }
  request(report) {
    const save = async () => {
      const data = await this.read();
      if (!report || data.receipts[report.id]) return data.policy;
      const receipts = Object.fromEntries(Object.entries(data.receipts).filter(([,expires])=>expires>Date.now()));
      receipts[report.id] = report.time+MAX_AGE;
      const updated = {policy:next(data.policy,report),receipts};
      await mkdir(dirname(this.file),{recursive:true});
      await writeFile(this.file+'.tmp',JSON.stringify(updated));
      await rename(this.file+'.tmp',this.file);
      this.data = updated;
      return updated.policy;
    };
    const pending = this.serial.then(save);
    this.serial = pending.catch(()=>{});
    return pending;
  }
}

// Redis runs this update atomically. The receipt lives until the report is too old
// to submit again. Render alone holds the credentials and contacts the datastore.
const updateScript = `
local raw = redis.call('GET',KEYS[1])
local p = cjson.decode(raw or ARGV[1])
if redis.call('EXISTS',KEYS[2]) == 1 then return raw end
local g = cjson.decode(ARGV[2])
for i,v in ipairs(g) do
  p.head[i] = math.max(-0.45,math.min(0.45,0.992*p.head[i]+0.14*v/100))
end
p.matches = p.matches+1
local out = cjson.encode(p)
redis.call('SET',KEYS[1],out)
redis.call('SET',KEYS[2],'1','PX',ARGV[3])
return out`;

export class RedisPolicy {
  constructor(url, token) { this.url=url; this.token=token; }
  async request(report) {
    const key = '{'+MODEL_VERSION+'}';
    const command = report ? ['EVAL',updateScript,2,key,key+':'+report.id,JSON.stringify(initial()),
      JSON.stringify(report.gradient),Math.max(1,report.time+MAX_AGE-Date.now())] : ['GET',key];
    const res = await fetch(this.url,{method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},
      body:JSON.stringify(command),signal:AbortSignal.timeout(6500)});
    if (!res.ok) throw Error('Learning store unavailable');
    const {result,error} = await res.json();
    if (error) throw Error('Learning store rejected update');
    return result ? JSON.parse(result) : initial();
  }
}

export function learningApi(store, pagesOrigin) {
  const buckets = new Map();
  let nextCleanup = 0;
  return async (req,res) => {
    try {
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Vary','Origin');
      const origin = req.headers.origin;
      if (origin && (origin === pagesOrigin || [`https://${req.headers.host}`,`http://${req.headers.host}`].includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin',origin);
      } else if (origin || req.headers['sec-fetch-site']==='cross-site') fail(403,'Unknown game origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods','GET, HEAD, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers','Content-Type');
        res.setHeader('Access-Control-Max-Age','600');
        res.writeHead(204).end();
        return;
      }
      // Wake the web service during the solo intro without accessing the model store.
      if (req.method === 'HEAD') { res.writeHead(204).end(); return; }
      let report;
      if (req.method === 'POST') {
        if (req.headers['content-type']?.split(';')[0] !== 'application/json') fail(415,'Expected JSON');
        const now = Date.now();
        if (now >= nextCleanup) {
          for (const [k,b] of buckets) if (b.until<=now) buckets.delete(k);
          nextCleanup=now+60_000;
        }
        const key = process.env.RENDER ? String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim() : req.socket.remoteAddress;
        const bucket = buckets.get(key) ?? {count:0,until:now+60_000};
        if (bucket.until<=now) { bucket.count=0; bucket.until=now+60_000; }
        if (++bucket.count>120) fail(429,'Try again later');
        buckets.set(key,bucket);
        let size=0, parts=[];
        for await (const part of req) {
          size+=part.length;
          if (size>1024) fail(413,'Report too large');
          parts.push(part);
        }
        try { report=JSON.parse(Buffer.concat(parts).toString()); } catch { fail(400,'Invalid match report'); }
        if (!validReport(report) || report.time<=now-MAX_AGE || report.time>now+300_000) fail(400,'Invalid match report');
      } else if (req.method !== 'GET') fail(405,'Unsupported method');
      res.end(JSON.stringify(await store.request(report)));
    } catch (err) {
      res.statusCode=err.status || 503;
      res.end(JSON.stringify({error:err.status?err.message:'Learning is temporarily unavailable'}));
    }
  };
}
