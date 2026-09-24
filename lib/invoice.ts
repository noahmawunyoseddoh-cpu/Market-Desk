import { jsPDF } from 'jspdf';
import {saleCurrency,saleStatus,paymentLabel,type Sale} from './model';
import {amountText} from './currency';
import {translate,languageOf,localeFor} from './i18n';
type Fonts={normal:string;bold:string};
let fontsPromise:Promise<Fonts>|undefined;
export async function prepareInvoice(sale:Sale){
 if(!fontsPromise)fontsPromise=Promise.all(['/fonts/DejaVuSans.ttf','/fonts/DejaVuSans-Bold.ttf'].map(async url=>{const response=await fetch(url);if(!response.ok)throw new Error('Invoice font unavailable');const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);})).then(([normal,bold])=>({normal,bold})).catch(e=>{fontsPromise=undefined;throw e;});
 return makeInvoice(sale,await fontsPromise);
}
export function makeInvoice(sale: Sale,fonts:Fonts) {
 const doc=new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});doc.addFileToVFS('MarketSans.ttf',fonts.normal);doc.addFont('MarketSans.ttf','MarketSans','normal');doc.addFileToVFS('MarketSans-Bold.ttf',fonts.bold);doc.addFont('MarketSans-Bold.ttf','MarketSans','bold');doc.setFont('MarketSans','normal');
 const code=saleCurrency(sale),language=languageOf(sale.business.language),t=(message:string)=>translate(message,language);
 const currency=(n:number)=>code+' '+amountText(n,code);
 const text=(s:string)=>s.replace(/₵/g,'GHS').replace(/·/g,'-');
 const wrapped=(s:string,width:number)=>doc.splitTextToSize(text(s),width) as string[];
 doc.setProperties({title:sale.invoice,subject:t(saleStatus(sale)),author:sale.business.name,creator:'MarketDesk'});
 let y=0;
 function header(continued=false){
  doc.setFillColor(21,28,46);doc.rect(0,0,210,8,'F');doc.setTextColor(21,28,46);doc.setFont('MarketSans','bold');doc.setFontSize(21);
  const name=wrapped(sale.business.name,118);doc.text(name,18,25);y=25+name.length*8;
  doc.setFontSize(22);doc.setTextColor(223,74,28);doc.text(t("INVOICE"),192,25,{align:'right'});
  doc.setFontSize(10);doc.setTextColor(76,86,102);doc.setFont('MarketSans','normal');
  for(const value of [sale.business.address,sale.business.phone,sale.business.email].filter(Boolean)){const rows=wrapped(value,118);doc.text(rows,18,y);y+=rows.length*5;}
  y=Math.max(y+7,55);doc.setFontSize(10);doc.text(sale.invoice,18,y);doc.text(t(saleStatus(sale))+(continued?t(" / CONTINUED"):''),192,y,{align:'right'});y+=6;
  doc.text(new Date(sale.createdAt).toLocaleString(localeFor(language),{timeZone:'Africa/Accra'}),18,y);y+=6;doc.text(t(paymentLabel(sale.paymentMethod)),18,y);y+=7;
  if(sale.pending){doc.setFontSize(9);doc.text(wrapped(t('Saved on this device. The final invoice is confirmed after syncing.'),170),18,y);y+=12;}
 }
 function tableHead(){doc.setFillColor(241,244,248);doc.rect(18,y-5,174,10,'F');doc.setFont('MarketSans','bold');doc.setFontSize(9);doc.setTextColor(50,60,78);doc.text(t("DESCRIPTION"),21,y+1);doc.text(t("QTY"),125,y+1,{align:'right'});doc.text(t("UNIT PRICE"),156,y+1,{align:'right'});doc.text(t("AMOUNT"),190,y+1,{align:'right'});y+=13;doc.setFont('MarketSans','normal');doc.setFontSize(10);}
 header();doc.setFont('MarketSans','bold');doc.text(t("BILL TO"),18,y);y+=6;doc.setFont('MarketSans','normal');
 for(const value of [sale.customer||t("Walk-in customer"),sale.contact].filter(Boolean)){const rows=wrapped(value,165);doc.text(rows,18,y);y+=rows.length*5;}y+=9;tableHead();
 for(const line of sale.lines){const name=wrapped(line.name,87),height=Math.max(12,name.length*5+5);if(y+height>260){doc.addPage();header(true);tableHead();}doc.setTextColor(21,28,46);doc.text(name,21,y);doc.text(String(line.quantity),125,y,{align:'right'});doc.text(currency(line.price),156,y,{align:'right'});doc.text(currency(line.price*line.quantity),190,y,{align:'right'});y+=height;doc.setDrawColor(228,232,238);doc.line(18,y-5,192,y-5);}
 if(y>213){doc.addPage();header(true);}y+=6;
 for(const [label,value] of [[t("Subtotal"),sale.subtotal],[t("Discount"),-sale.discount]] as const){doc.setFontSize(10);doc.text(label,120,y);doc.text(currency(value),190,y,{align:'right'});y+=8;}
 doc.setFillColor(21,28,46);doc.rect(115,y-4,77,14,'F');doc.setTextColor(255,255,255);doc.setFont('MarketSans','bold');doc.setFontSize(12);doc.text(t("TOTAL"),120,y+5);doc.text(currency(sale.total),188,y+5,{align:'right'});y+=20;doc.setTextColor(60,70,86);doc.setFont('MarketSans','normal');doc.setFontSize(10);
 doc.text(t("Amount received"),120,y);doc.text(currency(sale.received),190,y,{align:'right'});y+=7;doc.text(t("Change"),120,y);doc.text(currency(sale.change),190,y,{align:'right'});y+=13;
 if(y>256){doc.addPage();header(true);}doc.setFontSize(10);doc.text(wrapped(sale.business.footer,170),105,y,{align:'center'});
 for(const adjustment of sale.adjustments??[]){
  doc.addPage();header(true);doc.setFont('MarketSans','bold');doc.setFontSize(16);doc.text(t(adjustment.kind==='cancel'?'Cancelled invoice':'Credit note')+' · '+adjustment.number,18,y);y+=10;
  doc.setFont('MarketSans','normal');doc.setFontSize(10);doc.text(new Date(adjustment.createdAt).toLocaleString(localeFor(language),{timeZone:'Africa/Accra'}),18,y);y+=8;
  doc.text(t('Refunded')+': '+currency(adjustment.amount)+' · '+t(paymentLabel(adjustment.paymentMethod)),18,y);y+=10;
  const reason=wrapped(adjustment.reason,170);doc.text(reason,18,y);y+=reason.length*5+10;
  for(const line of adjustment.lines){const content=wrapped(line.name+' × '+line.quantity+' · '+t(line.restock?'Restocked':'Not restocked'),170);if(y+content.length*5>265){doc.addPage();header(true);}doc.text(content,18,y);y+=content.length*5+5;}
 }
 const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setTextColor(117,126,140);doc.setFontSize(8);doc.text(t("Created with MarketDesk"),18,284);doc.text(t("Page ")+i+t(" of ")+pages,192,284,{align:'right'});}
 return doc;
}
