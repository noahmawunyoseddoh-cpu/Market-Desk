import {database,AppError} from './server';
import {isCurrency,type Currency} from './currency';
export function period(start:string|null,end:string|null,currency:string|null){
 const valid=(v:string|null)=>!!v&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!valid(start)||!valid(end)||start!>end!)throw new AppError('Choose a valid start and end date.');
 if(!isCurrency(currency))throw new AppError('Choose a supported currency.');
 return {from:start+'T00:00:00.000Z',until:new Date(Date.parse(end!)+86400000).toISOString(),currency:currency as Currency};
}
export function paymentStatements(user:string,from:string,until:string,currency:Currency){
 return [
 database().prepare(`SELECT COALESCE(json_extract(data,'$.paymentMethod'),'unspecified') AS method,SUM(total) AS amount FROM sales WHERE owner=? AND created_at>=? AND created_at<? AND COALESCE(json_extract(data,'$.currency'),'GHS')=? GROUP BY method`).bind(user,from,until,currency),
 database().prepare(`SELECT json_extract(data,'$.paymentMethod') AS method,SUM(amount) AS amount FROM adjustments WHERE owner=? AND created_at>=? AND created_at<? AND currency=? GROUP BY method`).bind(user,from,until,currency)];
}
export function summarizePayments(rows:{results:any[]}[]){
 return ['cash','mobile_money','card','unspecified'].map(method=>{const sales=Number((rows[0].results.find((r:any)=>r.method===method) as any)?.amount??0),refunds=Number((rows[1].results.find((r:any)=>r.method===method) as any)?.amount??0);return {method,sales,refunds,expected:sales-refunds};});
}

export async function paymentTotals(user:string,from:string,until:string,currency:Currency){return summarizePayments(await database().batch(paymentStatements(user,from,until,currency)));}
