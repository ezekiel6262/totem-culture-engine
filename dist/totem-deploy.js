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
  const resolveAccount=(value,owner)=>String(value||'').trim()==='@creator'?owner:String(value||'').trim().toLowerCase();
  const percentBps=value=>Math.round(Number.parseFloat(String(value||'0').replace('%',''))*100);
  const nearToYocto=value=>{const match=String(value||'0').replace(/,/g,'').match(/\d+(?:\.\d+)?/);if(!match)return'0';const[whole,fraction='']=match[0].split('.');return(BigInt(whole)*YOCTO_PER_NEAR+BigInt((fraction+'0'.repeat(24)).slice(0,24))).toString()};
  function nftLaunchConfig(nft,owner){
    const max_supply=Number.parseInt(String(nft.supply||'').replace(/,/g,''),10),mint_price=nft.mintModel==='Free claim'?'0':nearToYocto(nft.mintPrice||nft.price),creator_royalty_bps=percentBps(nft.royalty),treasury_royalty_bps=percentBps(nft.treasuryRoyalty),creator_royalty_receiver_id=resolveAccount(nft.royaltyRecipient||'@creator',owner),treasury_royalty_receiver_id=resolveAccount(nft.treasuryRecipient,owner),primary_sale_receiver_id=resolveAccount(nft.primarySaleRecipient||nft.treasuryRecipient,owner);
    if(!Number.isSafeInteger(max_supply)||max_supply<=0)throw new Error('NFT maximum supply must be a positive whole number.');
    if(!Number.isInteger(creator_royalty_bps)||!Number.isInteger(treasury_royalty_bps)||creator_royalty_bps<0||treasury_royalty_bps<0||creator_royalty_bps+treasury_royalty_bps>5000)throw new Error('NFT royalties must be positive and total no more than 50%.');
    if(!accountPattern.test(creator_royalty_receiver_id))throw new Error('Enter a valid creator royalty account.');
    if(!accountPattern.test(treasury_royalty_receiver_id))throw new Error('Enter a valid treasury royalty account.');
    if(!accountPattern.test(primary_sale_receiver_id))throw new Error('Enter a valid primary sale treasury account.');
    return{max_supply,mint_price,primary_sale_receiver_id,creator_royalty_bps,creator_royalty_receiver_id,treasury_royalty_bps,treasury_royalty_receiver_id};
  }
  const child=(prefix,owner)=>`${slug(prefix)}.${owner}`;
  const network=()=>document.documentElement.dataset.nearNetwork||'testnet';
  let deploymentConfigPromise;
  async function deploymentConfig(){deploymentConfigPromise||=window.totemApi.deploymentConfig();const config=await deploymentConfigPromise;if(config.network!==network())throw new Error(`Wallet is on ${network()} but the Totem API is configured for ${config.network}.`);if(network()==='mainnet'&&(!config.mainnetLaunchEnabled||!config.contractsAudited))throw new Error('Mainnet launch is locked until the audited-contract and launch gates are enabled.');return config}
  async function code(path,expectedHash){const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw new Error(`Contract artifact unavailable: ${path}`);const bytes=new Uint8Array(await response.arrayBuffer()),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),hash=[...digest].map(value=>value.toString(16).padStart(2,'0')).join('');if(hash!==String(expectedHash||'').toLowerCase())throw new Error(`Contract artifact hash mismatch: ${path}`);return bytes}
  function modes(draft){return{token:draft.origin==='token'||draft.origin==='twin',nft:draft.origin==='nft'||draft.origin==='twin'}}
  function preview(draft,owner){const need=modes(draft),ticker=draft.token?.ticker||draft.ticker||'culture',symbol=draft.nft?.symbol||draft.ticker||'culture';return{need,tokenContractId:need.token?child(`${ticker}-token`,owner):null,nftContractId:need.nft?child(`${symbol}-nft`,owner):null,depositNear:(Number(need.token)+Number(need.nft))*5}}
  async function build(draft,owner){const p=preview(draft,owner),runtime=await deploymentConfig(),transactions=[];if(runtime.network==='mainnet'&&owner!==runtime.authorizedMainnetParent)throw new Error(`Mainnet launches are restricted to ${runtime.authorizedMainnetParent}.`);
    if(p.need.token){const token=draft.token||{},decimals=Number(token.decimals||18),allocations=tokenAllocations(token).map(({account_id,amount,unlock_at_ms})=>({account_id,amount,unlock_at_ms}));transactions.push({signerId:owner,receiverId:p.tokenContractId,actions:[{type:'CreateAccount'},{type:'Transfer',params:{deposit:CONTRACT_DEPOSIT}},{type:'DeployContract',params:{code:await code(runtime.artifacts.token.path,runtime.artifacts.token.sha256)}},{type:'FunctionCall',params:{methodName:'new',args:{owner_id:owner,total_supply:units(token.supply,decimals),name:token.name||draft.name||'Culture Token',symbol:token.ticker||draft.ticker||'CULTURE',decimals,allocations},gas:GAS,deposit:'0'}}]})}
    if(p.need.nft){const nft=draft.nft||{},config=nftLaunchConfig(nft,owner);transactions.push({signerId:owner,receiverId:p.nftContractId,actions:[{type:'CreateAccount'},{type:'Transfer',params:{deposit:CONTRACT_DEPOSIT}},{type:'DeployContract',params:{code:await code(runtime.artifacts.nft.path,runtime.artifacts.nft.sha256)}},{type:'FunctionCall',params:{methodName:'new',args:{owner_id:owner,name:nft.name||draft.name||'Culture Collection',symbol:nft.symbol||draft.ticker||'CULTURE',base_uri:null,...config},gas:GAS,deposit:'0'}}]})}
    return{...p,network:runtime.network,artifactHashes:{token:runtime.artifacts.token.sha256,nft:runtime.artifacts.nft.sha256},transactions};
  }
  async function deploy(draft,owner){const plan=await build(draft,owner);if(plan.transactions.length){const wallet=await window.totemWallet.selector.wallet();plan.results=await wallet.signAndSendTransactions({transactions:plan.transactions})}return plan}
  window.totemDeploy={preview,build,deploy,tokenAllocations,nftLaunchConfig};
})();
