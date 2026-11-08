(function(){
  const YOCTO_PER_NEAR=10n**24n,CONTRACT_DEPOSIT=(5n*YOCTO_PER_NEAR).toString(),GAS='100000000000000';
  const slug=value=>String(value||'culture').toLowerCase().replace(/[^a-z0-9_-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,24)||'culture';
  const units=(value,decimals)=>{const digits=String(value||'0').replace(/[^0-9]/g,'')||'0';return(BigInt(digits)*10n**BigInt(decimals||0)).toString()};
  const child=(prefix,owner)=>`${slug(prefix)}.${owner}`;
  async function code(path){const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error(`Contract artifact unavailable: ${path}`);return new Uint8Array(await response.arrayBuffer())}
  function modes(draft){return{token:draft.origin==='token'||draft.origin==='twin',nft:draft.origin==='nft'||draft.origin==='twin'}}
  function preview(draft,owner){const need=modes(draft),ticker=draft.token?.ticker||draft.ticker||'culture',symbol=draft.nft?.symbol||draft.ticker||'culture';return{need,tokenContractId:need.token?child(`${ticker}-token`,owner):null,nftContractId:need.nft?child(`${symbol}-nft`,owner):null,depositNear:(Number(need.token)+Number(need.nft))*5}}
  async function build(draft,owner){const p=preview(draft,owner),transactions=[];
    if(p.need.token){const token=draft.token||{},decimals=Number(token.decimals||18);transactions.push({signerId:owner,receiverId:p.tokenContractId,actions:[{type:'CreateAccount'},{type:'Transfer',params:{deposit:CONTRACT_DEPOSIT}},{type:'DeployContract',params:{code:await code('./contracts/totem_token.wasm')}},{type:'FunctionCall',params:{methodName:'new',args:{owner_id:owner,total_supply:units(token.supply,decimals),name:token.name||draft.name||'Culture Token',symbol:token.ticker||draft.ticker||'CULTURE',decimals},gas:GAS,deposit:'0'}}]})}
    if(p.need.nft){const nft=draft.nft||{};transactions.push({signerId:owner,receiverId:p.nftContractId,actions:[{type:'CreateAccount'},{type:'Transfer',params:{deposit:CONTRACT_DEPOSIT}},{type:'DeployContract',params:{code:await code('./contracts/totem_nft.wasm')}},{type:'FunctionCall',params:{methodName:'new',args:{owner_id:owner,name:nft.name||draft.name||'Culture Collection',symbol:nft.symbol||draft.ticker||'CULTURE',base_uri:null},gas:GAS,deposit:'0'}}]})}
    return{...p,transactions};
  }
  async function deploy(draft,owner){const plan=await build(draft,owner);if(plan.transactions.length){const wallet=await window.totemWallet.selector.wallet();plan.results=await wallet.signAndSendTransactions({transactions:plan.transactions})}return plan}
  window.totemDeploy={preview,build,deploy};
})();
