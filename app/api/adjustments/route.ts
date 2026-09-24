import {boundary,owner,database,json,body,textField,integer,AppError} from '@/lib/server';
import {automaticBackup} from '@/lib/backups';
import {paymentMethods,saleCurrency,type Sale,type Adjustment} from '@/lib/model';
export async function POST(request:Request){return boundary(async()=>{
 const user=await owner(request,'refund'),d=await body(request),db=database(),id=textField(d.id,36,true);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))throw new AppError('Invalid refund request.');
 const find=()=>db.prepare('SELECT data FROM adjustments WHERE id=? AND owner=?').bind(id,user).first<{data:string}>();const existing=await find();if(existing)return json(JSON.parse(existing.data));
 if(await db.prepare('SELECT id FROM retired_operations WHERE id=?').bind(id).first())throw new AppError('This record was removed by a restore. Review recovery history before recording anything again.',409);
 const saleId=textField(d.saleId,100,true),row=await db.prepare('SELECT data FROM sales WHERE id=? AND owner=?').bind(saleId,user).first<{data:string}>();if(!row)throw new AppError('Invoice not found.',404);
 const sale=JSON.parse(row.data) as Sale,previous=(await db.prepare('SELECT data FROM adjustments WHERE owner=? AND sale_id=?').bind(user,saleId).all<{data:string}>()).results.map(r=>JSON.parse(r.data) as Adjustment);
 if(previous.some(a=>a.kind==='cancel'))throw new AppError('This invoice is already cancelled.',409);
 const amount=integer(d.amount,sale.total-previous.reduce((n,a)=>n+a.amount,0)),kind=d.kind==='cancel'?'cancel':'refund';
 if(kind==='cancel'&&amount!==sale.total-previous.reduce((n,a)=>n+a.amount,0))throw new AppError('Cancellation must refund the remaining paid amount.');
 if(!paymentMethods.includes(d.paymentMethod))throw new AppError('Choose the refund payment method.');
 if(d.confirmed!==true)throw new AppError('Confirm the money has been refunded.');
 if(!Array.isArray(d.lines)||d.lines.length>100)throw new AppError('Check the returned quantities.');
 const seen=new Set<string>();
 const lines:Adjustment['lines']=d.lines.map((l:any)=>{const original=sale.lines.find(line=>line.productId===l?.productId);if(!original||seen.has(original.productId))throw new AppError('Check the returned products.');seen.add(original.productId);const returned=previous.reduce((n,a)=>n+a.lines.filter(x=>x.productId===original.productId).reduce((v,x)=>v+x.quantity,0),0);const quantity=integer(l.quantity,original.quantity-returned,1);if(l.restock&&sale.stockDeducted!==true)throw new AppError('This old invoice did not deduct stock. Adjust stock manually.');return {productId:original.productId,name:original.name,quantity,restock:l.restock===true};});
 if(!amount&&!lines.length&&kind!=='cancel')throw new AppError('Enter a refund amount or returned items.');
 const restocked=lines.filter(l=>l.restock),createdAt=new Date().toISOString();
 const adjustment:Adjustment={id,saleId,number:'CN-'+id.slice(0,8).toUpperCase(),invoice:sale.invoice,createdAt,kind,amount,currency:saleCurrency(sale),reason:textField(d.reason,300,true),paymentMethod:d.paymentMethod,lines};
 const insert=db.prepare(`INSERT INTO adjustments(id,owner,sale_id,created_at,amount,currency,data) SELECT ?,?,?,?,?,?,? WHERE (
 (SELECT COUNT(*) FROM adjustments WHERE owner=? AND sale_id=?)=?
 AND EXISTS(SELECT 1 FROM sales WHERE id=? AND owner=? AND data=?)
 AND (SELECT COUNT(*) FROM products p JOIN json_each(?) l ON p.id=json_extract(l.value,'$.productId') WHERE p.owner=? AND p.quantity+json_extract(l.value,'$.quantity')<=1000000)=?
 AND NOT EXISTS(SELECT 1 FROM retired_operations WHERE id=?)
 ) OR EXISTS(SELECT 1 FROM adjustments WHERE id=?)`).bind(id,user,saleId,createdAt,amount,adjustment.currency,JSON.stringify(adjustment),user,saleId,previous.length,saleId,user,row.data,JSON.stringify(restocked),user,restocked.length,id,id);
 const stock=restocked.map(l=>db.prepare('UPDATE products SET quantity=quantity+?,revision=revision+1 WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM adjustments WHERE id=? AND owner=?)').bind(l.quantity,l.productId,user,id,user));
 try{await db.batch([insert,...stock]);}catch(error){const duplicate=await find();if(duplicate)return json(JSON.parse(duplicate.data));throw error;}
 const saved=await find();if(!saved)throw new AppError('Invoice or stock changed. Reopen the invoice and review the refund. Returned products must exist in your catalog.',409);
 await automaticBackup(user);return json(JSON.parse(saved.data));
});}
