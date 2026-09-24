'use client';

import { useState,useEffect } from 'react';
import { Download,ReceiptText,ShoppingBag,Package,Percent,RefreshCw,LoaderCircle } from 'lucide-react';
import { Table,TableHeader,TableBody,TableHead,TableRow,TableCell } from '@/components/ui/table';
import { Empty,EmptyHeader,EmptyTitle,EmptyDescription } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {paymentLabel} from '@/lib/model';
import {money as formatMoney,amountText,type Currency} from '@/lib/currency';
import {useI18n} from './i18n-provider';
import CurrencyChoice from './currency-choice';

type Report={start:string;end:string;currency:Currency;payments:{method:string;sales:number;refunds:number;expected:number}[];totals:{refunds:number;afterRefunds:number;transactions:number;net:number;gross:number;discounts:number;units:number};daily:{date:string;transactions:number;net:number}[];products:{productId:string;name:string;units:number;gross:number}[]};
const day=()=>new Date().toISOString().slice(0,10);
function csvCell(value:string|number){const text=String(value);return '"'+(/^[\s]*[=+@-]/.test(text)?"'"+text:text).replaceAll('"','""')+'"';}
export default function SalesReports({active,ready,refreshVersion,shopCurrency}:{active:boolean;ready:boolean;refreshVersion:number;shopCurrency:Currency}){
 const {t,locale}=useI18n();
 const [currency,setCurrency]=useState<Currency>(shopCurrency);
 useEffect(()=>setCurrency(shopCurrency),[shopCurrency]);
 const money=(value:number)=>formatMoney(value,currency,locale);
 const displayDate=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'});
 const [start,setStart]=useState(()=>day().slice(0,8)+'01'),[end,setEnd]=useState(day),[preset,setPreset]=useState('This month');
 const [report,setReport]=useState<Report|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const valid=!!start&&!!end&&start<=end;
 useEffect(()=>{
  if(!active||!ready||!valid)return;
  const controller=new AbortController();setLoading(true);setError('');setReport(null);
  fetch('/api/reports?'+new URLSearchParams({start,end,currency}),{signal:controller.signal}).then(async response=>{if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Please refresh and sign in again.');const data=await response.json() as Report&{error?:string};if(!response.ok)throw new Error(data.error||'Could not load the report.');return data;}).then(data=>{if(!controller.signal.aborted)setReport(data);}).catch(error=>{if(!controller.signal.aborted)setError(error.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[active,ready,valid,start,end,currency,retry,refreshVersion]);
 function period(value:string){const today=day();setPreset(value);setEnd(today);setStart(value==='Today'?today:value==='Last 7 days'?new Date(Date.parse(today)-6*86400000).toISOString().slice(0,10):today.slice(0,8)+'01');}
 function download(){if(!report)return;const rows:(string|number)[][]=[[t("MarketDesk sales report")],[t("From"),report.start,t("To"),report.end],[t("Currency"),report.currency],[t("Gross sales"),amountText(report.totals.gross,report.currency)],[t("Discounts"),amountText(report.totals.discounts,report.currency)],[t("Net sales"),amountText(report.totals.net,report.currency)],[t("Refunded"),amountText(report.totals.refunds,report.currency)],[t("After refunds"),amountText(report.totals.afterRefunds,report.currency)],[t("Transactions"),report.totals.transactions],[t("Units sold"),report.totals.units],[],[t('Payments')],[t('Payment method'),t('Collected'),t('Refunded'),t('Expected net')],...report.payments.map(p=>[t(paymentLabel(p.method)),amountText(p.sales,report.currency),amountText(p.refunds,report.currency),amountText(p.expected,report.currency)]),[],[t("Daily sales")],[t("Date"),t("Transactions"),t('Net sales')+' ('+report.currency+')'],...report.daily.map(d=>[d.date,d.transactions,amountText(d.net,report.currency)]),[],[t("Products sold")],[t("Product"),t("Units"),t('Gross sales')+' ('+report.currency+')'],...report.products.map(p=>[p.name,p.units,amountText(p.gross,report.currency)])];const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='sales-report-'+report.currency+'-'+report.start+'-to-'+report.end+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 const totals=report?.totals;
 return <section className="reports-surface">
  <div className="report-controls panel"><div className="report-presets">{['Today','Last 7 days','This month'].map(value=><button key={value} className={preset===value?'active':''} aria-pressed={preset===value} onClick={()=>period(value)}>{t(value)}</button>)}</div><div className="report-dates"><label className="report-currency">{t("Currency")}<CurrencyChoice value={currency} onChange={setCurrency}/></label><label>{t("From")}<input type="date" value={start} onChange={e=>{setStart(e.target.value);setPreset('Custom');}}/></label><label>{t("To")}<input type="date" value={end} onChange={e=>{setEnd(e.target.value);setPreset('Custom');}}/></label><button className="icon-button" aria-label={t("Refresh sales report")} disabled={loading||!valid||!ready} onClick={()=>setRetry(n=>n+1)}>{loading?<LoaderCircle size={18} className="spin"/>:<RefreshCw size={18}/>}</button><button className="secondary" disabled={!report||loading||!valid||report.start!==start||report.end!==end||report.currency!==currency} onClick={download}><Download size={17}/>{t("Export CSV")}</button></div></div>
  {!valid?<p className="notice warning">{t("Choose a start date on or before the end date.")}</p>:error?<Empty className="panel"><EmptyHeader><EmptyTitle>{t("Report couldn’t load")}</EmptyTitle><EmptyDescription>{t(error)}</EmptyDescription></EmptyHeader><button className="primary" onClick={()=>setRetry(n=>n+1)}>{t("Try again")}</button></Empty>:loading||!report||report.currency!==currency||report.start!==start||report.end!==end?<div className="report-stats">{[0,1,2,3].map(n=><Skeleton key={n} className="h-36 rounded-xl"/>)}</div>:<>
   <div className="report-stats">
    <div className="report-stat panel"><span><ShoppingBag size={18}/>{t("Net sales")}</span><strong>{money(totals!.net)}</strong><small>{money(totals!.gross)}{' '}{t("before discounts")}</small></div>
    <div className="report-stat panel"><span><ReceiptText size={18}/>{t("Transactions")}</span><strong>{totals!.transactions.toLocaleString(locale)}</strong><small>{money(totals!.transactions?Math.round(totals!.net/totals!.transactions):0)}{' '}{t("average sale")}</small></div>
    <div className="report-stat panel"><span><Package size={18}/>{t("Units sold")}</span><strong>{totals!.units.toLocaleString(locale)}</strong><small>{report.products.length}{' '}{t("distinct products")}</small></div>
    <div className="report-stat panel"><span><Percent size={18}/>{t("Discounts")}</span><strong>{money(totals!.discounts)}</strong><small>{t("Total discounts given")}</small></div>
   </div>
   <div className="panel recovery-panel"><h2>{t('Payments and refunds')}</h2><p>{t('Refunds appear on the date money was returned. Pending sales are excluded until synced.')}</p><div className="form-grid"><p><b>{t('Refunded')}: {money(totals!.refunds)}</b></p><p><b>{t('After refunds')}: {money(totals!.afterRefunds)}</b></p></div><Table><TableHeader><TableRow>{['Payment method','Collected','Refunded','Expected net'].map(label=><TableHead key={label}>{t(label)}</TableHead>)}</TableRow></TableHeader><TableBody>{report.payments.map(row=><TableRow key={row.method}><TableCell>{t(paymentLabel(row.method))}</TableCell><TableCell>{money(row.sales)}</TableCell><TableCell>{money(row.refunds)}</TableCell><TableCell>{money(row.expected)}</TableCell></TableRow>)}</TableBody></Table></div>
   <p className="report-period">{displayDate(report.start)} – {displayDate(report.end)} · {currency}{' '}{t("· UTC+0 · All saved sales in this period")}</p>
   {!totals!.transactions?<Empty className="panel start-empty"><EmptyHeader><ReceiptText size={32}/><EmptyTitle>{t("No sales in this period")}</EmptyTitle><EmptyDescription>{t("Choose another date range, or complete a sale to see it here.")}</EmptyDescription></EmptyHeader></Empty>:<div className="report-tables">
    <div className="panel"><div className="report-table-title"><h2>{t("Daily sales")}</h2><p>{t("Totals after discounts")}</p></div><Table><TableHeader><TableRow><TableHead>{t("Date")}</TableHead><TableHead className="text-right">{t("Sales")}</TableHead><TableHead className="text-right">{t("Net sales")}</TableHead></TableRow></TableHeader><TableBody>{report.daily.map(row=><TableRow key={row.date}><TableCell>{displayDate(row.date)}</TableCell><TableCell className="text-right">{row.transactions}</TableCell><TableCell className="text-right font-semibold">{money(row.net)}</TableCell></TableRow>)}</TableBody></Table></div>
    <div className="panel"><div className="report-table-title"><h2>{t("Best-selling products")}</h2><p>{t("Ranked by units sold · values before discounts")}</p></div><Table><TableHeader><TableRow><TableHead>{t("Product")}</TableHead><TableHead className="text-right">{t("Units")}</TableHead><TableHead className="text-right">{t("Gross sales")}</TableHead></TableRow></TableHeader><TableBody>{report.products.map(row=><TableRow key={row.productId}><TableCell className="report-product-name">{row.name}</TableCell><TableCell className="text-right">{row.units}</TableCell><TableCell className="text-right font-semibold">{money(row.gross)}</TableCell></TableRow>)}</TableBody></Table></div>
   </div>}
   <p className="catalog-note">{t("Net sales are after discounts. After refunds subtracts refunds recorded in this period. Business expenses and profit are not calculated.")}</p>
  </>}
 </section>;
}
