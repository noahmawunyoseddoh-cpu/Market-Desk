import {automaticBackup} from '@/lib/backups';
import { boundary,database,owner,json,body,textField,AppError } from '@/lib/server';
import { isCurrency } from '@/lib/currency';
export async function POST(request:Request){return boundary(async()=>{
 const user=await owner(request,'settings'),d=await body(request),db=database();
 if(d.language!=='en'&&d.language!=='fr')throw new AppError('Choose English or French.');
 if(!isCurrency(d.currency))throw new AppError('Choose Ghana cedis or Togo CFA francs.');
 const business={name:textField(d.name,100,true),phone:textField(d.phone,40),email:textField(d.email,100),address:textField(d.address,200),footer:textField(d.footer,180),currency:d.currency,language:d.language};
 const previous=d.previousCurrency??'GHS';if(!isCurrency(previous))throw new AppError('Refresh your shop settings.',409);
 const saved=await db.prepare(`INSERT INTO businesses (owner,data) VALUES (?,?)
  ON CONFLICT(owner) DO UPDATE SET data=excluded.data
  WHERE COALESCE(json_extract(businesses.data,'$.currency'),'GHS')=?`).bind(user,JSON.stringify(business),previous).run();
 if(!saved.meta.changes)throw new AppError('Shop currency changed on another device. Refresh before saving.',409);
 await automaticBackup(user);return json(business);
});}
