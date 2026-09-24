'use client';

import {useI18n} from './i18n-provider';
import { useRef,useState,useEffect,type FormEvent } from 'react';
import { Package,Plus,Search,Trash2,Check,LoaderCircle,ArrowUpRight,AlertCircle,X } from 'lucide-react';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { Empty,EmptyHeader,EmptyTitle,EmptyDescription } from '@/components/ui/empty';
import { toast } from 'sonner';
import {pendingOperation,keepOperation,finishOperation} from '@/lib/offline';
import type { Product,Purchase } from '@/lib/model';

type DraftLine={productId:string;name:string;sku:string;quantity:string};
type PurchaseInput={id:string;date:string;supplier:string;reference:string;lines:{productId:string;quantity:number}[]};
type Props={ownerId:string;products:Product[];purchases:Purchase[];ready:boolean;online:boolean;onError:(e:unknown)=>void;onSaved:(purchase:Purchase)=>void;onRefresh:()=>Promise<unknown>;onNewProduct:(callback:(product:Product)=>void)=>void};
const today=()=>new Date().toISOString().slice(0,10);

export default function Purchases({ownerId,products,purchases,ready,online,onError,onSaved,onRefresh,onNewProduct}:Props){
 const {t,locale}=useI18n();
 const displayDate=(value:string)=>new Date(value+'T12:00:00Z').toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'});
 const [date,setDate]=useState(today),[supplier,setSupplier]=useState(''),[reference,setReference]=useState(''),[query,setQuery]=useState(''),[lines,setLines]=useState<DraftLine[]>([]);
 const [saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[detail,setDetail]=useState<Purchase|null>(null);
 const pending=useRef<PurchaseInput|null>(null),savingRef=useRef(false),searchRef=useRef<HTMLInputElement>(null);
 const [recovered,setRecovered]=useState(false);
 useEffect(()=>{void pendingOperation(ownerId,'purchase').then(value=>{if(value){pending.current=value;setDate(value.date);setSupplier(value.supplier);setReference(value.reference);setLines(value.lines.map((l:any)=>({...l,name:l.productId,sku:'',quantity:String(l.quantity)})));setUncertain(true);}setRecovered(true);}).catch(onError);},[]);
 const locked=saving||uncertain||!recovered,term=query.trim().toLowerCase();
 const matches=term?products.filter(p=>[p.name,p.sku].some(value=>value.toLowerCase().includes(term))):[];
 const units=lines.reduce((sum,line)=>sum+(Number(line.quantity)||0),0);
 function add(product:Product){
  if(locked)return;
  if(lines.length>=100&&!lines.some(line=>line.productId===product.id)){onError(new Error('You can add up to 100 products per purchase.'));return;}
  setLines(current=>current.some(line=>line.productId===product.id)?current.map(line=>line.productId===product.id?{...line,quantity:String(Math.min(1000000,(Number(line.quantity)||0)+1))}:line):[...current,{productId:product.id,name:product.name,sku:product.sku,quantity:'1'}]);
  setQuery('');searchRef.current?.focus();
 }
 async function save(event:FormEvent){
  event.preventDefault();if(savingRef.current||!recovered)return;
  if(!pending.current){
   if(!lines.length){onError(new Error('Add at least one product to this purchase.'));return;}
   if(lines.some(line=>!Number.isSafeInteger(Number(line.quantity))||Number(line.quantity)<=0)){onError(new Error('Enter a positive whole quantity for each product.'));return;}
   pending.current={id:crypto.randomUUID(),date,supplier,reference,lines:lines.map(line=>({productId:line.productId,quantity:Number(line.quantity)}))};
  }
  savingRef.current=true;setSaving(true);
  try{
   await keepOperation(ownerId,'purchase',pending.current);
   const response=await fetch('/api/purchases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.current)});
   if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Could not confirm the save. Please retry this same purchase.');
   const result=await response.json() as Purchase&{error?:string};
   if(!response.ok)throw Object.assign(new Error(result.error||'Could not save the purchase.'),{status:response.status});
   await finishOperation(ownerId,'purchase');pending.current=null;setUncertain(false);setLines([]);setQuery('');setSupplier('');setReference('');setDate(today());onSaved(result);setDetail(result);
   toast.success(t(result.units+' units added to stock.'));
   await onRefresh();
  }catch(error){
   const status=(error as {status?:number}).status;
   if(status&&status<500){await finishOperation(ownerId,'purchase');pending.current=null;setUncertain(false);}else{setUncertain(true);}
   onError(error);
  }finally{savingRef.current=false;setSaving(false);}
 }
 return <div className="purchases-layout">
  <form className="purchase-form panel" onSubmit={save}>
   <div className="purchase-section-heading"><div><h2>{t("New purchase")}</h2><p>{t("Record goods you’ve received into stock.")}</p></div><Package size={23}/></div>
   {uncertain&&<div className="notice warning"><AlertCircle size={18}/><span>{t("We couldn’t confirm this purchase. Retry saving it to avoid adding the stock twice.")}</span></div>}
   <fieldset disabled={locked} className="purchase-fields">
    <div className="purchase-meta-fields">
     <label>{t("Purchase date")}<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label>{t("Supplier (optional)")}<input maxLength={100} value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder={t("Supplier name")}/></label>
     <label>{t("Reference (optional)")}<input maxLength={100} value={reference} onChange={e=>setReference(e.target.value)} placeholder={t("Receipt or invoice number")}/></label>
    </div>
    <div className="purchase-product-heading"><h3>{t("Products received")}</h3><button type="button" className="text-button" disabled={!ready||!online||locked} onClick={()=>onNewProduct(add)}><Plus size={16}/>{t("New product")}</button></div>
    <div className="search-box purchase-search"><Search size={18}/><input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(matches.length===1)add(matches[0]);}}} placeholder={t("Search a product name or SKU…")} aria-label={t("Search products for purchase")} disabled={!ready}/>{query&&<button type="button" className="icon-button" aria-label={t("Clear purchase product search")} onClick={()=>setQuery('')}><X size={15}/></button>}</div>
    {term&&<div className="sale-search-results purchase-matches"><ul aria-label={t("Products to add to purchase")}>{matches.slice(0,20).map(product=><li key={product.id}><button type="button" className="sale-search-result" onClick={()=>add(product)}><span className="purchase-product-photo">{product.photo?<img src={product.photo} alt=""/>:<Package size={21}/>}</span><span className="sale-result-details"><b>{product.name}</b><span>{product.sku||product.category}{' '}{t("· Current quantity:")}{' '}{product.quantity}</span></span><span className="sale-result-add"><Plus size={18}/><span>{t("Add")}</span></span></button></li>)}</ul>{!matches.length&&<p className="sale-search-count">{t("No matching products. Use “New product” to create one.")}</p>}{matches.length>20&&<p className="sale-search-count">{t("Showing the first 20 matches. Keep typing to narrow your search.")}</p>}</div>}
    {lines.length?<div className="purchase-lines">
     <div className="purchase-line-labels"><span>{t("Product")}</span><span>{t("Current")}</span><span>{t("Received")}</span><span>{t("After purchase")}</span><span/></div>
     {lines.map(line=>{const product=products.find(p=>p.id===line.productId);return <div className="purchase-line" key={line.productId}>
      <div className="purchase-line-name"><b>{product?.name||line.name}</b><span>{product?product.sku||product.category:t("Product unavailable — remove this line")}</span></div>
      <div className="purchase-stock"><span className="mobile-field-label">{t("Current")}</span>{product?.quantity??'—'}</div>
      <label className="purchase-quantity"><span className="sr-only">{t("Quantity received for")}{' '}{line.name}</span><span className="mobile-field-label" aria-hidden="true">{t("Received")}</span><input required type="number" min="1" max="1000000" step="1" value={line.quantity} onFocus={e=>e.target.select()} onChange={e=>setLines(current=>current.map(item=>item.productId===line.productId?{...item,quantity:e.target.value}:item))}/></label>
      <div className="purchase-stock purchase-new-stock"><span className="mobile-field-label">{t("After purchase")}</span>{product&&line.quantity?product.quantity+Number(line.quantity):'—'}</div>
      <button type="button" className="icon-button purchase-remove" aria-label={t("Remove ")+line.name+t(" from purchase")} onClick={()=>setLines(current=>current.filter(item=>item.productId!==line.productId))}><Trash2 size={17}/></button>
     </div>;})}
    </div>:<Empty className="purchase-empty"><EmptyHeader><Package size={28} strokeWidth={1.3}/><EmptyTitle>{t("Add the goods you received")}</EmptyTitle><EmptyDescription>{t("Search above to add several products, then enter the quantity received for each.")}</EmptyDescription></EmptyHeader></Empty>}
   </fieldset>
   <div className="purchase-save-bar"><div><strong>{lines.length} {lines.length===1?t("product"):t("products")}</strong><span>{units.toLocaleString(locale)}{' '}{t("units to add")}</span></div><button className="primary" disabled={!lines.length||!ready||!online||saving||!recovered}>{saving?<LoaderCircle size={18} className="spin"/>:<Check size={18}/>} {uncertain?t("Retry saving purchase"):t("Save purchase & add stock")}</button></div>
   <p className="form-note">{t("Saving adds these quantities to your current stock. Selling prices stay the same.")}</p>
  </form>
  <aside className="purchase-history panel"><div className="purchase-section-heading"><div><h2>{t("Recent purchases")}</h2><p>{t("Your last")}{' '}{Math.min(purchases.length,500)}{' '}{t("saved purchases")}</p></div></div>{purchases.length?<ul>{purchases.map(purchase=><li key={purchase.id}><button onClick={()=>setDetail(purchase)}><div><b>{purchase.supplier||t("Stock purchase")}</b><span>{displayDate(purchase.date)} · {purchase.lines.length}{' '}{t("products")}</span><small>{purchase.reference||purchase.number}</small></div><span className="purchase-history-units">+{purchase.units}<ArrowUpRight size={16}/></span></button></li>)}</ul>:<p className="purchase-history-empty">{t("Saved purchases will appear here so you can check what was added to stock.")}</p>}</aside>
  <Dialog open={!!detail} onOpenChange={open=>{if(!open)setDetail(null);}}><DialogContent className="app-dialog"><DialogTitle>{t("Purchase recorded")}</DialogTitle><DialogDescription>{t("Stock was increased by the quantities below.")}</DialogDescription>{detail&&<><div className="purchase-detail-meta"><b>{detail.number}</b><span>{displayDate(detail.date)}</span>{detail.supplier&&<span>{t("Supplier:")}{' '}{detail.supplier}</span>}{detail.reference&&<span>{t("Reference:")}{' '}{detail.reference}</span>}</div><div className="purchase-detail-lines">{detail.lines.map(line=><div key={line.productId}><span>{line.name}</span><b>+{line.quantity}</b></div>)}</div><div className="purchase-detail-total"><b>{t("Total units added")}</b><strong>{detail.units.toLocaleString(locale)}</strong></div><button className="primary" onClick={()=>setDetail(null)}>{t("Done")}</button></>}</DialogContent></Dialog>
 </div>;
}
