import {automaticBackup} from '@/lib/backups';
import { boundary,database,owner,json,body,textField,integer,AppError } from '@/lib/server';
import { sampleProducts } from '@/lib/model';
import {isCurrency,currencyOf} from '@/lib/currency';
export const dynamic = 'force-dynamic';
export async function POST(request:Request){return boundary(async()=>{
 const user=await owner(request,'products'),data=await body(request),db=database();
 const settings=await db.prepare('SELECT data FROM businesses WHERE owner=?').bind(user).first<{data:string}>();
 const currency=data.currency??'GHS',current=currencyOf(settings?JSON.parse(settings.data).currency:undefined);
 if(!isCurrency(currency))throw new AppError('Choose a supported currency.');
 if(currency!==current)throw new AppError('The shop currency changed. Refresh and review the product price.',409);
 if(data.action==='samples'){
  if(currency!=='GHS')throw new AppError('Add your own products and CFA prices to start selling.');
  const existing=await db.prepare('SELECT COUNT(*) AS count FROM products WHERE owner=?').bind(user).first<{count:number}>();
  if(existing?.count)throw new AppError('Sample products can only be added to an empty catalog.');
  await db.batch(sampleProducts.map((p,i)=>db.prepare("INSERT OR IGNORE INTO products (id,owner,name,sku,category,price,quantity,photo,sample,created_at) VALUES (?,?,?,?,?,?,?,'',1,?)").bind(user+'-sample-'+i,user,p.name,p.sku,p.category,p.price,p.quantity,new Date().toISOString())));
  await automaticBackup(user);return json({ok:true});
 }
 const id=data.id?textField(data.id,100,true):crypto.randomUUID();
 const name=textField(data.name,100,true),sku=textField(data.sku??'',40),category=textField(data.category||'General',40,true),photo=textField(data.photo??'',300);
 if(photo&&!photo.startsWith('/api/photos?key='+encodeURIComponent(user+'/')))throw new AppError('Please choose a photo from your shop.');
 const price=integer(data.price,100000000),quantity=integer(data.quantity,1000000);
 const currencyGuard="COALESCE((SELECT json_extract(data,'$.currency') FROM businesses WHERE owner=?),'GHS')=?";
 if(data.id){
  const revision=integer(data.revision,Number.MAX_SAFE_INTEGER);
  const result=await db.prepare(`UPDATE products SET name=?,sku=?,category=?,
   prices=json_set(COALESCE(prices,json_object('GHS',price)),?,?),quantity=?,photo=?,revision=revision+1
   WHERE id=? AND owner=? AND revision=? AND ${currencyGuard}`).bind(name,sku,category,'$.'+currency,price,quantity,photo,id,user,revision,user,currency).run();
  if(!result.meta.changes)throw new AppError('This product or its stock changed. Close the form, refresh, and reopen it before saving.',409);
 }else{
  const result=await db.prepare(`INSERT INTO products (id,owner,name,sku,category,price,prices,quantity,photo,created_at)
   SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${currencyGuard}`).bind(id,user,name,sku,category,currency==='GHS'?price:0,JSON.stringify({[currency]:price}),quantity,photo,new Date().toISOString(),user,currency).run();
  if(!result.meta.changes)throw new AppError('The shop currency changed. Refresh and review the product price.',409);
 }
 await automaticBackup(user);return json({id});
});}
export async function DELETE(request:Request){return boundary(async()=>{const user=await owner(request,'products'),id=new URL(request.url).searchParams.get('id');if(!id)throw new AppError('Choose a product.');await database().prepare('DELETE FROM products WHERE owner=? AND id=?').bind(user,id).run();await automaticBackup(user);return json({ok:true});});}
