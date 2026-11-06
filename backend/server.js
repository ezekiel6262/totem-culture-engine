import {createServer} from 'node:http'
import {readFile,stat} from 'node:fs/promises'
import {extname,join,normalize} from 'node:path'
import {fileURLToPath} from 'node:url'
import {TOTEM_CAMPAIGN} from './src/demo-campaign.js'
import {CoordinationService,createTotemApi,loadConfig,MemoryAuthRepository,MemoryCoordinationRepository,MemoryTotemRepository,NearRpcClient,PostgresAuthRepository,PostgresClient,PostgresCoordinationRepository,PostgresTotemRepository,TotemAuthService,TotemService} from './src/index.js'
const root=fileURLToPath(new URL('../dist/',import.meta.url))
const config=loadConfig(),db=config.databaseUrl?new PostgresClient(config.databaseUrl):null
const repository=db?new PostgresTotemRepository(db):new MemoryTotemRepository(),service=new TotemService(repository)
if(config.seedDemo&&!await repository.getLatestCampaign(TOTEM_CAMPAIGN.id))await service.createCampaign(TOTEM_CAMPAIGN)
const authRepository=db?new PostgresAuthRepository(db):new MemoryAuthRepository()
const auth=new TotemAuthService({repository:authRepository,recipient:config.authRecipient,rpc:new NearRpcClient({endpoint:config.nearRpcUrl})})
const coordinationRepository=db?new PostgresCoordinationRepository(db):new MemoryCoordinationRepository()
const api=createTotemApi({repository,service,auth,coordination:new CoordinationService(coordinationRepository)})
const routes=new Map([['POST /api/v1/auth/challenge',api.createAuthChallenge],['POST /api/v1/auth/verify',api.verifyAuth],['GET /api/v1/auth/session',api.getSession],['POST /api/v1/campaigns',api.createCampaign],['POST /api/v1/eligibility/evaluate',api.evaluateEligibility],['POST /api/v1/mints/prepare',api.prepareMint],['GET /api/v1/events',api.listEvents],['POST /api/v1/votes',api.vote]])
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}
const webRequest=req=>{const init={method:req.method,headers:req.headers};if(!['GET','HEAD'].includes(req.method))init.body=req;return new Request('http://'+(req.headers.host??'localhost')+req.url,init)}
const send=async(res,response)=>{res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}
async function serve(req,res,pathname){const relative=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\/+/,'');const path=normalize(join(root,relative));if(!path.startsWith(normalize(root)))return false;try{if(!(await stat(path)).isFile())return false;res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream','cache-control':'no-cache'});res.end(req.method==='HEAD'?undefined:await readFile(path));return true}catch{return false}}
export function createTotemServer(){return createServer(async(req,res)=>{try{const url=new URL(req.url,'http://'+(req.headers.host??'localhost'));if(url.pathname==='/api/health')return send(res,Response.json({status:'ok',service:'totem',version:'v1'}));const handler=routes.get(req.method+' '+url.pathname);if(handler)return send(res,await handler(webRequest(req)));if(await serve(req,res,url.pathname))return;return send(res,Response.json({error:{code:'NOT_FOUND',message:'Route not found'}},{status:404}))}catch(error){console.error(error);return send(res,Response.json({error:{code:'INTERNAL_ERROR',message:'Unexpected server error'}},{status:500}))}})}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=createTotemServer().listen(config.port,()=>console.log('Totem running at http://127.0.0.1:'+config.port));const stop=()=>server.close(async()=>{if(db)await db.close();process.exit(0)});process.on('SIGTERM',stop);process.on('SIGINT',stop)}
