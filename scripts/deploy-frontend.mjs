// Publishes dist to the CloudFront-backed S3 bucket.
//
//   npm run deploy:frontend -- --stack <name>     resolve bucket and distribution from stack outputs
//   npm run deploy:frontend -- --bucket b --distribution d
//   npm run deploy:frontend -- --stack <name> --dry-run
//
// Requires an AWS session (`aws login`) with access to the stack, the bucket and CloudFront.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = name => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const dryRun = args.includes('--dry-run')

const region = flag('region') ?? process.env.AWS_REGION ?? 'us-east-1'
const stack = flag('stack') ?? process.env.TOTEM_STACK
let bucket = flag('bucket') ?? process.env.TOTEM_FRONTEND_BUCKET
let distribution = flag('distribution') ?? process.env.TOTEM_DISTRIBUTION_ID

const aws = (...parameters) => execFileSync('aws', [...parameters, '--region', region], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

const run = (label, parameters) => {
  console.log(`\n${label}`)
  console.log(`  aws ${parameters.join(' ')}`)
  if (dryRun) return console.log('  (dry run, not executed)')
  console.log(execFileSync('aws', [...parameters, '--region', region], { encoding: 'utf8' }))
}

function outputs() {
  const raw = aws('cloudformation', 'describe-stacks', '--stack-name', stack, '--query', 'Stacks[0].Outputs', '--output', 'json')
  return Object.fromEntries(JSON.parse(raw).map(item => [item.OutputKey, item.OutputValue]))
}

try {
  const index = resolve('dist/index.html')
  if (!existsSync(index)) throw new Error('dist/index.html is missing. Run `npm run build:site` first.')
  if (!readFileSync(index, 'utf8').includes('rel="icon"')) throw new Error('dist/index.html looks wrong. Run `npm run test:static`.')

  if ((!bucket || !distribution) && stack) {
    const found = outputs()
    bucket ??= found.FrontendBucketName
    distribution ??= found.FrontendDistributionId
    console.log(`Stack ${stack}: bucket ${bucket}, distribution ${distribution}`)
  }

  if (!bucket) throw new Error('No bucket. Pass --stack <name>, or --bucket <name>.')
  if (!distribution) throw new Error('No distribution. Pass --stack <name>, or --distribution <id>.')

  console.log(`\nPublishing dist to s3://${bucket} and invalidating ${distribution}.`)
  console.log('The sync deletes objects that are no longer in dist, including the pages of the previous design.')
  console.log('The bucket has versioning enabled, so deleted objects stay recoverable.')

  // Only content that never changes under a given name may be cached hard. Everything at
  // the root (index.html, wallet.js, totem-api.js) can change while keeping its name, so
  // it gets a short cache and a browser picks the new one up after an invalidation.
  run('1/4 immutable assets', ['s3', 'sync', 'dist', `s3://${bucket}`, '--exclude', '*', '--include', 'assets/*', '--include', 'contracts/*', '--cache-control', 'public,max-age=31536000,immutable'])
  run('2/4 scripts and styles', ['s3', 'sync', 'dist', `s3://${bucket}`, '--delete', '--exclude', 'assets/*', '--exclude', 'contracts/*', '--exclude', 'index.html', '--cache-control', 'public,max-age=300'])
  run('3/4 entry point', ['s3', 'cp', 'dist/index.html', `s3://${bucket}/index.html`, '--cache-control', 'no-cache', '--content-type', 'text/html; charset=utf-8'])
  run('4/4 invalidation', ['cloudfront', 'create-invalidation', '--distribution-id', distribution, '--paths', '/*'])

  console.log(dryRun ? '\nDry run complete.' : '\nPublished. CloudFront takes a minute or two to finish the invalidation.')
} catch (error) {
  const detail = error.stderr?.toString().trim()
  console.error(`\nDeploy failed: ${error.message}`)
  if (detail) console.error(detail)
  if (detail?.includes('session has expired') || detail?.includes('ExpiredToken')) console.error('\nRun `aws login` first.')
  process.exit(1)
}
