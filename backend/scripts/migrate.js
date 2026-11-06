import {readdir,readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {PostgresClient} from '../src/database.js'
import {loadConfig} from '../src/config.js'
const config=loadConfig()
if(!config.databaseUrl)throw new Error('DATABASE_URL is required to run migrations')
const db=new PostgresClient(config.databaseUrl)
try{
  await db.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())')
  const dir=fileURLToPath(new URL('../db/',import.meta.url))
  for(const name of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()){
    const exists=await db.query('select 1 from schema_migrations where name=$1',[name])
    if(exists.rowCount)continue
    await db.transaction(async tx=>{await tx.query(await readFile(new URL('../db/'+name,import.meta.url),'utf8'));await tx.query('insert into schema_migrations(name) values($1)',[name])})
    console.log('applied '+name)
  }
}finally{await db.close()}
