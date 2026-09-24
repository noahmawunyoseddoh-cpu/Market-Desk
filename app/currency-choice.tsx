'use client';
import {useI18n} from './i18n-provider';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {currencies,currencyInfo,type Currency} from '@/lib/currency';
export default function CurrencyChoice({value,onChange,disabled=false}:{value:Currency;onChange:(currency:Currency)=>void;disabled?:boolean}){
 const {t}=useI18n();
 return <Select value={value} onValueChange={value=>onChange(value as Currency)} disabled={disabled}><SelectTrigger className="currency-choice" aria-label={t("Currency")}><SelectValue/></SelectTrigger><SelectContent>{currencies.map(currency=><SelectItem key={currency} value={currency}>{t(currencyInfo[currency].label)}</SelectItem>)}</SelectContent></Select>;
}
