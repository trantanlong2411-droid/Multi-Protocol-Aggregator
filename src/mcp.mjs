// Fixed official Pharos read-only hosted MCP endpoint, Streamable HTTP.
export const MCP_URL='https://mcp.pharos.xyz/mcp';
const VERSION='2025-03-26';
function parseStream(text,id){
 for(const chunk of text.replace(/\r\n/g,'\n').split(/\n\n+/)){
  const s=chunk.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trim()).join('\n');
  if(!s)continue;try{const j=JSON.parse(s);if(j.id===id)return j;}catch{}
 }
 throw Error('MCP SSE response missing matching ID');
}
export function unwrap(reply,tool){
 if(!reply||reply.isError)throw Error(tool+' returned an MCP tool error: '+JSON.stringify(reply?.content||[]).slice(0,180));
 const structured=reply.structuredContent;
 if(structured && typeof structured==='object'){
  if(structured.error||structured.mcpError)throw Error(tool+': '+JSON.stringify(structured.error||structured.mcpError));
  if(structured.chainId!==undefined||structured.result!==undefined||structured.code!==undefined)return structured;
 }
 const raw=reply.content?.find(x=>x.type==='text')?.text;
 if(typeof raw!=='string')throw Error(tool+' returned no JSON result');
 const data=JSON.parse(raw);
 if(data===null)throw Error(tool+' returned null');
 if(data.error||data.mcpError)throw Error(tool+': '+String(data.error?.message||data.mcpError?.message||'RPC rejected'));
 return data;
}
export async function connect(fetcher=fetch){
 let session='',version=VERSION,id=0,closed=false;
 async function command(method,params={},notify=false){
  if(closed)throw Error('MCP session closed');
  const rid=notify?null:++id;
  const body={jsonrpc:'2.0',...(!notify?{id:rid}:{}),method,...(!notify?{params}:{})};
  const r=await fetcher(MCP_URL,{method:'POST',headers:{
   'content-type':'application/json','accept':'application/json, text/event-stream',
   'mcp-protocol-version':version,...(session?{'mcp-session-id':session}:{})
  },body:JSON.stringify(body),signal:AbortSignal.timeout(22000)});
  if(!r.ok)throw Error('Chain MCP HTTP '+r.status+': '+(await r.text()).slice(0,150));
  session=r.headers.get('mcp-session-id')||session;
  if(notify){await r.text();return null;}
  const raw=await r.text();if(raw.length>900000)throw Error('Chain MCP result too large');
  const msg=(r.headers.get('content-type')||'').includes('event-stream')?parseStream(raw,rid):JSON.parse(raw);
  if(msg.id!==rid)throw Error('MCP response ID mismatch');
  if(msg.error)throw Error('Chain MCP '+String(msg.error.message||'protocol error'));
  return msg.result;
 }
 const init=await command('initialize',{protocolVersion:version,capabilities:{},
  clientInfo:{name:'multi-protocol-aggregator',version:'1.0.0'}});
 if(init?.protocolVersion)version=String(init.protocolVersion);
 await command('notifications/initialized',{},true);
 return {
  list:async()=>{const r=await command('tools/list');return r.tools||[];},
  tool:async(name,args={})=>unwrap(await command('tools/call',{name,arguments:args}),name),
  close:async()=>{closed=true;if(session)try{await fetcher(MCP_URL,{method:'DELETE',
   headers:{'mcp-session-id':session,'mcp-protocol-version':version},signal:AbortSignal.timeout(2500)});}catch{}}
 };
}
