import {boundary,workspace,database,json,body,textField,AppError,PERMISSION_LIST,rateLimit,clientIp,type Permission} from '@/lib/server';
import {defaultBusiness} from '@/lib/model';
import {sendStaffInviteEmail} from '@/lib/email';

function parsePermissionsInput(value:unknown):Permission[]{
 if(!Array.isArray(value))return [];
 const valid=new Set(PERMISSION_LIST as string[]);
 const unique=new Set<Permission>();
 for(const v of value)if(typeof v==='string'&&valid.has(v))unique.add(v as Permission);
 return [...unique];
}
function accessLabel(isOwner:boolean,permissions:Permission[]):string{
 if(isOwner)return 'full owner access';
 if(!permissions.length)return 'no permissions yet — ask the shop owner to set them';
 return permissions.join(', ');
}

export async function GET(){return boundary(async()=>{
 const actor=await workspace(undefined,'read'),db=database();
 const [members,businesses]=await db.batch([
  db.prepare(`SELECT id,email,display_name AS displayName,is_owner AS isOwner,permissions,status,created_at AS createdAt,accepted_at AS acceptedAt,user_id AS userId FROM business_memberships WHERE business_id=? ORDER BY is_owner DESC,email`).bind(actor.businessId),
  db.prepare(`SELECT m.business_id AS businessId,m.is_owner AS isOwner,b.data,
    (SELECT COUNT(*) FROM business_memberships o WHERE o.business_id=m.business_id AND o.is_owner=1 AND o.status='active' AND o.user_id!=m.user_id) AS otherOwners
    FROM business_memberships m LEFT JOIN businesses b ON b.owner=m.business_id WHERE m.user_id=? AND m.status='active' ORDER BY m.created_at`).bind(actor.userId),
 ]);
 const canSeeMembers=actor.isOwner||actor.permissions.has('members');
 return json({
  businessId:actor.businessId,isOwner:actor.isOwner,permissions:[...actor.permissions],
  members:canSeeMembers?(members.results as any[]).map(m=>({...m,isOwner:!!m.isOwner,permissions:parsePermissionsInput(JSON.parse(m.permissions||'[]'))})):[],
  businesses:(businesses.results as any[]).map(r=>({businessId:r.businessId,isOwner:!!r.isOwner,name:r.data?JSON.parse(r.data).name:'My Market Shop',soleOwner:!!r.isOwner&&r.otherOwners===0})),
 });
});}

export async function POST(request:Request){return boundary(async()=>{
 const d=await body(request),action=textField(d.action,30,true),db=database();
 if(action==='switch'){
  const actor=await workspace(request,'read'),businessId=textField(d.businessId,100,true);
  const allowed=await db.prepare(`SELECT id FROM business_memberships WHERE business_id=? AND user_id=? AND status='active'`).bind(businessId,actor.userId).first();
  if(!allowed)throw new AppError('You do not belong to that business.',403);
  await db.prepare(`INSERT INTO active_businesses(user_id,business_id,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET business_id=excluded.business_id,updated_at=excluded.updated_at`).bind(actor.userId,businessId,new Date().toISOString()).run();
  return json({ok:true,businessId});
 }
 if(action==='create_business'){
  const actor=await workspace(request,'read');
  if(!actor.isOwner)throw new AppError('Only an owner can create a new business.',403);
  const name=textField(d.name,100,true),id=crypto.randomUUID(),now=new Date().toISOString();
  const business={...defaultBusiness,name};
  await db.batch([
   db.prepare('INSERT INTO businesses(owner,data) VALUES(?,?)').bind(id,JSON.stringify(business)),
   db.prepare(`INSERT INTO business_memberships(id,business_id,user_id,email,display_name,role,status,invited_by,created_at,accepted_at,is_owner,permissions) VALUES(?,?,?,?,?,'owner','active',?,?,?,1,'[]')`).bind(crypto.randomUUID(),id,actor.userId,actor.email,actor.displayName,actor.userId,now,now),
   db.prepare(`INSERT INTO active_businesses(user_id,business_id,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET business_id=excluded.business_id,updated_at=excluded.updated_at`).bind(actor.userId,id,now),
  ]);
  return json({ok:true,businessId:id});
 }

 const actor=await workspace(request,'members');

 if(action==='invite'){
  await rateLimit(`invite:business:${actor.businessId}`,20,3600);
  await rateLimit(`invite:ip:${clientIp(request)}`,20,3600);
  const email=textField(d.email,100,true).toLowerCase(),makeOwner=d.makeOwner===true,permissions=parsePermissionsInput(d.permissions);
  if(makeOwner&&!actor.isOwner)throw new AppError('Only an owner can grant owner access.',403);
  if(!actor.isOwner){const disallowed=permissions.filter(p=>!actor.permissions.has(p));if(disallowed.length)throw new AppError('You cannot grant permissions you do not have yourself.',403);}
  const existing=await db.prepare('SELECT id,status FROM business_memberships WHERE business_id=? AND lower(email)=?').bind(actor.businessId,email).first<any>();
  if(existing?.status==='active')throw new AppError('That person is already a staff member.');
  const now=new Date().toISOString(),permJson=JSON.stringify(makeOwner?[]:permissions),ownerFlag=makeOwner?1:0;
  const role=makeOwner?'owner':'cashier'; // kept only as a legacy display label; permissions/is_owner are the real source of truth
  if(existing)await db.prepare(`UPDATE business_memberships SET role=?,status='invited',user_id=NULL,display_name='',invited_by=?,created_at=?,accepted_at=NULL,is_owner=?,permissions=? WHERE id=?`).bind(role,actor.userId,now,ownerFlag,permJson,existing.id).run();
  else await db.prepare(`INSERT INTO business_memberships(id,business_id,email,role,status,invited_by,created_at,is_owner,permissions) VALUES(?,?,?,?,'invited',?,?,?,?)`).bind(crypto.randomUUID(),actor.businessId,email,role,actor.userId,now,ownerFlag,permJson).run();
  const emailSent=await sendStaffInviteEmail(email,actor.displayName,accessLabel(makeOwner,permissions));
  return json({ok:true,emailSent});
 }

 if(action==='permissions'){
  const id=textField(d.id,100,true),makeOwner=d.makeOwner===true,permissions=parsePermissionsInput(d.permissions);
  const target=await db.prepare('SELECT is_owner AS isOwner,user_id AS userId FROM business_memberships WHERE id=? AND business_id=?').bind(id,actor.businessId).first<{isOwner:number;userId:string|null}>();
  if(!target)throw new AppError('Staff member not found.',404);
  if(target.userId===actor.userId)throw new AppError('Ask another owner to change your own access.',403);
  if(!actor.isOwner){
   if(target.isOwner)throw new AppError('Only an owner can change another owner\u2019s access.',403);
   if(makeOwner)throw new AppError('Only an owner can grant owner access.',403);
   const disallowed=permissions.filter(p=>!actor.permissions.has(p));
   if(disallowed.length)throw new AppError('You cannot grant permissions you do not have yourself.',403);
  }
  if(target.isOwner&&!makeOwner){
   const owners=await db.prepare("SELECT COUNT(*) AS count FROM business_memberships WHERE business_id=? AND is_owner=1 AND status='active'").bind(actor.businessId).first<{count:number}>();
   if((owners?.count??0)<=1)throw new AppError('Every business must keep at least one owner.');
  }
  await db.prepare('UPDATE business_memberships SET is_owner=?,permissions=? WHERE id=? AND business_id=?').bind(makeOwner?1:0,JSON.stringify(makeOwner?[]:permissions),id,actor.businessId).run();
  return json({ok:true});
 }

 if(action==='remove'){
  const id=textField(d.id,100,true);
  const target=await db.prepare('SELECT is_owner AS isOwner,user_id AS userId,permissions FROM business_memberships WHERE id=? AND business_id=?').bind(id,actor.businessId).first<{isOwner:number;userId:string|null;permissions:string}>();
  if(!target)throw new AppError('Staff member not found.',404);
  if(target.userId===actor.userId)throw new AppError('You cannot remove yourself from the active business.');
  if(target.isOwner&&!actor.isOwner)throw new AppError('Only an owner can remove an owner.',403);
  if(target.isOwner){const owners=await db.prepare("SELECT COUNT(*) AS count FROM business_memberships WHERE business_id=? AND is_owner=1 AND status='active'").bind(actor.businessId).first<{count:number}>();if((owners?.count??0)<=1)throw new AppError('Every business must keep at least one owner.');}
  if(!actor.isOwner){const targetPerms=parsePermissionsInput(JSON.parse(target.permissions||'[]'));const beyond=targetPerms.filter(p=>!actor.permissions.has(p));if(beyond.length)throw new AppError('You cannot remove someone with more access than you.',403);}
  await db.prepare('DELETE FROM business_memberships WHERE id=? AND business_id=?').bind(id,actor.businessId).run();return json({ok:true});
 }
 throw new AppError('Unsupported staff action.');
});}
