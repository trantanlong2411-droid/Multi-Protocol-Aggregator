import assert from 'node:assert/strict';
const base=(process.env.WORKER_URL||'https://multi-protocol-aggregator.trantanlong2411.workers.dev').replace(/\/$/,'');
const version='pharos-multi-protocol-2026-11-07-v1';
async function get(path){const r=await fetch(base+path,{cache:'no-store',signal:AbortSignal.timeout(18000)});return {status:r.status,data:await r.json()};}
async function post(path,data){const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify(data),signal:AbortSignal.timeout(90000)});
 return {status:r.status,data:await r.json()};}
let health;
for(let i=0;i<20;i++){
 try{health=await get('/api/health');if(health.status===200&&health.data.version===version)break;
  console.log('WAIT_FOR_DEPLOY',i,health.status,health.data.version||health.data.error||'unknown');}
 catch(e){console.log('WAIT_FOR_DEPLOY',i,String(e.message||e).slice(0,160));}
 await new Promise(done=>setTimeout(done,4000));
}
assert.equal(health?.status,200);assert.equal(health.data.version,version);
const scan=await post('/api/scan',{});
assert.equal(scan.status,200,JSON.stringify(scan.data).slice(0,200));
assert.equal(scan.data.ok,true);assert.equal(scan.data.chainId,1672);
assert.equal(scan.data.venues.length,2);
assert.equal(scan.data.venues.filter(v=>v.status==='available').length,2,
 'Both independent protocols must work on production: '+JSON.stringify(scan.data.venues).slice(0,650));
const offline=await post('/api/scan',{simulateUnavailable:'zona'});
assert.equal(offline.status,200);assert.equal(offline.data.testMode,true);
assert.equal(offline.data.venues.find(v=>v.id==='zona').status,'simulated-unavailable');
assert.equal(offline.data.venues.find(v=>v.id==='r25').status,'available');
assert.equal(offline.data.route.selected,'r25');
const page=await fetch(base,{signal:AbortSignal.timeout(15000)});
assert.equal(page.status,200);assert.match(await page.text(),/Multi-Protocol Aggregator/);
console.log('MULTIPROTOCOL_DEPLOYED_PROOF',JSON.stringify({base,version,
 status:'PASS',venues:scan.data.venues.map(v=>({id:v.id,apyPct:v.apyPct,status:v.status})),
 route:scan.data.route,isolatedFailure:true,readOnly:true}));
