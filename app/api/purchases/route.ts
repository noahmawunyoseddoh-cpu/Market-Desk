import {automaticBackup} from '@/lib/backups';
import { boundary,database,workspace,json,body,textField,integer,AppError } from '@/lib/server';
import type { Product,Purchase,PurchaseLine } from '@/lib/model';

export async function POST(request:Request){return boundary(async()=>{
 const actor=await workspace(request,'purchase'),user=actor.businessId,input=await body(request),db=database();
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError('Please check the purchase details.');
 const id=textField(input.id,36,true);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))throw new AppError('Please start a new purchase.');
 const findSaved=()=>db.prepare('SELECT data FROM purchases WHERE id=? AND owner=?').bind(id,user).first<{data:string}>();
 const existing=await findSaved();if(existing)return json(JSON.parse(existing.data));
 if(await db.prepare('SELECT id FROM retired_operations WHERE id=?').bind(id).first())throw new AppError('This record was removed by a restore. Review recovery history before recording anything again.',409);
 const purchaseDate=textField(input.date,10,true);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)||!Number.isFinite(Date.parse(purchaseDate))||new Date(purchaseDate).toISOString().slice(0,10)!==purchaseDate)throw new AppError('Choose a valid purchase date.');
 if(!Array.isArray(input.lines)||!input.lines.length||input.lines.length>100)throw new AppError('Add between 1 and 100 products to this purchase.');
 const supplier=textField(input.supplier??'',100),reference=textField(input.reference??'',100);
 const products=await db.prepare('SELECT id,name,sku,quantity FROM products WHERE owner=?').bind(user).all<Product>();
 const seen=new Set<string>();
 const lines:PurchaseLine[]=input.lines.map((line:any)=>{
  if(!line||typeof line!=='object')throw new AppError('Please check each product and quantity.');
  const p=products.results.find(p=>p.id===line.productId);
  if(!p||seen.has(p.id))throw new AppError('A product is unavailable or repeated. Refresh and review the purchase.',409);
  seen.add(p.id);const quantity=integer(line.quantity,1000000,1);
  if(p.quantity+quantity>1000000)throw new AppError('The new stock quantity for '+p.name+' would exceed 1,000,000.');
  return {productId:p.id,name:p.name,sku:p.sku,quantity};
 });
 const createdAt=new Date().toISOString();
 const purchase:Purchase={id,number:'PUR-'+purchaseDate.replaceAll('-','')+'-'+id.slice(0,8).toUpperCase(),createdAt,date:purchaseDate,supplier,reference,lines,units:lines.reduce((n,line)=>n+line.quantity,0),recordedBy:{userId:actor.userId,name:actor.displayName,email:actor.email,role:actor.isOwner?'owner':'staff'}};
 // All changes run in one transaction. A strict insert prevents duplicate retries;
 // the guard rechecks product existence and stock limits inside that transaction.
 // Existing IDs always attempt the insert, even if the stock guard now fails,
 // so a duplicate request rolls back before it can run any stock updates.
 const insert=db.prepare(`INSERT INTO purchases (id,owner,created_at,data)
  SELECT ?,?,?,? WHERE ((
   SELECT COUNT(*) FROM products p JOIN json_each(?) l ON p.id=json_extract(l.value,'$.productId')
   WHERE p.owner=? AND p.quantity+CAST(json_extract(l.value,'$.quantity') AS INTEGER)<=1000000
  )=? AND NOT EXISTS(SELECT 1 FROM retired_operations WHERE id=?)) OR EXISTS(SELECT 1 FROM purchases WHERE id=?)`).bind(id,user,createdAt,JSON.stringify(purchase),JSON.stringify(lines),user,lines.length,id,id);
 const updates=lines.map(line=>db.prepare(`UPDATE products SET quantity=quantity+?,revision=revision+1
  WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM purchases WHERE id=? AND owner=?)`).bind(line.quantity,line.productId,user,id,user));
 try{await db.batch([insert,...updates]);}catch(error){
  const concurrent=await findSaved();if(concurrent)return json(JSON.parse(concurrent.data));
  throw error;
 }
 const saved=await findSaved();
 if(!saved)throw new AppError('Stock or products changed while saving. Refresh and review this purchase.',409);
 await automaticBackup(user);return json(JSON.parse(saved.data));
});}
