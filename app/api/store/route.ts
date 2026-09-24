import {automaticBackup} from '@/lib/backups';
import { boundary, database, workspace, json } from '@/lib/server';
import { defaultBusiness,pricesFor,type ProductRow } from '@/lib/model';
import {languageOf} from '@/lib/i18n';
import {currencyOf} from '@/lib/currency';
export const dynamic = 'force-dynamic';
export async function GET(){return boundary(async()=>{
 const actor=await workspace(undefined,'read'),user=actor.businessId,db=database();
 const [products,sales,business,purchases,adjustments,state,backup]=await db.batch([
  db.prepare('SELECT id,name,sku,category,price,prices,quantity,photo,sample,revision FROM products WHERE owner=? ORDER BY created_at DESC,name').bind(user),
  db.prepare('SELECT data FROM sales WHERE owner=? ORDER BY created_at DESC LIMIT 500').bind(user),
  db.prepare('SELECT data FROM businesses WHERE owner=?').bind(user),
  db.prepare('SELECT data FROM purchases WHERE owner=? ORDER BY created_at DESC LIMIT 500').bind(user),
  db.prepare('SELECT data FROM adjustments WHERE owner=? ORDER BY created_at').bind(user),
  db.prepare('SELECT revision FROM shop_revision WHERE owner=?').bind(user),
  db.prepare('SELECT created_at,revision FROM backups WHERE owner=? ORDER BY revision DESC,created_at DESC LIMIT 1').bind(user),
 ]);
 const settings=business.results[0]?JSON.parse((business.results[0] as {data:string}).data):defaultBusiness,currency=currencyOf(settings.currency);
 return json({ownerId:user,businessId:user,isOwner:actor.isOwner,permissions:[...actor.permissions],revision:(state.results[0] as any)?.revision??0,backup:backup.results[0]??null,products:(products.results as ProductRow[]).map(row=>{const {prices,...product}=row,price=pricesFor(row)[currency];return {...product,price:price??0,priced:price!==undefined,currency};}),sales:sales.results.map((s:any)=>{const sale=JSON.parse(s.data);return {...sale,adjustments:adjustments.results.map((r:any)=>JSON.parse(r.data)).filter((a:any)=>a.saleId===sale.id)};}),business:{...settings,currency,language:languageOf(settings.language)},purchases:purchases.results.map((p:any)=>JSON.parse(p.data))});
});}
