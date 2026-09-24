import {automaticBackup,revision} from '@/lib/backups';
import { boundary,database,workspace,json,body,textField,integer,AppError } from '@/lib/server';
import { defaultBusiness,pricesFor,type ProductRow,type Sale,type Line,paymentMethods } from '@/lib/model';
import {currencyOf,isCurrency} from '@/lib/currency';
export async function POST(request:Request){return boundary(async()=>{
 const actor=await workspace(request,'sell'),user=actor.businessId,d=await body(request),db=database();
 const id=textField(d.id,36,true);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))throw new AppError('Please start a new sale.');
 const findSaved=()=>db.prepare('SELECT data FROM sales WHERE id=? AND owner=?').bind(id,user).first<{data:string}>();
 const existing=await findSaved();if(existing)return json({...JSON.parse(existing.data),syncRevision:await revision(user)});
 if(await db.prepare('SELECT id FROM retired_operations WHERE id=?').bind(id).first())throw new AppError('This record was removed by a restore. Review recovery history before recording anything again.',409);
 const settings=await db.prepare('SELECT data FROM businesses WHERE owner=?').bind(user).first<{data:string}>();
 const business=settings?JSON.parse(settings.data):defaultBusiness,currency=d.currency??'GHS';
 if(!isCurrency(currency))throw new AppError('Choose a supported currency.');
 const reconcile=d.offline===true&&d.reconcile===true;
 if(d.ownerId!==undefined&&d.ownerId!==actor.businessId)throw new AppError('This offline sale belongs to another account.',403);
 if(currency!==currencyOf(business.currency)&&!reconcile)throw new AppError('The shop currency changed. Refresh and review this sale.',409);
 if(!Array.isArray(d.lines)||!d.lines.length||d.lines.length>100)throw new AppError('Add between 1 and 100 products to the sale.');
 const ids=new Set<string>(),rows=await db.prepare('SELECT * FROM products WHERE owner=?').bind(user).all<ProductRow>();
 const lines:Line[]=d.lines.map((l:any)=>{
  if(!l||typeof l!=='object')throw new AppError('Check each product and quantity.');
  const p=rows.results.find(p=>p.id===l.productId);
  if(!p||ids.has(p.id))throw new AppError('A product changed or was removed. Refresh and review the cart.',409);
  ids.add(p.id);const price=reconcile?integer(l.price,100000000):pricesFor(p)[currency],quantity=integer(l.quantity,10000,1);
  if(price===undefined)throw new AppError('Set a '+currency+' price for '+p.name+' before selling it.',409);
  if(l.price!==price)throw new AppError('A product price changed. Refresh and review the cart.',409);
  if(p.quantity<quantity)throw new AppError('Only '+p.quantity+' units of '+p.name+' are available. Adjust the sale or record a purchase.',409);
  return {productId:p.id,name:d.offline===true&&l.name?textField(l.name,100,true):p.name,price,quantity};
 });
 const subtotal=lines.reduce((sum,l)=>sum+l.price*l.quantity,0);
 if(!Number.isSafeInteger(subtotal)||subtotal>100000000000)throw new AppError('This sale exceeds the supported amount.');
 const discount=integer(d.discount,subtotal),total=subtotal-discount,received=integer(d.received,100000000000);
 if(received<total)throw new AppError('Amount received must cover the total.');
 const savedAt=new Date().toISOString();
 let createdAt=savedAt;
 if(d.capturedAt!==undefined){const stamp=Date.parse(textField(d.capturedAt,30,true));if(!Number.isFinite(stamp)||stamp<Date.parse('2000-01-01')||stamp>Date.now()+300000)throw new AppError('Check this device’s date and time.');createdAt=new Date(stamp).toISOString();}
 const paymentMethod=d.paymentMethod??'unspecified';if(![...paymentMethods,'unspecified'].includes(paymentMethod))throw new AppError('Choose a payment method.');
 if(paymentMethod!=='cash'&&paymentMethod!=='unspecified'&&received!==total)throw new AppError('Mobile money and card payments must equal the sale total.');
 let invoiceBusiness={...business,currency};
 if(d.offline===true&&d.business){const b=d.business;invoiceBusiness={name:textField(b.name,100,true),phone:textField(b.phone,40),email:textField(b.email,100),address:textField(b.address,200),footer:textField(b.footer,180),language:b.language==='fr'?'fr':'en',currency};}

 const sale:Sale={id,invoice:'MD-'+createdAt.slice(0,10).replaceAll('-','')+'-'+id.slice(0,8).toUpperCase(),createdAt,lines,subtotal,discount,total,received,change:received-total,customer:textField(d.customer??'',100),contact:textField(d.contact??'',120),business:invoiceBusiness,currency,stockDeducted:true,savedAt,paymentMethod,paymentReference:textField(d.paymentReference??'',100),soldBy:{userId:actor.userId,name:actor.displayName,email:actor.email,role:actor.isOwner?'owner':'staff'},reconciledOffline:reconcile};
 // The invoice and stock changes commit together. Existing IDs must hit the
 // strict unique insert even when stock is now insufficient, preventing retries
 // from reaching the stock updates a second time.
 const insert=db.prepare(`INSERT INTO sales (id,owner,invoice,created_at,total,data)
  SELECT ?,?,?,?,?,? WHERE (
   (SELECT COUNT(*) FROM products p JOIN json_each(?) l ON p.id=json_extract(l.value,'$.productId')
    WHERE p.owner=? AND p.quantity>=json_extract(l.value,'$.quantity')
    AND (?=1 OR json_extract(COALESCE(p.prices,json_object('GHS',p.price)),?)=json_extract(l.value,'$.price')))=?
   AND (?=1 OR COALESCE((SELECT json_extract(data,'$.currency') FROM businesses WHERE owner=?),'GHS')=?)
   AND NOT EXISTS(SELECT 1 FROM retired_operations WHERE id=?)
  ) OR EXISTS(SELECT 1 FROM sales WHERE id=?)`).bind(id,user,sale.invoice,createdAt,total,JSON.stringify(sale),JSON.stringify(lines),user,reconcile?1:0,'$.'+currency,lines.length,reconcile?1:0,user,currency,id,id);
 const updates=lines.map(line=>db.prepare(`UPDATE products SET quantity=quantity-?,revision=revision+1
  WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM sales WHERE id=? AND owner=?)`).bind(line.quantity,line.productId,user,id,user));
 try{await db.batch([insert,...updates]);}catch(error){const concurrent=await findSaved();if(concurrent)return json({...JSON.parse(concurrent.data),syncRevision:await revision(user)});throw error;}
 const saved=await findSaved();if(!saved)throw new AppError('Stock, prices or currency changed while saving. Refresh and review the sale.',409);
 await automaticBackup(user);return json({...JSON.parse(saved.data),syncRevision:await revision(user)});
});}
