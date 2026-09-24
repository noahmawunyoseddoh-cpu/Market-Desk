'use client';
import {createContext,useContext,useState,useEffect,useCallback,type ReactNode} from 'react';
import {translate,localeFor,type Language} from '@/lib/i18n';
const Context=createContext({language:'en' as Language,locale:'en-GH',setLanguage:(_language:Language)=>{},t:(message:string,values?:Record<string,string|number>)=>translate(message,'en',values)});
export function I18nProvider({children}:{children:ReactNode}){
 const [language,setLanguage]=useState<Language>('en');
 useEffect(()=>{document.documentElement.lang=language;},[language]);
 const t=useCallback((message:string,values?:Record<string,string|number>)=>translate(message,language,values),[language]);
 return <Context.Provider value={{language,locale:localeFor(language),setLanguage,t}}>{children}</Context.Provider>;
}
export const useI18n=()=>useContext(Context);
