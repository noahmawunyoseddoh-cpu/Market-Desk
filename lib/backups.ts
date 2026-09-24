import {database,bucket,AppError} from './server';
const columns={products:['id','owner','name','sku','category','price','quantity','prices','revision','photo','sample','created_at'],sales:['id','owner','invoice','created_at','total','data'],purchases:['id','owner','created_at','data'],businesses:['owner','data'],adjustments:['id','owner','sale_id','created_at','amount','currency','data'],reconciliations:['id','owner','created_at','data']} as const;
type Snapshot={format:'marketdesk-1';owner:string;createdAt:string;revision:number;tables:Record<string,Record<string,unknown>[]>};
export async function revision(user:string){return (await database().prepare('SELECT revision FROM shop_revision WHERE owner=?').bind(user).first<{revision:number}>())?.revision??0;}
export async function createBackup(user:string,force=false){
 const db=database(),current=await revision(user);
 const latest=await db.prepare('SELECT * FROM backups WHERE owner=? ORDER BY revision DESC,created_at DESC LIMIT 1').bind(user).first<any>();
 if(!force&&latest&&latest.revision===current)return latest;
 const names=Object.keys(columns),rows=await db.batch([...names.map(table=>db.prepare('SELECT * FROM '+table+' WHERE owner=?').bind(user)),db.prepare('SELECT revision FROM shop_revision WHERE owner=?').bind(user)]);
 const snapshot:Snapshot={format:'marketdesk-1',owner:user,createdAt:new Date().toISOString(),revision:(rows[names.length].results[0] as any)?.revision??0,tables:Object.fromEntries(names.map((name,i)=>[name,rows[i].results as Record<string,unknown>[]]))};
 const id=crypto.randomUUID(),objectKey='backups/'+user+'/'+id+'.json';
 const metadata={counts:Object.fromEntries(names.map(name=>[name,snapshot.tables[name].length])),photos:'Product photos stay in this shop’s cloud storage.'};
 await bucket().put(objectKey,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'}});
 await db.prepare('INSERT INTO backups(id,owner,created_at,revision,object_key,data) VALUES(?,?,?,?,?,?)').bind(id,user,snapshot.createdAt,snapshot.revision,objectKey,JSON.stringify(metadata)).run();
 return {id,created_at:snapshot.createdAt,revision:snapshot.revision,data:JSON.stringify(metadata)};
}
// A failed secondary backup must not turn a committed sale into an apparent failure.
export async function automaticBackup(user:string){try{await createBackup(user);}catch(error){console.error('Automatic backup failed',error instanceof Error?error.message:'Storage error');}}
export async function readBackup(user:string,id:string){
 const row=await database().prepare('SELECT * FROM backups WHERE id=? AND owner=?').bind(id,user).first<any>();
 if(!row)throw new AppError('Backup not found.',404);
 const object=await bucket().get(row.object_key);if(!object)throw new AppError('Backup file is unavailable.',503);
 const snapshot=JSON.parse(await object.text()) as Snapshot;
 if(snapshot.format!=='marketdesk-1'||snapshot.owner!==user)throw new AppError('This backup does not belong to this shop.',403);
 return snapshot;
}
export async function restoreBackup(user:string,id:string,expected:number,operationId:string){
 const db=database();
 const done=await db.prepare('SELECT backup_id FROM restore_operations WHERE id=? AND owner=?').bind(operationId,user).first();if(done)return;
 const snapshot=await readBackup(user,id);
 if(await revision(user)!==expected)throw new AppError('Your shop changed. Reload backups before restoring.',409);
 const max=await db.prepare('SELECT MAX(revision) AS n FROM products WHERE owner=?').bind(user).first<{n:number}>();
 const safeProductRevision=Math.max(expected,max?.n??0,...snapshot.tables.products.map(row=>Number(row.revision)))+1;
 const safety=await createBackup(user,true);
 if(safety.revision!==expected)throw new AppError('Your shop changed. Reload backups before restoring.',409);
 // The NOT NULL guard aborts the entire transaction if another device writes.
 const statements=[db.prepare(`INSERT INTO restore_operations(id,owner,backup_id,created_at) VALUES(?,?,CASE WHEN COALESCE((SELECT revision FROM shop_revision WHERE owner=?),0)=? THEN ? ELSE NULL END,?)`).bind(operationId,user,user,expected,id,new Date().toISOString())];
 for(const [table,fields] of Object.entries(columns)){
  const rows=snapshot.tables[table];if(!Array.isArray(rows)||rows.some(row=>row.owner!==user))throw new AppError('Invalid backup.');
  statements.push(db.prepare('DELETE FROM '+table+' WHERE owner=?').bind(user));
  // Bound chunks keep large shops below SQLite parameter and string limits.
  let chunk:Record<string,unknown>[]=[];let size=0;
  const flush=()=>{if(chunk.length)statements.push(db.prepare('INSERT INTO '+table+' ('+fields.join(',')+') SELECT '+fields.map(field=>"json_extract(value,'$."+field+"')").join(',')+' FROM json_each(?)').bind(JSON.stringify(chunk)));chunk=[];size=0;};
  for(const original of rows){const row=table==='products'?{...original,revision:safeProductRevision}:original;const n=JSON.stringify(row).length;if(size+n>200000)flush();chunk.push(row);size+=n;}flush();
 }
 statements.push(db.prepare("INSERT INTO audit_events(owner,created_at,entity,action,record_id,data) VALUES(?,?,'backups','restore',?,?)").bind(user,new Date().toISOString(),id,JSON.stringify({safetyBackup:safety.id})));
 try{await db.batch(statements);}catch(error){if(await db.prepare('SELECT id FROM restore_operations WHERE id=? AND owner=?').bind(operationId,user).first())return;if(await revision(user)!==expected)throw new AppError('Your shop changed. Reload backups before restoring.',409);throw error;}
 await automaticBackup(user);
}
