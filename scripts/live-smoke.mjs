import {scan} from '../src/protocols.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const normal=await scan({});
const failover=await scan({simulateUnavailable:'zona'});
const proof={schema:'pharos-multi-protocol-mcp-v1',checkedAtUtc:new Date().toISOString(),
 normal:{network:normal.network,chainId:normal.chainId,block:normal.blockNumber,
  venues:normal.venues.map(v=>({id:v.id,protocol:v.protocol,status:v.status,apyPct:v.apyPct??null,
   positionUSDC:v.positionUSDC??null,totalAssetsUSDC:v.totalAssetsUSDC??null,
   reason:v.reason??null})),route:normal.route},
 failover:{explicitlySimulated:true,venues:failover.venues.map(v=>({id:v.id,status:v.status,reason:v.reason||null})),
  route:failover.route},
 totalLiveProtocols:normal.venues.filter(v=>v.status==='available').length,
 note:'Actual protocol data via official Pharos Chain MCP; no transactions, signing or broadcast. Offline test is deliberately simulated.'};
await mkdir('proof',{recursive:true});await writeFile('proof/live-mcp.json',JSON.stringify(proof,null,2)+'\n');
console.log('MULTIPROTOCOL_LIVE_MCP_PROOF',JSON.stringify(proof));
if(proof.totalLiveProtocols<2)process.exitCode=1;
if(failover.venues.find(v=>v.id==='r25')?.status!=='available')process.exitCode=1;
