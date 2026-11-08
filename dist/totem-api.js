(function(global){
  const SESSION_KEY='totem.session.v1'
  class TotemApiClient{
    constructor(baseUrl=''){this.baseUrl=baseUrl.replace(/\/$/,'');this.session=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}
    async request(path,{method='GET',body,authenticated=false}={}){
      const headers={'accept':'application/json'}
      if(body!==undefined)headers['content-type']='application/json'
      if(authenticated){if(!this.session?.token)throw new Error('Connect a NEAR wallet first');headers.authorization='Bearer '+this.session.token}
      const response=await fetch(this.baseUrl+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})
      const payload=await response.json()
      if(!response.ok){const error=new Error(payload.error?.message||'Totem request failed');error.code=payload.error?.code;error.details=payload.error?.details;throw error}
      return payload.data??payload
    }
    challenge(accountId){return this.request('/api/v1/auth/challenge',{method:'POST',body:{accountId}})}
    async connect(accountId,signMessage){
      const challenge=await this.challenge(accountId)
      const signed=await signMessage(challenge)
      this.session=await this.request('/api/v1/auth/verify',{method:'POST',body:{...signed,accountId,state:challenge.state}})
      sessionStorage.setItem(SESSION_KEY,JSON.stringify(this.session));return this.session.identity
    }
    async restore(){if(!this.session?.token)return null;try{return await this.request('/api/v1/auth/session',{authenticated:true})}catch{this.disconnect();return null}}
    disconnect(){this.session=null;sessionStorage.removeItem(SESSION_KEY)}
    createCampaign(campaign){return this.request('/api/v1/campaigns',{method:'POST',body:campaign,authenticated:true})}
    deploymentConfig(){return this.request('/api/v1/deployment/config')}
    cultures({limit=50}={}){return this.request('/api/v1/campaigns?limit='+limit)}
    cultureAccount(campaignId,accountId){return this.request('/api/v1/culture-account?campaignId='+encodeURIComponent(campaignId)+'&accountId='+encodeURIComponent(accountId))}
    decideAccess(campaignId,accountId){return this.request('/api/v1/access/decide',{method:'POST',body:{campaignId,accountId},authenticated:true})}
    contribute(input){return this.request('/api/v1/contributions',{method:'POST',body:input,authenticated:true})}
    contributionsForReview(campaignId){return this.request('/api/v1/contributions/review?campaignId='+encodeURIComponent(campaignId),{authenticated:true})}
    reviewContribution(input){return this.request('/api/v1/contributions/review',{method:'POST',body:input,authenticated:true})}
    finalizeContribution(input){return this.request('/api/v1/contributions/finalize',{method:'POST',body:input,authenticated:true})}
    evaluate(campaignId,accountId,checkpoints){return this.request('/api/v1/eligibility/evaluate',{method:'POST',body:{campaignId,accountId,checkpoints}})}
    prepareMint(input){return this.request('/api/v1/mints/prepare',{method:'POST',body:input,authenticated:true})}
    events(campaignId,{afterSequence=0,limit=50}={}){return this.request('/api/v1/events?campaignId='+encodeURIComponent(campaignId)+'&afterSequence='+afterSequence+'&limit='+limit)}
    vote(input){return this.request('/api/v1/votes',{method:'POST',body:input,authenticated:true})}
    health(){return this.request('/api/health')}
  }
  global.TotemApiClient=TotemApiClient
  global.totemApi=new TotemApiClient()
})(window)
