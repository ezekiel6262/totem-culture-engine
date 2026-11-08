(function(){
  const YOCTO_PER_NEAR=10n**24n,CONTRACT_DEPOSIT=(5n*YOCTO_PER_NEAR).toString(),GAS='100000000000000';
  const slug=value=>String(value||'culture').toLowerCase().replace(/[^a-z0-9_-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,24)||'culture';
  const units=(value,decimals)=>{const digits=String(value||'0').replace(/[^0-9]/g,'')||'0';return(BigInt(digits)*10n**BigInt(decimals||0)).toString()};
  const accountPattern=/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
  const allocationLabels=['Community','Liquidity','Treasury','Creator'];
  function tokenAllocations(token){
    const split=(token.split||[]).map(Number),destinations=token.destinations||[];
    if(split.length!==4||split.some(v=>!Number.isInteger(v)||v<=0)||split.reduce((a,b)=>a+b,0)!==100)throw new Error('Token allocation must contain four positive percentages totalling 100%.');
    if(destinations.length!==4||destinations.some(id=>!accountPattern.test(String(id||''))))throw new Error('Enter a valid NEAR destination account for every token allocation.');
    if(new Set(destinations).size!==4)throw new Error('Each token allocation needs a unique custody account.');
    const decimals=Number(token.decimals||18),total=BigInt(units(token.supply,decimals));
    if(total<=0n)throw new Error('Token supply must be greater than zero.');
    const amounts=[],allocated=split.slice(0,3).reduce((sum,pct)=>{const amount=total*BigInt(pct)/100n;amounts.push(amount);return sum+amount},0n);amounts.push(total-allocated);
    const months=Math.max(0,Number.parseInt(String(token.vesting||'0'),10)||0),creatorUnlock=months?Date.now()+months*30*86400000:null;
    return allocationLabels.map((role,i)=>({role,account_id:destinations[i],amount:amounts[i].toString(),unlock_at_ms:i===3?creatorUnlock:null}));
  }
  const child=(prefix,owner)=>`${slug(prefix)}.${owner}`;
  async function code(path){const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error(`Contract artifact unavailable: ${path}`);return new Uint8Array(await response.arrayBuffer())}
  function modes(draft){return{token:draft.origin==='token'||draft.origin==='twin',nft:draft.origin==='nft'||draft.origin==='twin'}}
  function preview(draft,owner){const need=modes(draft),ticker=draft.token?.ticker||draft.ticker||'culture',symbol=draft.nft?.symbol||draft.ticker||'culture';return{need,tokenContractId:need.token?child(`${ticker}-token`,owner):null,nftContractId:need.nft?child(`${symbol}-nft`,owner):null,depositNear:(Number(need.token)+Number(need.nft))*5}}
  async function build(draft,owner){const p=preview(draft,owner),transactions=[];
    if(p.need.token){const token=draft.token||{},decimals=Number(token.decimals||18),allocations=tokenAllocations(token).map(({account_id,amount,unlock_at_ms})=>({account_id,amount,unlock_at_ms}));transactions.push({signerId:owner,receiverId:p.tokenContractId,actions:[{type:'CreateAccount'},{type:'Transfer',params:{deposit:CONTRACT_DEPOSIT}},{type:'DeployContract',params:{code:await code('./contracts/totem_token.wasm')}},{type:'FunctionCall',params:{methodName:'new',args:{owner_id:owner,total_supply:units(token.supply,decimals),name:token.name||draft.name||'Culture Token',symbol:token.ticker||draft.ticker||'CULTURE',decimals,allocations},gas:GAS,deposit:'0'}}]})}
    if(p.need.nft){const nft=draft.nft||{};transactions.push({signerId:owner,receiverId:p.nftContractId,actions:[{type:'CreateAccount'},{type:'Transfer',params:{deposit:CONTRACT_DEPOSIT}},{type:'DeployContract',params:{code:await code('./contracts/totem_nft.wasm')}},{type:'FunctionCall',params:{methodName:'new',args:{owner_id:owner,name:nft.name||draft.name||'Culture Collection',symbol:nft.symbol||draft.ticker||'CULTURE',base_uri:null},gas:GAS,deposit:'0'}}]})}
    return{...p,transactions};
  }
  async function deploy(draft,owner){const plan=await build(draft,owner);if(plan.transactions.length){const wallet=await window.totemWallet.selector.wallet();plan.results=await wallet.signAndSendTransactions({transactions:plan.transactions})}return plan}
  window.totemDeploy={preview,build,deploy,tokenAllocations};
})();
