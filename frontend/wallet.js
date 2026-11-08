import {Buffer} from 'buffer'
import {setupWalletSelector} from '@near-wallet-selector/core'
import {setupModal} from '@near-wallet-selector/modal-ui-js'
import {setupMeteorWallet} from '@near-wallet-selector/meteor-wallet'
import '@near-wallet-selector/modal-ui-js/styles.css'
globalThis.Buffer=Buffer

const network=document.documentElement.dataset.nearNetwork||'testnet'
const contractId=document.documentElement.dataset.totemContract||'nft.totem.testnet'
const selector=await setupWalletSelector({network,modules:[setupMeteorWallet()]})
const modal=setupModal(selector,{contractId,theme:'dark',description:'Connect to Totem and sign a gas-free NEP-413 authentication message.'})
let authenticating=false

const walletTargets=()=>[...document.querySelectorAll('a,button')].filter(el=>/^(Connect|ada\.totem\.near)$/i.test(el.textContent.trim())||el.dataset.totemWallet!==undefined)
function paint(accountId){
  walletTargets().forEach(el=>{el.textContent=accountId||'Connect';el.dataset.totemWallet='';el.setAttribute('aria-label',accountId?'Wallet '+accountId:'Connect NEAR wallet')})
  document.dispatchEvent(new CustomEvent('totem:wallet',{detail:{accountId}}))
}
async function authenticate(accountId){
  if(authenticating||!accountId)return
  authenticating=true
  try{
    const restored=await window.totemApi.restore()
    if(restored?.accountId===accountId){paint(accountId);return}
    const wallet=await selector.wallet()
    const identity=await window.totemApi.connect(accountId,challenge=>wallet.signMessage({message:challenge.message,recipient:challenge.recipient,nonce:Buffer.from(challenge.nonce,'base64'),state:challenge.state,callbackUrl:window.location.href}))
    paint(identity.accountId)
  }catch(error){
    console.error('Totem wallet authentication failed',error)
    document.dispatchEvent(new CustomEvent('totem:error',{detail:{code:error.code||'WALLET_AUTH_FAILED',message:error.message}}))
  }finally{authenticating=false}
}
async function currentAccount(){
  const accounts=selector.store.getState().accounts
  const accountId=accounts[0]?.accountId||null
  if(accountId)await authenticate(accountId);else paint(null)
}
async function signAndSend(transaction){
  const wallet=await selector.wallet()
  return wallet.signAndSendTransaction(transaction)
}
document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-totem-wallet],a,button')
  if(!target||!walletTargets().includes(target))return
  event.preventDefault()
  const accounts=selector.store.getState().accounts
  if(!accounts.length)return modal.show()
  const wallet=await selector.wallet()
  await wallet.signOut();window.totemApi.disconnect();paint(null)
})
selector.store.observable.subscribe(state=>{const accountId=state.accounts[0]?.accountId||null;if(accountId)authenticate(accountId);else paint(null)})
await currentAccount()
window.totemWallet={selector,modal,authenticate,signAndSend,signAndSendMint:plan=>signAndSend(plan.memberMint),signOut:async()=>{const wallet=await selector.wallet();await wallet.signOut();window.totemApi.disconnect();paint(null)}}
