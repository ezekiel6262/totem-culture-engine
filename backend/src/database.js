import pg from 'pg'
const {Pool}=pg
export class PostgresClient{
  constructor(connectionString,{pool}={}){this.pool=pool??new Pool({connectionString,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,ssl:connectionString?.includes('localhost')?false:{rejectUnauthorized:false}})}
  query(text,values){return this.pool.query(text,values)}
  async transaction(action){const client=await this.pool.connect();try{await client.query('begin');const result=await action({query:(text,values)=>client.query(text,values)});await client.query('commit');return result}catch(error){await client.query('rollback');throw error}finally{client.release()}}
  close(){return this.pool.end()}
}
