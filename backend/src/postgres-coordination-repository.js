export class PostgresCoordinationRepository{
  constructor(sql){this.sql=sql}
  async toggleVote(v){
    return this.sql.transaction(async tx=>{
      const removed=await tx.query('delete from coordination_votes where space=$1 and subject_id=$2 and account_id=$3 and choice=$4 returning choice',[v.space,v.subjectId,v.accountId,v.choice])
      if(removed.rowCount)return{active:false,vote:v}
      await tx.query('insert into coordination_votes(space,subject_id,account_id,choice,weight,created_at) values($1,$2,$3,$4,$5,to_timestamp($6/1000.0))',[v.space,v.subjectId,v.accountId,v.choice,v.weight,v.createdAt])
      return{active:true,vote:v}
    })
  }
  async tally(space,subjectId){
    const result=await this.sql.query('select choice,sum(weight)::int total from coordination_votes where space=$1 and subject_id=$2 group by choice',[space,subjectId])
    return Object.fromEntries(result.rows.map(r=>[r.choice,Number(r.total)]))
  }
}
