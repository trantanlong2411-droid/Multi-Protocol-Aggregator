import test from 'node:test';import assert from 'node:assert/strict';
import {Interface} from 'ethers';
import {validWallet,validateAmount,aprRayToApy,rankVenues,scan,prepare,USDC,VENUES} from '../src/protocols.mjs';
const WALLET='0x00000000000000000000000000000000000000a1';
const e20=new Interface(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function totalSupply() view returns(uint256)']);
const v=new Interface(['function asset() view returns(address)','function totalAssets() view returns(uint256)',
'function decimals() view returns(uint8)','function previewRedeem(uint256) view returns(uint256)',
'function maxDeposit(address) view returns(uint256)','function maxWithdraw(address) view returns(uint256)',
'function balanceOf(address) view returns(uint256)']);
const p=new Interface(['function getReserveData(address) view returns(tuple(uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))']);
const ATOKEN='0x00000000000000000000000000000000000000b2';
function testClient({broken=null,allowance=0n}={}){
 const t={name:'test'};
 return async()=>({
  list:async()=>['get_chain_info','get_code','eth_call','get_block'].map(name=>({name})),
  tool:async(name,args={})=>{
   if(name==='get_chain_info')return {chainId:1672,chainIdMatches:true,latestBlock:'5000000'};
   if(name==='get_code'){
    if(broken==='zona'&&args.address.toLowerCase()===VENUES.zona.contract.toLowerCase())throw Error('Zona RPC is down');
    return {code:'0x6001600155'};}
   if(name==='get_block')return {timestamp:args.block==='4400000'?'0x16785ba0':'0x167f3d00'};
   if(name!=='eth_call')throw Error('Unexpected mock call');
   const to=args.transaction.to.toLowerCase(),data=args.transaction.data;
   function reply(iface,method,result){return {result:iface.encodeFunctionResult(method,result)};}
   if(to===VENUES.r25.contract.toLowerCase()){
    for(const [method,value] of [
     ['asset',[USDC]],['totalAssets',[1000000000n]],['decimals',[18]],
     ['balanceOf',[3000000000000000000n]],['previewRedeem',[args.block==='4400000'?995000n:1000000n]],
     ['maxWithdraw',[2000000n]],['maxDeposit',[100000000n]]
    ])if(data.startsWith(v.getFunction(method).selector))return reply(v,method,value);
   }
   if(to===VENUES.zona.contract.toLowerCase()){
    if(data.startsWith(p.getFunction('getReserveData').selector))
     return reply(p,'getReserveData',[[
      0n,10n**27n,50000000000000000000000000n,10n**27n,0n,0n,0n,0n,
      ATOKEN,'0x0000000000000000000000000000000000000001','0x0000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000003',0n,0n,0n
     ]]);
    return {result:'0x'+''.padStart(64,'0')};
   }
   if(to===ATOKEN.toLowerCase()){
    if(data.startsWith(e20.getFunction('balanceOf').selector))return reply(e20,'balanceOf',[10000000n]);
    if(data.startsWith(e20.getFunction('totalSupply').selector))return reply(e20,'totalSupply',[90000000n]);
   }
   if(to===USDC.toLowerCase()){
    if(data.startsWith(e20.getFunction('balanceOf').selector))return reply(e20,'balanceOf',[100000000n]);
    if(data.startsWith(e20.getFunction('allowance').selector))return reply(e20,'allowance',[allowance]);
   }
   throw Error('Unknown mock calldata '+to+' '+data.slice(0,10));
  },
  close:async()=>{}
 });
}
test('strict EVM wallet and precise USDC amount validation',()=>{
 assert.equal(validWallet(WALLET)?.toLowerCase(),WALLET.toLowerCase());
 assert.equal(validWallet('bad'),null);
 assert.equal(validateAmount('1.000001'),1000001n);
 assert.throws(()=>validateAmount('-2'));assert.throws(()=>validateAmount('0'));
 assert.throws(()=>validateAmount('1.0000001'));
});
test('APR ray to APY uses Aave V3 convention',()=>{
 const rate=aprRayToApy(50000000000000000000000000n);
 assert.ok(rate>5 && rate<5.2);
 assert.equal(aprRayToApy(0n),0);
});
test('routing ranks verified APY and respects R25 queue penalty',()=>{
 const row=(id,apyPct)=>({id,name:id,status:'available',apyPct,maxWithdrawUSDC:'10',positionUSDC:'10'});
 const r=rankVenues([row('r25',7),row('zona',6)]);
 assert.equal(r.selected,'zona');assert.match(r.reason,/penalty/);
 assert.equal(rankVenues([row('r25',null)],'deposit').selected,'r25');
 assert.equal(rankVenues([{id:'zona',status:'unavailable'}]).selected,null);
});
test('real adapters can both answer through one MCP session',async()=>{
 const data=await scan({wallet:WALLET},testClient());
 assert.equal(data.venues.length,2);
 assert.deepEqual(data.venues.map(x=>x.status),['available','available']);
 assert.ok(data.venues.every(x=>x.positionUSDC!==null));
 assert.ok(Number(data.venues[1].apyPct)>5);
 assert.equal(data.testMode,false);
});
test('one broken venue does not erase the other',async()=>{
 const data=await scan({wallet:WALLET},testClient({broken:'zona'}));
 assert.equal(data.venues[0].status,'available');
 assert.equal(data.venues[1].status,'unavailable');
 assert.equal(data.route.selected,'r25');
});
test('simulated unavailable venue is explicitly labeled',async()=>{
 const data=await scan({simulateUnavailable:'zona'},testClient());
 assert.equal(data.venues[1].status,'simulated-unavailable');
 assert.equal(data.venues[0].status,'available');
 assert.equal(data.testMode,true);
});
test('prepare exact deposit approval and unsigned transaction for Zona',async()=>{
 const data=await prepare({wallet:WALLET,action:'deposit',venue:'zona',amount:'1'},testClient());
 assert.equal(data.ok,true);assert.equal(data.broadcast,false);assert.equal(data.signed,false);
 assert.equal(data.steps.length,2);
 assert.equal(data.preflight,'NEEDS_USER_APPROVAL');
 assert.equal(data.steps[1].transaction.chainId,1672);
});
test('withdrawal is refused if a venue has too little withdrawable balance',async()=>{
 await assert.rejects(prepare({wallet:WALLET,action:'withdraw',venue:'r25',amount:'10'},testClient()),/maxWithdraw/);
});
test('withdrawal from Zona prepares unsigned transaction after preflight',async()=>{
 const data=await prepare({wallet:WALLET,action:'withdraw',venue:'zona',amount:'1'},testClient());
 assert.equal(data.preflight,'READ_ONLY_CALL_PASSED');
 assert.equal(data.steps.length,1);
});
