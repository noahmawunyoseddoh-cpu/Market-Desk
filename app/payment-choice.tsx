 'use client';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {paymentMethods,paymentLabel,type PaymentMethod} from '@/lib/model';
import {useI18n} from './i18n-provider';
export default function PaymentChoice({value,onChange,disabled=false}:{value:PaymentMethod;onChange:(value:PaymentMethod)=>void;disabled?:boolean}){const {t}=useI18n();return <Select value={value} onValueChange={v=>onChange(v as PaymentMethod)} disabled={disabled}><SelectTrigger aria-label={t('Payment method')}><SelectValue/></SelectTrigger><SelectContent>{paymentMethods.map(method=><SelectItem key={method} value={method}>{t(paymentLabel(method))}</SelectItem>)}</SelectContent></Select>;}
