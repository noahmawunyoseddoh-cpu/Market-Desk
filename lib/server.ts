import { env } from 'cloudflare:workers';
import { getSessionUser } from '@/app/auth';
export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function database() { if (!env.DB) throw new AppError('Your shop is temporarily unavailable. Please try again.',503); return env.DB; }
export function bucket() { if (!env.BUCKET) throw new AppError('Photo storage is temporarily unavailable.',503); return env.BUCKET; }
export type Permission='read'|'sell'|'products'|'purchase'|'refund'|'reports'|'payments'|'settings'|'recovery'|'members';
// The permissions an owner can toggle per person. 'read' is implicit for any active member and isn't shown as a toggle.
export const PERMISSION_LIST:Exclude<Permission,'read'>[]=['sell','products','purchase','refund','reports','payments','settings','recovery','members'];
export type Workspace={userId:string;email:string;displayName:string;businessId:string;isOwner:boolean;permissions:Set<Permission>};
function parsePermissions(raw:string):Set<Permission>{
 let list:unknown;try{list=JSON.parse(raw);}catch{list=[];}
 const valid=new Set(PERMISSION_LIST as string[]);
 const set=new Set<Permission>(Array.isArray(list)?list.filter((v):v is Permission=>typeof v==='string'&&valid.has(v)):[]);
 set.add('read');
 return set;
}
function normalizedEmail(value:string){return value.trim().toLowerCase();}
async function ensureWorkspace():Promise<Workspace>{
 const user=await getSessionUser();if(!user)throw new AppError('Please sign in again to continue.',401);
 const db=database(),email=normalizedEmail(user.email),now=new Date().toISOString();
 // Accept invitations automatically when the invited email signs in — but only once that email is verified,
 // so someone can't grab a colleague's invite by signing up with their email before they do.
 if(user.emailVerified)await db.prepare(`UPDATE business_memberships SET user_id=?,display_name=?,status='active',accepted_at=? WHERE lower(email)=? AND status='invited' AND user_id IS NULL`).bind(user.userId,user.displayName,now,email).run();
 let memberships=(await db.prepare(`SELECT business_id,is_owner AS isOwner,permissions FROM business_memberships WHERE user_id=? AND status='active' ORDER BY is_owner DESC,created_at`).bind(user.userId).all<{business_id:string;isOwner:number;permissions:string}>()).results;
 if(!memberships.length){
  // Backwards-compatible bootstrap: the existing account ID remains the business key, so all current records stay attached.
  await db.prepare(`INSERT OR IGNORE INTO business_memberships(id,business_id,user_id,email,display_name,role,status,invited_by,created_at,accepted_at,is_owner,permissions) VALUES(?,?,?,?,?,'owner','active',?,?,?,1,'[]')`).bind(crypto.randomUUID(),user.userId,user.userId,email,user.displayName,user.userId,now,now).run();
  memberships=[{business_id:user.userId,isOwner:1,permissions:'[]'}];
 }
 const preferred=await db.prepare('SELECT business_id FROM active_businesses WHERE user_id=?').bind(user.userId).first<{business_id:string}>();
 const selected=memberships.find(m=>m.business_id===preferred?.business_id)??memberships[0];
 await db.prepare(`INSERT INTO active_businesses(user_id,business_id,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET business_id=excluded.business_id,updated_at=excluded.updated_at`).bind(user.userId,selected.business_id,now).run();
 return {userId:user.userId,email,displayName:user.displayName,businessId:selected.business_id,isOwner:!!selected.isOwner,permissions:parsePermissions(selected.permissions)};
}
export async function workspace(request?:Request,permission:Permission='read'){
 if(request && !['GET','HEAD'].includes(request.method)){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new AppError('Please use this shop to save changes.',403);}
 const value=await ensureWorkspace();if(!value.isOwner&&!value.permissions.has(permission))throw new AppError('Your account does not have permission for this action.',403);return value;
}
// Kept for existing routes: "owner" now means the active business key.
export async function owner(request?:Request,permission:Permission='read'){return (await workspace(request,permission)).businessId;}
export function json(data: unknown, status=200) { return Response.json(data,{status,headers:{'Cache-Control':'no-store'}}); }
export async function boundary(fn:()=>Promise<Response>) { try { return await fn(); } catch(e) { if(e instanceof AppError) return json({error:e.message},e.status); console.error('MarketDesk request failed',e); return json({error:'Could not save or load your data. Please try again; your form has been kept.'},503); } }
export async function body(request:Request) { const value=await request.text(); if(value.length>100000) throw new AppError('This request is too large.'); try{const data=JSON.parse(value);if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data;}catch{throw new AppError('Please check the information and try again.');} }
export function clientIp(request:Request):string{return request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')||'unknown';}
// A simple fixed-window rate limiter backed by D1. Throws AppError(429) once `max` calls for `key`
// land within the current `windowSeconds` window. Call this before doing any real work for the request.
export async function rateLimit(key:string,max:number,windowSeconds:number):Promise<void>{
 const db=database(),windowStart=Math.floor(Date.now()/1000/windowSeconds)*windowSeconds;
 const row=await db.prepare(`INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1)
  ON CONFLICT(key,window_start) DO UPDATE SET count=count+1 RETURNING count`).bind(key,windowStart).first<{count:number}>();
 // Occasional best-effort cleanup so the table doesn't grow forever; skipped most of the time to avoid extra latency.
 if(Math.random()<0.02)await db.prepare('DELETE FROM rate_limits WHERE window_start<?').bind(windowStart-86400).run();
 if((row?.count??0)>max)throw new AppError('Too many attempts. Please wait a bit and try again.',429);
}
export function textField(value:unknown,max:number,required=false):string { if(typeof value!=='string' || value.trim().length>max || (required&&!value.trim())) throw new AppError('Please check the required fields and text lengths.'); return value.trim(); }
export function integer(value:unknown,max:number,min=0):number { if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max) throw new AppError('Please use valid prices and whole quantities.'); return value; }
