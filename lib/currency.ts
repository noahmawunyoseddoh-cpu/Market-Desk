export type Currency = 'GHS' | 'XOF';
export const currencies: Currency[] = ['GHS','XOF'];
export const currencyInfo = {
 GHS:{name:'Ghana cedis',label:'Ghana cedis (GHS)',symbol:'GH₵',digits:2,factor:100,step:'0.01'},
 XOF:{name:'Togo CFA francs',label:'Togo CFA francs (XOF)',symbol:'CFA',digits:0,factor:1,step:'1'},
} as const;
export const isCurrency=(value:unknown):value is Currency=>value==='GHS'||value==='XOF';
export const currencyOf=(value:unknown):Currency=>isCurrency(value)?value:'GHS';
export function amountText(minor:number,currency:Currency='GHS'){
 const info=currencyInfo[currency];return (minor/info.factor).toFixed(info.digits);
}
export function money(minor:number,currency:Currency='GHS',locale='en-GH'){
 const info=currencyInfo[currency];return info.symbol+' '+(minor/info.factor).toLocaleString(locale,{minimumFractionDigits:info.digits,maximumFractionDigits:info.digits});
}
// Parse decimal text exactly; reject unsupported fractions instead of rounding.
export function parseAmount(value:string,currency:Currency):number{
 const text=value.trim()||'0',info=currencyInfo[currency];
 if(!(currency==='GHS'?/^\d+(?:\.\d{1,2})?$/:/^\d+$/).test(text))return NaN;
 const [whole,fraction='']=text.split('.');
 const amount=Number(whole)*info.factor+(currency==='GHS'?Number(fraction.padEnd(2,'0')):0);
 return Number.isSafeInteger(amount)?amount:NaN;
}
