export class PostgresAuthRepository {
  constructor(sql) { this.sql = sql }
  async saveChallenge(c) {
    await this.sql.query('insert into auth_challenges (nonce,account_id,recipient,state,message,issued_at,expires_at) values ($1,$2,$3,$4,$5,to_timestamp($6/1000.0),to_timestamp($7/1000.0))',
      [c.nonce,c.accountId,c.recipient,c.state,c.message,c.issuedAt,c.expiresAt])
    return c
  }
  async getChallenge(state) {
    const result=await this.sql.query('select nonce,account_id,recipient,state,message,extract(epoch from issued_at)*1000 issued_at,extract(epoch from expires_at)*1000 expires_at from auth_challenges where state=$1',[state])
    const r=result.rows[0]
    return r?{nonce:r.nonce,accountId:r.account_id,recipient:r.recipient,state:r.state,message:r.message,issuedAt:Number(r.issued_at),expiresAt:Number(r.expires_at)}:null
  }
  async isConsumed(nonce) {
    const result=await this.sql.query('select consumed_at is not null as consumed from auth_challenges where nonce=$1',[nonce])
    return result.rows[0]?.consumed??false
  }
  async consumeOnce(nonce) {
    const result=await this.sql.query('update auth_challenges set consumed_at=now() where nonce=$1 and consumed_at is null returning nonce',[nonce])
    return result.rowCount===1
  }
  async saveSession(s) {
    await this.sql.query('insert into auth_sessions (token_hash,account_id,public_key,issued_at,expires_at) values ($1,$2,$3,to_timestamp($4/1000.0),to_timestamp($5/1000.0))',[s.tokenHash,s.accountId,s.publicKey,s.issuedAt,s.expiresAt])
    return s
  }
  async getSessionHash(hash) {
    const result=await this.sql.query('select token_hash,account_id,public_key,extract(epoch from issued_at)*1000 issued_at,extract(epoch from expires_at)*1000 expires_at from auth_sessions where token_hash=$1 and revoked_at is null',[hash])
    const r=result.rows[0]
    return r?{tokenHash:r.token_hash,accountId:r.account_id,publicKey:r.public_key,issuedAt:Number(r.issued_at),expiresAt:Number(r.expires_at)}:null
  }
}
