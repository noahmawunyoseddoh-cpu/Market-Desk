import {boundary,owner,database,json,body,textField,integer,AppError} from '@/lib/server';
import {period,paymentTotals,paymentStatements,summarizePayments} from '@/lib/payments';
import {revision,automaticBackup} from '@/lib/backups';
export async function GET(request:Request){return boundary(async()=>{const user=await owner(undefined,'payments'),params=new URL(request.url).searchParams,date=params.get('date'),{from,until,currency}=period(date,date,params.get('currency'));
 const [sales,refunds,state,history]=await database().batch([...paymentStatements(user,from,until,currency),database().prepare('SELECT revision FROM shop_revision WHERE owner=?').bind(user),database().prepare("SELECT data FROM reconciliations WHERE owner=? AND json_extract(data,'$.date')=? AND json_extract(data,'$.currency')=? ORDER BY created_at DESC LIMIT 20").bind(user,date,currency)]);
 return json({date,currency,expected:summarizePayments([sales,refunds]),revision:(state.results[0] as any)?.revision??0,history:history.results.map((row:any)=>JSON.parse(row.data))});});}
export async function POST(request:Request){return boundary(async()=>{const user=await owner(request,'payments'),d=await body(request),db=database(),id=textField(d.id,36,true);if(!/^[0-9a-f-]{36}$/.test(id))throw new AppError('Invalid reconciliation request.');
 const existing=await db.prepare('SELECT data FROM reconciliations WHERE id=? AND owner=?').bind(id,user).first<{data:string}>();if(existing)return json(JSON.parse(existing.data));
 const {from,until,currency}=period(d.date,d.date,d.currency),expectedRevision=integer(d.revision,Number.MAX_SAFE_INTEGER);
 if(await revision(user)!==expectedRevision)throw new AppError('Payments changed. Refresh the totals before reconciling.',409);
 const expected=await paymentTotals(user,from,until,currency);
 const counts=expected.map(row=>{const actual=d.actual?.[row.method];if(!Number.isSafeInteger(actual)||Math.abs(actual)>100000000000)throw new AppError('Enter a valid amount for each payment method.');return {...row,actual,difference:actual-row.expected};});
 const createdAt=new Date().toISOString(),record={id,createdAt,date:d.date,currency,counts,note:textField(d.note??'',300)};
 await db.prepare(`INSERT INTO reconciliations(id,owner,created_at,data) SELECT ?,?,?,? WHERE COALESCE((SELECT revision FROM shop_revision WHERE owner=?),0)=?`).bind(id,user,createdAt,JSON.stringify(record),user,expectedRevision).run();
 const saved=await db.prepare('SELECT data FROM reconciliations WHERE id=? AND owner=?').bind(id,user).first<{data:string}>();if(!saved)throw new AppError('Payments changed. Refresh the totals before reconciling.',409);
 await automaticBackup(user);return json(JSON.parse(saved.data));
});}
