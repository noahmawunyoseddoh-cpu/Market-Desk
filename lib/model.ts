import { currencyOf,type Currency } from './currency';
import type {Language} from './i18n';
export { money } from './currency';
export type Product = { id: string; name: string; sku: string; category: string; price: number; quantity: number; photo: string; sample: number; priced:boolean; currency:Currency; revision:number };
export type ProductRow = Omit<Product,'priced'|'currency'> & {prices:string|null};
export function pricesFor(row:Pick<ProductRow,'price'|'prices'>):Partial<Record<Currency,number>>{return row.prices===null||row.prices===undefined?{GHS:row.price}:JSON.parse(row.prices);}
export type Business = { name: string; phone: string; email: string; address: string; footer: string; currency:Currency;language:Language };
export type Line = { productId: string; name: string; quantity: number; price: number };
export type PurchaseLine = { productId: string; name: string; sku: string; quantity: number };
export type Purchase = { id: string; number: string; createdAt: string; date: string; supplier: string; reference: string; lines: PurchaseLine[]; units: number; recordedBy?:{userId:string;name:string;email:string;role:string} };
export type Sale = { id: string; invoice: string; createdAt: string; lines: Line[]; subtotal: number; discount: number; total: number; received: number; change: number; customer: string; contact: string; business: Business; currency?:Currency; stockDeducted?:boolean; paymentMethod?:PaymentMethod; paymentReference?:string; soldBy?:{userId:string;name:string;email:string;role:string}; savedAt?:string; pending?:boolean; reconciledOffline?:boolean; adjustments?:Adjustment[] };
export const saleCurrency=(sale:Sale)=>currencyOf(sale.currency);
export const defaultBusiness: Business = { name: 'My Market Shop', phone: '', email: '', address: '', footer: 'Thank you for purchasing',currency:'GHS',language:'en' };
export const sampleProducts = [
 {name:'Shea butter · 250 g',sku:'SB-001',category:'Beauty',price:4500,quantity:24},
 {name:'African black soap',sku:'BS-002',category:'Beauty',price:2500,quantity:36},
 {name:'Body oil · 100 ml',sku:'BO-003',category:'Beauty',price:6500,quantity:18},
 {name:'Everyday tote bag',sku:'TB-004',category:'Accessories',price:8500,quantity:12},
 {name:'Beaded bracelet',sku:'BB-005',category:'Accessories',price:3500,quantity:30},
 {name:'Cotton T-shirt',sku:'CT-006',category:'Clothing',price:12000,quantity:20},
];

export const paymentMethods=['cash','mobile_money','card'] as const;
export type PaymentMethod=typeof paymentMethods[number]|'unspecified';
export const paymentLabel=(method?:string)=>({cash:'Cash',mobile_money:'Mobile money',card:'Card',unspecified:'Unspecified'}[method??'unspecified']??'Unspecified');
export type Adjustment={id:string;saleId:string;number:string;invoice:string;createdAt:string;kind:'refund'|'cancel';amount:number;currency:Currency;reason:string;paymentMethod:PaymentMethod;lines:{productId:string;name:string;quantity:number;restock:boolean}[]};
export function saleStatus(sale:Sale){return sale.pending?'Awaiting sync':sale.adjustments?.some(a=>a.kind==='cancel')?'Cancelled':sale.adjustments?.length?'Adjusted':'Paid';}
