import { access, readFile } from 'node:fs/promises'

const required=['README.md','JUDGES.md','LICENSE','SUBMISSION.md','HACKATHON.md','docs/ARCHITECTURE.md','docs/PRODUCT_SPEC.md','docs/NEAR_EVIDENCE.md','docs/TESTNET_RELEASE.md','docs/SUBMISSION_COPY.md','.github/workflows/ci.yml']
const failures=[]
for(const file of required)try{await access(file)}catch{failures.push(`missing ${file}`)}
const readme=await readFile('README.md','utf8')
for(const marker of ['Scion','judge:verify','games','nfts','memecoins','social','Sputnik DAO','Trezu','testnet'])if(!readme.includes(marker))failures.push(`README missing ${marker}`)
const submission=await readFile('SUBMISSION.md','utf8')
if(!submission.includes('https://mytotem.buzz'))failures.push('submission checklist missing live product')
if(!submission.includes('totemtest.testnet'))failures.push('submission checklist missing testnet account')
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`Submission audit passed: ${required.length} judge files, dual-project disclosure, track evidence, and testnet boundary present.`)
