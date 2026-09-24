import {paymentStatements,summarizePayments} from '@/lib/payments';
import {isCurrency} from '@/lib/currency';
import { boundary,database,owner,json,AppError } from '@/lib/server';

export const dynamic='force-dynamic';
function validDate(value:string|null):value is string{return !!value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export async function GET(request:Request){return boundary(async()=>{
 const user=await owner(undefined,'reports'),params=new URL(request.url).searchParams,start=params.get('start'),end=params.get('end');
 if(!validDate(start)||!validDate(end)||start>end)throw new AppError('Choose a valid start and end date.');
 const currency=params.get('currency')??'GHS';if(!isCurrency(currency))throw new AppError('Choose a supported currency.');
 const from=start+'T00:00:00.000Z',until=new Date(Date.parse(end)+86400000).toISOString(),db=database();
 const [totals,units,daily,products,paymentSales,paymentRefunds]=await db.batch<Record<string,string|number>>([
  db.prepare(`SELECT COUNT(*) AS transactions,COALESCE(SUM(total),0) AS net,
   COALESCE(SUM(CAST(json_extract(data,'$.subtotal') AS INTEGER)),0) AS gross,
   COALESCE(SUM(CAST(json_extract(data,'$.discount') AS INTEGER)),0) AS discounts
   FROM sales WHERE owner=? AND created_at>=? AND created_at<? AND COALESCE(json_extract(data,'$.currency'),'GHS')=?`).bind(user,from,until,currency),
  db.prepare(`SELECT COALESCE(SUM(CAST(json_extract(l.value,'$.quantity') AS INTEGER)),0) AS units
   FROM sales s,json_each(s.data,'$.lines') l WHERE s.owner=? AND s.created_at>=? AND s.created_at<? AND COALESCE(json_extract(data,'$.currency'),'GHS')=?`).bind(user,from,until,currency),
  db.prepare(`SELECT substr(created_at,1,10) AS date,COUNT(*) AS transactions,SUM(total) AS net
   FROM sales WHERE owner=? AND created_at>=? AND created_at<? AND COALESCE(json_extract(data,'$.currency'),'GHS')=? GROUP BY substr(created_at,1,10) ORDER BY date DESC`).bind(user,from,until,currency),
  db.prepare(`SELECT json_extract(l.value,'$.productId') AS productId,
   COALESCE(MAX(p.name),MAX(json_extract(l.value,'$.name'))) AS name,
   SUM(CAST(json_extract(l.value,'$.quantity') AS INTEGER)) AS units,
   SUM(CAST(json_extract(l.value,'$.quantity') AS INTEGER)*CAST(json_extract(l.value,'$.price') AS INTEGER)) AS gross
   FROM sales s JOIN json_each(s.data,'$.lines') l
   LEFT JOIN products p ON p.id=json_extract(l.value,'$.productId') AND p.owner=s.owner
   WHERE s.owner=? AND s.created_at>=? AND s.created_at<? AND COALESCE(json_extract(s.data,'$.currency'),'GHS')=?
   GROUP BY json_extract(l.value,'$.productId') ORDER BY units DESC,gross DESC,name ASC`).bind(user,from,until,currency),
  ...paymentStatements(user,from,until,currency),
 ]);
 const payments=summarizePayments([paymentSales,paymentRefunds]),refunds=payments.reduce((n,p)=>n+p.refunds,0);
 return json({start,end,currency,payments,totals:{...totals.results[0],...units.results[0],refunds,afterRefunds:Number(totals.results[0].net)-refunds},daily:daily.results,products:products.results});
});}
