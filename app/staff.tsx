'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Plus,RefreshCw,Trash2,Users,Store,Pencil,X} from 'lucide-react';
import {useI18n} from './i18n-provider';

import DeleteAccount from './delete-account';

type Permission='sell'|'products'|'purchase'|'refund'|'reports'|'payments'|'settings'|'recovery'|'members';
const PERMISSION_LIST:Permission[]=['sell','products','purchase','refund','reports','payments','settings','recovery','members'];
const PERMISSION_LABELS:Record<Permission,string>={sell:'Make sales',products:'Manage products',purchase:'Record purchases',refund:'Refunds & cancellations',reports:'View sales reports',payments:'View payments',settings:'Shop settings',recovery:'Recovery & history',members:'Invite & manage staff'};
type Member={id:string;email:string;displayName:string;isOwner:boolean;permissions:Permission[];status:'active'|'invited';createdAt:string;acceptedAt:string|null;userId:string|null};
type BusinessChoice={businessId:string;name:string;isOwner:boolean;soleOwner:boolean};
type Data={businessId:string;isOwner:boolean;permissions:Permission[];members:Member[];businesses:BusinessChoice[]};
async function request<T>(options?:RequestInit){const r=await fetch('/api/memberships',{...options,headers:{'Content-Type':'application/json',...options?.headers}});const d=await r.json() as any;if(!r.ok)throw new Error(d.error||'Could not update staff.');return d as T;}

function PermissionChecklist({selected,onToggle,ownerToggle,owner,onOwnerChange,disabledSet,disabled}:{selected:Set<Permission>;onToggle:(p:Permission)=>void;ownerToggle:boolean;owner:boolean;onOwnerChange:(v:boolean)=>void;disabledSet:Set<Permission>;disabled?:boolean}){
 const {t}=useI18n();
 return <div className="permission-grid">
  {ownerToggle&&<label className="check-label owner-toggle"><input type="checkbox" checked={owner} disabled={disabled} onChange={e=>onOwnerChange(e.target.checked)}/>{t('Owner (full access to everything)')}</label>}
  {!owner&&PERMISSION_LIST.map(p=><label className="check-label" key={p}><input type="checkbox" checked={selected.has(p)} disabled={disabled||disabledSet.has(p)} onChange={()=>onToggle(p)}/>{t(PERMISSION_LABELS[p])}</label>)}
 </div>;
}

export default function Staff({onChanged,online,pendingSales}:{onChanged:()=>Promise<unknown>;online:boolean;pendingSales:number}){
 const {t}=useI18n(),[data,setData]=useState<Data|null>(null),[email,setEmail]=useState(''),[invitePerms,setInvitePerms]=useState<Set<Permission>>(new Set(['sell'])),[inviteOwner,setInviteOwner]=useState(false),[businessName,setBusinessName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[inviteNotice,setInviteNotice]=useState('');
 const [editingId,setEditingId]=useState<string|null>(null),[editPerms,setEditPerms]=useState<Set<Permission>>(new Set()),[editOwner,setEditOwner]=useState(false);
 async function load(){try{setError('');setData(await request<Data>());}catch(e){setError((e as Error).message);}}
 useEffect(()=>{void load();},[]);
 async function action(payload:Record<string,unknown>,after?:(result:any)=>void){if(!online){setError('Reconnect before changing staff or businesses.');return;}setBusy(true);setError('');try{const result=await request<any>({method:'POST',body:JSON.stringify(payload)});after?.(result);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function invite(e:FormEvent){e.preventDefault();const invitedEmail=email;await action({action:'invite',email,makeOwner:inviteOwner,permissions:[...invitePerms]},result=>{setEmail('');setInvitePerms(new Set(['sell']));setInviteOwner(false);setInviteNotice(result?.emailSent?`Invite email sent to ${invitedEmail}.`:`Invite saved, but the email could not be sent. Let them know to sign in at this site using ${invitedEmail}.`);});}
 async function createBusiness(e:FormEvent){e.preventDefault();await action({action:'create_business',name:businessName},()=>setBusinessName(''));await onChanged();window.location.reload();}
 function startEdit(m:Member){setEditingId(m.id);setEditPerms(new Set(m.permissions));setEditOwner(m.isOwner);}
 async function saveEdit(id:string){await action({action:'permissions',id,makeOwner:editOwner,permissions:[...editPerms]},()=>setEditingId(null));}
 if(!data)return <section className="panel"><h2>{t('Staff & businesses')}</h2>{error?<p className="notice warning">{t(error)}</p>:<p>{t('Loading…')}</p>}</section>;
 const grantable=new Set(data.isOwner?PERMISSION_LIST:data.permissions);
 const canManageStaff=data.isOwner||data.permissions.includes('members');
 return <div className="report-tables">
  {canManageStaff&&<section className="panel recovery-panel"><div className="panel-title"><div><span>{t('TEAM ACCESS')}</span><h2>{t('Staff & permissions')}</h2></div><Users size={22}/></div><p>{t('Invite people by the email they use to sign in, and pick exactly what they can do. Their access activates automatically after they sign in.')}</p>{error&&<p className="notice warning">{t(error)}</p>}{inviteNotice&&<p className="notice">{t(inviteNotice)}</p>}
   <form className="product-form" onSubmit={invite}>
    <label>{t('Staff email')}<input type="email" required maxLength={100} value={email} onChange={e=>setEmail(e.target.value)} placeholder="staff@example.com"/></label>
    <PermissionChecklist selected={invitePerms} onToggle={p=>setInvitePerms(s=>{const next=new Set(s);next.has(p)?next.delete(p):next.add(p);return next;})} ownerToggle={data.isOwner} owner={inviteOwner} onOwnerChange={setInviteOwner} disabledSet={new Set(PERMISSION_LIST.filter(p=>!grantable.has(p)))}/>
    <button className="primary" disabled={busy||(!inviteOwner&&invitePerms.size===0)}><Plus size={17}/>{t('Invite staff')}</button>
   </form>
   <div className="history-list">{data.members.map(m=><div className="history-entry" key={m.id}>
    <b>{m.displayName||m.email}</b><span>{m.email} · {t(m.status==='invited'?'Invitation pending':'Active')}</span>
    {editingId===m.id?<div className="permission-editor">
      <PermissionChecklist selected={editPerms} onToggle={p=>setEditPerms(s=>{const next=new Set(s);next.has(p)?next.delete(p):next.add(p);return next;})} ownerToggle={data.isOwner} owner={editOwner} onOwnerChange={setEditOwner} disabledSet={new Set(PERMISSION_LIST.filter(p=>!grantable.has(p)))}/>
      <div className="recovery-actions"><button className="primary" disabled={busy} onClick={()=>void saveEdit(m.id)}>{t('Save access')}</button><button className="secondary" disabled={busy} onClick={()=>setEditingId(null)}><X size={15}/>{t('Cancel')}</button></div>
     </div>
     :<div className="recovery-actions">
      <span className="tiny-badge">{m.isOwner?t('Owner'):m.permissions.length?m.permissions.map(p=>t(PERMISSION_LABELS[p])).join(', '):t('No permissions yet')}</span>
      <button className="icon-button" disabled={busy} onClick={()=>startEdit(m)} aria-label={t('Edit access')}><Pencil size={16}/></button>
      {(m.userId!==null||m.status==='invited')&&<button className="icon-button" disabled={busy} onClick={()=>void action({action:'remove',id:m.id})} aria-label={t('Remove staff')}><Trash2 size={16}/></button>}
     </div>}
   </div>)}</div>
  </section>}
  <section className="panel recovery-panel"><div className="panel-title"><div><span>{t('BUSINESSES')}</span><h2>{t('Your businesses')}</h2></div><Store size={22}/></div><p>{t('Each business has separate products, sales, purchases, reports and settings.')}</p>{pendingSales>0&&<p className="notice warning">{t('Sync pending sales before switching or creating another business.')}</p>}{data.businesses.map(b=><div className="history-entry" key={b.businessId}><b>{b.name}</b><span>{t(b.isOwner?'Owner':'Staff')}</span><button className={b.businessId===data.businessId?'secondary':'primary'} disabled={busy||!online||pendingSales>0||b.businessId===data.businessId} title={pendingSales>0?t('Sync pending sales before switching businesses.'):undefined} onClick={()=>void action({action:'switch',businessId:b.businessId},()=>window.location.reload())}>{b.businessId===data.businessId?t('Current business'):t('Switch business')}</button></div>)}
   {data.isOwner&&<form className="product-form" onSubmit={createBusiness}><label>{t('New business name')}<input required maxLength={100} value={businessName} onChange={e=>setBusinessName(e.target.value)} placeholder={t('Business name')}/></label><button className="secondary" disabled={busy||!online||pendingSales>0}><Plus size={17}/>{t('Create separate business')}</button></form>}
   <button className="text-button" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/>{t('Refresh')}</button>
  </section>
  <DeleteAccount ownsSoloBusiness={data.businesses.some(b=>b.soleOwner)}/>
 </div>;
}
