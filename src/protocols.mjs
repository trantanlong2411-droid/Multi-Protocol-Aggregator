import {Interface,getAddress,isAddress,parseUnits,formatUnits} from 'ethers';
import {connect,MCP_URL} from './mcp.mjs';
export const CHAIN=1672;
export const USDC='0xC879C018dB60520F4355C26eD1a6D572cdAC1815';
export const VENUES=Object.freeze({
 r25:{id:'r25',name:'R25 Axil Credit Vault',protocol:'R25',type:'ERC-4626 credit vault',
  contract:'0x1c2bc8b553d9a7e61f7531a3a4bf2162f4569268',asset:USDC,withdrawalTerms:'A 7-day redemption queue/lockup may apply. Immediate withdrawal must be confirmed on-chain.',source:'https://app.r25.xyz/vaults'},
 zona:{id:'zona',name:'Zona USDC Lending',protocol:'Zona',type:'Aave V3-style lending pool',
  contract:'0xda464e68208A3083Eb65FE5c522a72AeD1C1372a',asset:USDC,withdrawalTerms:'Withdrawals depend on current pool liquidity and the borrower health factor.',source:'https://app.zona.finance'}
});
const erc20=new Interface(['function balanceOf(address) view returns (uint256)','function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)','function totalSupply() view returns (uint256)']);
const vault=new Interface([
 'function asset() view returns (address)',
 'function totalAssets() view returns (uint256)',
 'function decimals() view returns (uint8)',
 'function totalSupply() view returns (uint256)',
 'function balanceOf(address) view returns (uint256)',
 'function previewRedeem(uint256) view returns (uint256)',
 'function maxDeposit(address) view returns (uint256)',
 'function maxWithdraw(address) view returns (uint256)',
 'function deposit(uint256,address) returns (uint256)',
 'function withdraw(uint256,address,address) returns (uint256)'
]);
const pool=new Interface([
 'function getReserveData(address) view returns (tuple(uint256 configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,uint128 unbacked,uint128 isolationModeTotalDebt))',
 'function supply(address,uint256,address,uint16)',
 'function withdraw(address,uint256,address) returns (uint256)'
]);
export function validWallet(address){return typeof address==='string'&&isAddress(address)?getAddress(address):null;}
export function validateAmount(input){
 if(typeof input!=='string'||!/^\d{1,8}(?:\.\d{1,6})?$/.test(input))throw Error('Enter a positive USDC amount, up to six decimals');
 const raw=parseUnits(input,6);if(raw<=0n||raw>10000000000000n)throw Error('Amount outside allowed 0-10 million USDC range');
 return raw;
}
function human(n,decimals=6){return formatUnits(BigInt(n),decimals);}
function take(value,bits=256){if(typeof value!=='string'||!/^0x[0-9a-fA-F]+$/.test(value))throw Error('Invalid hex on-chain response');return BigInt(value);}
async function call(cli,address,iface,method,args=[],block='latest',from=null){
 const data=iface.encodeFunctionData(method,args);
 const transaction={to:address,data,...(from?{from}:{})};
 const result=await cli.tool('eth_call',{transaction,block});
 if(typeof result?.result!=='string'||result.result==='0x')throw Error(method+' returned empty data');
 return iface.decodeFunctionResult(method,result.result);
}
async function codeExists(cli,address){
 const reply=await cli.tool('get_code',{address});
 if(!/^0x[0-9a-f]+$/i.test(reply?.code||'')||reply.code==='0x')throw Error('Contract bytecode not available at '+address);
 return true;
}
function annualizedFromShareHistory(nowShares,olderShares,seconds){
 if(olderShares<=0n||nowShares<=0n||seconds<=86400)return null;
 const ratio=Number(nowShares)/Number(olderShares);
 const annual=((ratio**(31536000/seconds))-1)*100;
 return Number.isFinite(annual)&&annual>=-100&&annual<10000?Number(annual.toFixed(4)):null;
}
export function aprRayToApy(ray){
 const n=Number(BigInt(ray));
 const apr=n/1e27;
 if(!Number.isFinite(apr)||apr<0||apr>10)throw Error('Unreasonable Aave liquidity rate');
 const seconds=31536000;
 return Number(((Math.expm1(seconds*Math.log1p(apr/seconds)))*100)).toFixed(4));
}
async function scanR25(cli,wallet,blockNum){
 const v=VENUES.r25;
 await codeExists(cli,v.contract);
 const asset=(await call(cli,v.contract,vault,'asset'))[0];
 if(asset.toLowerCase()!==USDC.toLowerCase())throw Error('R25 underlying is not verified Circle USDC');
 const totalAssets=(await call(cli,v.contract,vault,'totalAssets'))[0];
 const shareDecimals=Number((await call(cli,v.contract,vault,'decimals'))[0]);
 if(shareDecimals<6||shareDecimals>24)throw Error('R25 share decimals unexpected');
 const oneShare=10n**BigInt(shareDecimals);
 const shareValue=(await call(cli,v.contract,vault,'previewRedeem',[oneShare]))[0];
 let yieldRate=null,yieldNote='Historical share-price reading not verified; APY unavailable.';
 const pastBlock=Math.max(1,blockNum-600000);
 try{
  const past=await cli.tool('get_block',{block:String(pastBlock),includeTransactions:false});
  const current=await cli.tool('get_block',{block:String(blockNum),includeTransactions:false});
  const previousPrice=(await call(cli,v.contract,vault,'previewRedeem',[oneShare],String(pastBlock)))[0];
  yieldRate=annualizedFromShareHistory(shareValue,previousPrice,Number(take(current.timestamp)-take(past.timestamp)));
  if(yieldRate!==null)yieldNote='Realized share-price annualization between blocks '+pastBlock+' and '+blockNum+'; not a guaranteed forward yield.';
 }catch(e){yieldNote='No verifiable historical price available: '+String(e.message||e).slice(0,90);}
 const position=wallet?(await call(cli,v.contract,vault,'balanceOf',[wallet]))[0]:null;
 let positionAssets=null,withdrawMax=null,depositMax=null,walletUSDC=null;
 if(wallet){
  if(position!==null && position>0n)positionAssets=(await call(cli,v.contract,vault,'previewRedeem',[position]))[0];
  else positionAssets=0n;
  try{withdrawMax=(await call(cli,v.contract,vault,'maxWithdraw',[wallet]))[0];}catch{}
  try{depositMax=(await call(cli,v.contract,vault,'maxDeposit',[wallet]))[0];}catch{}
  walletUSDC=(await call(cli,USDC,erc20,'balanceOf',[wallet]))[0];
 }
 return {id:'r25',name:v.name,protocol:v.protocol,contract:v.contract,asset:USDC,status:'available',
  type:v.type,apyPct:yieldRate,rateLabel:yieldNote,totalAssetsUSDC:human(totalAssets),
  sharePriceUSDC:human(shareValue),sharesDecimals:shareDecimals,
  positionUSDC:positionAssets===null?null:human(positionAssets),
  shares:position===null?null:human(position,shareDecimals),
  maxWithdrawUSDC:withdrawMax===null?null:human(withdrawMax),
  maxDepositUSDC:depositMax===null?null:human(depositMax),
  walletUSDC:walletUSDC===null?null:human(walletUSDC),
  risk:'Private credit + redemption queue; not instantly liquid',withdrawalTerms:v.withdrawalTerms,
  quoteType:'ERC-4626 shares; APY uses history only when verified',source:v.source,
  explorer:'https://pharosscan.xyz/address/'+v.contract};
}
async function scanZona(cli,wallet){
 const v=VENUES.zona;
 await codeExists(cli,v.contract);
 const reserve=(await call(cli,v.contract,pool,'getReserveData',[USDC]))[0];
 const rate=reserve.currentLiquidityRate;
 const aToken=reserve.aTokenAddress;
 if(!validWallet(aToken)||aToken==='0x0000000000000000000000000000000000000000')throw Error('Zona reserve has no valid aToken');
 await codeExists(cli,aToken);
 const totalAssets=(await call(cli,aToken,erc20,'totalSupply'))[0];
 const position=wallet?(await call(cli,aToken,erc20,'balanceOf',[wallet]))[0]:null;
 const walletUSDC=wallet?(await call(cli,USDC,erc20,'balanceOf',[wallet]))[0]:null;
 return {id:'zona',name:v.name,protocol:v.protocol,type:v.type,contract:v.contract,asset:USDC,
  aToken:getAddress(aToken),status:'available',apyPct:aprRayToApy(rate),
  rateLabel:'Live variable USDC supply liquidity rate (RAY), annualized using Aave V3 convention. Not guaranteed.',
  totalAssetsUSDC:human(totalAssets),sharePriceUSDC:null,
  positionUSDC:position===null?null:human(position),
  maxWithdrawUSDC:position===null?null:human(position),
  maxDepositUSDC:null,walletUSDC:walletUSDC===null?null:human(walletUSDC),
  risk:'Variable interest, utilization and borrower liquidation/liquidity risks',withdrawalTerms:v.withdrawalTerms,
  quoteType:'Aave-style variable reserve supply rate',source:v.source,
  explorer:'https://pharosscan.xyz/address/'+v.contract};
}
export function rankVenues(venues,action='deposit'){
 const live=venues.filter(v=>v.status==='available');
 if(!live.length)return {selected:null,reason:'No available protocol; no route selected.',alternatives:[]};
 if(action==='withdraw'){
  const candidates=live.filter(v=>v.positionUSDC!==null&&Number(v.positionUSDC)>0&&Number(v.maxWithdrawUSDC||0)>0);
  if(!candidates.length)return {selected:null,reason:'No verified withdrawable position available. Positions cannot be withdrawn from a different protocol.',alternatives:live.map(v=>v.id)};
  candidates.sort((a,b)=>Number(b.maxWithdrawUSDC)-Number(a.maxWithdrawUSDC));
  return {selected:candidates[0].id,reason:'Matched an existing withdrawable wallet position; withdrawals cannot be rerouted across protocols.',alternatives:candidates.map(v=>v.id)};
 }
 const rated=live.filter(v=>v.apyPct!==null&&Number.isFinite(v.apyPct));
 if(rated.length){
  const scored=[...rated].sort((a,b)=>{
    const aPenalty=a.id==='r25'?1.5:0,bPenalty=b.id==='r25'?1.5:0;
    return (b.apyPct-bPenalty)-(a.apyPct-aPenalty);
  });
  const best=scored[0];
  return {selected:best.id,reason:best.name+' ranks highest among verifiable yields after a disclosed 1.5 percentage-point illiquidity penalty for the R25 redemption queue. This is a transparent heuristic, not a guarantee of safety or returns.',alternatives:live.map(v=>v.id)};
 }
 if(live.length===1)return {selected:live[0].id,reason:'Only '+live[0].name+' is available. Rate comparison could not be verified; do not infer it has the best yield.',alternatives:[live[0].id]};
 return {selected:null,reason:'Neither protocol has a verified comparable rate; select a protocol manually.',alternatives:live.map(v=>v.id)};
}
export async function scan(input={},connectFn=connect){
 const wallet=input.wallet?validWallet(input.wallet):null;
 if(input.wallet&&!wallet)throw Error('Invalid EVM wallet address');
 const disabled=['r25','zona'].includes(input.simulateUnavailable)?input.simulateUnavailable:null;
 let cli;const started=new Date().toISOString();
 try{
  cli=await connectFn();const names=(await cli.list()).map(x=>x.name);
  for(const n of ['get_chain_info','get_code','eth_call'])if(!names.includes(n))throw Error('Chain MCP missing '+n);
  const chain=await cli.tool('get_chain_info');
  if(Number(chain.chainId)!==CHAIN||chain.chainIdMatches===false)throw Error('Expected Pharos Mainnet chain ID 1672');
  const venues=[];
  for(const [id,scanner] of [['r25',()=>scanR25(cli,wallet,Number(chain.latestBlock))],['zona',()=>scanZona(cli,wallet)]]){
   if(id===disabled){venues.push({id,protocol:VENUES[id].protocol,name:VENUES[id].name,status:'simulated-unavailable',
    reason:'Deliberate offline test: this venue is excluded, other protocol is still queried live.',source:VENUES[id].source});continue;}
   try{venues.push(await scanner());}
   catch(e){venues.push({id,protocol:VENUES[id].protocol,name:VENUES[id].name,status:'unavailable',
     reason:String(e.message||e).slice(0,200),source:VENUES[id].source});}
  }
  return {ok:true,network:'Pharos Mainnet',chainId:CHAIN,blockNumber:chain.latestBlock,
   observedAtUtc:started,wallet,asset:{symbol:'USDC',decimals:6,address:USDC},
   venues,route:rankVenues(venues),withdrawRoute:rankVenues(venues,'withdraw'),
   evidence:'Real read-only calls through official Chain MCP. No mocked market numbers.',
   testMode:!!disabled,readOnly:true};
 }finally{if(cli)await cli.close().catch(()=>{});}
}
export async function prepare(input={},connectFn=connect){
 const wallet=validWallet(input.wallet);
 if(!wallet)throw Error('Enter a valid wallet address to prepare an unsigned transaction');
 const action=input.action;
 if(!['deposit','withdraw'].includes(action))throw Error('Choose deposit or withdraw');
 const amount=validateAmount(input.amount);
 const id=input.venue;
 if(!VENUES[id])throw Error('Select a supported protocol');
 let cli;
 try{
  cli=await connectFn();
  const chain=await cli.tool('get_chain_info');
  if(Number(chain.chainId)!==CHAIN||chain.chainIdMatches===false)throw Error('Wrong blockchain');
  const inspected=id==='r25'?await scanR25(cli,wallet,Number(chain.latestBlock)):await scanZona(cli,wallet);
  const venue=VENUES[id],steps=[],warnings=[venue.withdrawalTerms];
  let transaction=null,preflight='NOT_RUN';
  const usdcBalance=(await call(cli,USDC,erc20,'balanceOf',[wallet]))[0];
  if(action==='deposit'){
   if(usdcBalance<amount)throw Error('Wallet has insufficient on-chain USDC for the deposit.');
   if(id==='r25'){
    const limit=(await call(cli,venue.contract,vault,'maxDeposit',[wallet]))[0];
    if(limit<amount)throw Error('R25 maxDeposit is below requested amount; wallet may be ineligible, or vault may be capped.');
    transaction={chainId:CHAIN,from:wallet,to:venue.contract,value:'0x0',data:vault.encodeFunctionData('deposit',[amount,wallet])};
   }else{
    transaction={chainId:CHAIN,from:wallet,to:venue.contract,value:'0x0',data:pool.encodeFunctionData('supply',[USDC,amount,wallet,0])};
   }
   const allowance=(await call(cli,USDC,erc20,'allowance',[wallet,venue.contract]))[0];
   if(allowance<amount){
    if(allowance>0n)steps.push({name:'Reset USDC allowance before setting a new exact amount (if token requires reset)',transaction:{chainId:CHAIN,from:wallet,to:USDC,value:'0x0',data:erc20.encodeFunctionData('approve',[venue.contract,0n])}});
    steps.push({name:'Approve exact USDC amount to '+venue.name,transaction:{chainId:CHAIN,from:wallet,to:USDC,value:'0x0',data:erc20.encodeFunctionData('approve',[venue.contract,amount])}});
    warnings.push('Deposit requires a separate approval transaction signed first. No post-approval preflight is possible until the approval is mined.');
    preflight='NEEDS_USER_APPROVAL';
   }else{
    try{await cli.tool('eth_call',{transaction,block:'latest'});preflight='READ_ONLY_CALL_PASSED';}
    catch(e){throw Error('Deposit preflight reverted: '+String(e.message||e).slice(0,150));}
   }
   steps.push({name:'Deposit '+input.amount+' USDC into '+venue.name,transaction});
  }else{
   if(id==='r25'){
    const max=(await call(cli,venue.contract,vault,'maxWithdraw',[wallet]))[0];
    if(max<amount)throw Error('R25 immediate maxWithdraw is below the requested amount. Use the official vault withdrawal queue; this demo will not invent a queue call.');
    transaction={chainId:CHAIN,from:wallet,to:venue.contract,value:'0x0',data:vault.encodeFunctionData('withdraw',[amount,wallet,wallet])};
   }else{
    const balance=(await call(cli,inspected.aToken,erc20,'balanceOf',[wallet]))[0];
    if(balance<amount)throw Error('Zona supplied position is below the requested amount; funds cannot be withdrawn from a different venue.');
    transaction={chainId:CHAIN,from:wallet,to:venue.contract,value:'0x0',data:pool.encodeFunctionData('withdraw',[USDC,amount,wallet])};
   }
   try{await cli.tool('eth_call',{transaction,block:'latest'});preflight='READ_ONLY_CALL_PASSED';}
   catch(e){throw Error('Withdrawal preflight reverted: '+String(e.message||e).slice(0,180));}
   steps.push({name:'Withdraw '+input.amount+' USDC from '+venue.name,transaction});
  }
  return {ok:true,mode:'UNSIGNED_PREPARATION_ONLY',action,amountUSDC:input.amount,
   chosenVenue:id,protocol:venue.protocol,why:'Explicit user venue selection; verified deployed USDC contract and wallet position/limits at preparation time.',
   wallet,network:'Pharos Mainnet',chainId:CHAIN,blockNumber:chain.latestBlock,
   preflight,steps,warnings,readOnly:true,broadcast:false,signed:false,receipt:null,
   note:'Prepared transactions are inert JSON. The app cannot sign or broadcast; the user must review and sign with their own wallet externally. Conditions may change.'};
 }finally{if(cli)await cli.close().catch(()=>{});}
}
