import {scan,prepare,VENUES,USDC} from './protocols.mjs';
import {PAGE} from './page.mjs';
const VERSION='pharos-multi-protocol-2026-11-07-v1';
const json=(x,status=200)=>Response.json(x,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const gate=new Map();
function limited(req,kind){
 const ip=(req.headers.get('cf-connecting-ip')||'unknown').slice(0,96),key=kind+':'+ip;
 const time=Date.now(),v=gate.get(key);
 if(!v||time-v.start>60000){gate.set(key,{start:time,count:1});return false;}
 v.count++;return v.count>(kind==='scan'?10:8);
}
async function body(req){
 const s=await req.text();if(s.length>1700)throw Error('Request too long');
 const parsed=JSON.parse(s);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Invalid JSON object');
 return parsed;
}
export default {
 async fetch(request){
  const path=new URL(request.url).pathname,method=request.method;
  if(method==='GET'&&path==='/'){
   return new Response(PAGE,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
  }
  if(method==='GET'&&path==='/api/health')
   return json({ok:true,version:VERSION,network:'Pharos Mainnet',chainId:1672,
    mcp:'https://mcp.pharos.xyz/mcp',fundsMove:false,requiresKey:false,
    capabilities:['live venue queries','wallet-specific position reads','USDC supply yield','unsigned deposit preparation','unsigned withdrawal preparation','live fallback and simulated offline test'],
    note:'Health confirms Worker availability, not live uptime of upstream protocols.'});
  if(method==='GET'&&path==='/api/venues')
   return json({ok:true,venues:Object.values(VENUES),asset:USDC,
    note:'On-chain rates can change. Protocol support is verified when /api/scan runs.'});
  if(method==='POST'&&path==='/api/scan'){
   if(limited(request,'scan'))return json({ok:false,error:'Rate limit: retry after 60 seconds'},429);
   try{const b=await body(request);return json(await scan(b));}
   catch(e){return json({ok:false,error:'Scan could not verify Mainnet: '+String(e.message||e).slice(0,250)},503);}
  }
  if(method==='POST'&&path==='/api/prepare'){
   if(limited(request,'prepare'))return json({ok:false,error:'Rate limit: retry after 60 seconds'},429);
   try{
    const b=await body(request),result=await prepare(b);
    return json(result);
   }catch(e){const message=String(e.message||e);
    return json({ok:false,error:message.slice(0,300),warning:'No transaction was signed or broadcast.'},400);}
  }
  return json({ok:false,error:'Not found'},404);
 }
};
