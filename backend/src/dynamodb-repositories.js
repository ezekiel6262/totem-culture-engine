import {DynamoDBClient} from '@aws-sdk/client-dynamodb'
import {DeleteCommand,DynamoDBDocumentClient,GetCommand,PutCommand,QueryCommand,TransactWriteCommand,UpdateCommand} from '@aws-sdk/lib-dynamodb'
import {DomainError} from './errors.js'

const clone=value=>value==null?null:structuredClone(value)
const conditional=error=>error?.name==='ConditionalCheckFailedException'||error?.name==='TransactionCanceledException'

export function createDynamoDocumentClient(options={}){
  return DynamoDBDocumentClient.from(new DynamoDBClient(options),{marshallOptions:{removeUndefinedValues:true}})
}

class DynamoRepository{
  constructor(client,tableName){this.client=client;this.tableName=tableName}
  send(command){return this.client.send(command)}
}

export class DynamoTotemRepository extends DynamoRepository{
  async saveCampaignVersion(campaign){
    const latestKey={pk:`CAMPAIGN#${campaign.id}`,sk:'LATEST'},versionKey={pk:`CAMPAIGN#${campaign.id}`,sk:`VERSION#${String(campaign.version).padStart(12,'0')}`}
    try{
      await this.send(new TransactWriteCommand({TransactItems:[
        {Put:{TableName:this.tableName,Item:{...versionKey,entity:'campaign-version',campaign},ConditionExpression:'attribute_not_exists(pk)'}},
        {Put:{TableName:this.tableName,Item:{...latestKey,entity:'campaign-latest',campaign,version:campaign.version},ConditionExpression:'attribute_not_exists(pk) OR #version < :version',ExpressionAttributeNames:{'#version':'version'},ExpressionAttributeValues:{':version':campaign.version}}}
      ]}))
      return clone(campaign)
    }catch(error){if(conditional(error))throw new DomainError('CAMPAIGN_VERSION_CONFLICT','Campaign version already exists or is stale');throw error}
  }
  async getLatestCampaign(id){
    const result=await this.send(new GetCommand({TableName:this.tableName,Key:{pk:`CAMPAIGN#${id}`,sk:'LATEST'},ConsistentRead:true}))
    return clone(result.Item?.campaign??null)
  }
  async createCommandOnce(command){
    const key={pk:`COMMAND#${command.idempotencyKey}`,sk:'COMMAND'}
    try{await this.send(new PutCommand({TableName:this.tableName,Item:{...key,entity:'command',command},ConditionExpression:'attribute_not_exists(pk)'}));return{created:true,command:clone(command)}}
    catch(error){if(!conditional(error))throw error;const existing=await this.send(new GetCommand({TableName:this.tableName,Key:key,ConsistentRead:true}));return{created:false,command:clone(existing.Item.command)}}
  }
  async nextEventSequence(campaignId='global'){
    const result=await this.send(new UpdateCommand({TableName:this.tableName,Key:{pk:`EVENTS#${campaignId}`,sk:'COUNTER'},UpdateExpression:'ADD #value :one',ExpressionAttributeNames:{'#value':'value'},ExpressionAttributeValues:{':one':1},ReturnValues:'UPDATED_NEW'}))
    return Number(result.Attributes.value)
  }
  async appendEvent(event){
    const sequence=event.sequence??await this.nextEventSequence(event.campaignId)
    const stored={...event,sequence}
    await this.send(new PutCommand({TableName:this.tableName,Item:{pk:`EVENTS#${event.campaignId}`,sk:`EVENT#${String(sequence).padStart(16,'0')}`,entity:'event',event:stored},ConditionExpression:'attribute_not_exists(pk)'}))
    return clone(stored)
  }
  async listEvents({campaignId,afterSequence=0,limit=50}){
    const result=await this.send(new QueryCommand({TableName:this.tableName,KeyConditionExpression:'pk = :pk AND sk > :after',ExpressionAttributeValues:{':pk':`EVENTS#${campaignId}`,':after':`EVENT#${String(afterSequence).padStart(16,'0')}`},Limit:Math.min(Math.max(limit,1),100),ConsistentRead:true}))
    return result.Items.filter(item=>item.entity==='event').map(item=>clone(item.event))
  }
  async upsertCheckpoint(checkpoint){
    const key={pk:`CHECKPOINT#${checkpoint.campaignId}#${checkpoint.accountId}`,sk:`PERIOD#${checkpoint.period}`}
    try{await this.send(new PutCommand({TableName:this.tableName,Item:{...key,entity:'checkpoint',checkpoint,blockHeight:checkpoint.blockHeight},ConditionExpression:'attribute_not_exists(pk) OR blockHeight < :height',ExpressionAttributeValues:{':height':checkpoint.blockHeight}}));return{updated:true,checkpoint:clone(checkpoint)}}
    catch(error){if(conditional(error))return{updated:false,checkpoint:clone(checkpoint)};throw error}
  }
}

export class DynamoAuthRepository extends DynamoRepository{
  async saveChallenge(challenge){await this.send(new PutCommand({TableName:this.tableName,Item:{pk:`AUTH_STATE#${challenge.state}`,sk:'CHALLENGE',entity:'auth-challenge',challenge,nonce:challenge.nonce,expiresAt:challenge.expiresAt,ttl:Math.ceil(challenge.expiresAt/1000)}}));return clone(challenge)}
  async getChallenge(state){const result=await this.send(new GetCommand({TableName:this.tableName,Key:{pk:`AUTH_STATE#${state}`,sk:'CHALLENGE'},ConsistentRead:true}));return clone(result.Item?.challenge??null)}
  async isConsumed(nonce){const result=await this.send(new GetCommand({TableName:this.tableName,Key:{pk:`AUTH_NONCE#${nonce}`,sk:'CONSUMED'},ConsistentRead:true}));return Boolean(result.Item)}
  async consumeOnce(nonce){try{await this.send(new PutCommand({TableName:this.tableName,Item:{pk:`AUTH_NONCE#${nonce}`,sk:'CONSUMED',entity:'consumed-nonce'},ConditionExpression:'attribute_not_exists(pk)'}));return true}catch(error){if(conditional(error))return false;throw error}}
  async saveSession(session){await this.send(new PutCommand({TableName:this.tableName,Item:{pk:`AUTH_SESSION#${session.tokenHash}`,sk:'SESSION',entity:'auth-session',session,ttl:Math.ceil(session.expiresAt/1000)}}));return clone(session)}
  async getSessionHash(hash){const result=await this.send(new GetCommand({TableName:this.tableName,Key:{pk:`AUTH_SESSION#${hash}`,sk:'SESSION'},ConsistentRead:true}));return clone(result.Item?.session??null)}
}

export class DynamoCoordinationRepository extends DynamoRepository{
  key(v){return{pk:`VOTES#${v.space}#${v.subjectId}`,sk:`VOTE#${v.accountId}`}}
  async toggleVote(v){
    const key=this.key(v),current=await this.send(new GetCommand({TableName:this.tableName,Key:key,ConsistentRead:true}))
    if(current.Item?.vote?.choice===v.choice){await this.send(new DeleteCommand({TableName:this.tableName,Key:key,ConditionExpression:'attribute_exists(pk)'}));return{active:false,vote:clone(v),replaced:null}}
    await this.send(new PutCommand({TableName:this.tableName,Item:{...key,entity:'vote',vote:v}}))
    return{active:true,vote:clone(v),replaced:current.Item?.vote?.choice??null}
  }
  async tally(space,subjectId){
    const result=await this.send(new QueryCommand({TableName:this.tableName,KeyConditionExpression:'pk = :pk AND begins_with(sk,:prefix)',ExpressionAttributeValues:{':pk':`VOTES#${space}#${subjectId}`,':prefix':'VOTE#'},ConsistentRead:true})),totals={yes:0,no:0,totem:0,doggo:0}
    for(const item of result.Items)totals[item.vote.choice]=(totals[item.vote.choice]??0)+item.vote.weight
    return totals
  }
}
