import fr from './locales/fr.json';
export type Language='en'|'fr';
export const languageOf=(value:unknown):Language=>value==='fr'?'fr':'en';
export const localeFor=(language:Language)=>language==='fr'?'fr-TG':'en-GH';
export function translate(message:string,language:Language,values:Record<string,string|number>={}){
 let result=language==='fr'?(fr as Record<string,string>)[message]??message:message;
 if(language==='fr'&&result===message){
  for(const [source,target] of Object.entries(fr)){
   if(!source.includes('{'))continue;
   const names:string[]=[];
   const pattern=source.split(/(\{\w+\})/).map(part=>{if(/^\{\w+\}$/.test(part)){names.push(part.slice(1,-1));return '(.+?)';}return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('');
   const match=message.match(new RegExp('^'+pattern+'$'));
   if(match){result=target;names.forEach((name,index)=>{result=result.replaceAll('{'+name+'}',match[index+1]);});break;}
  }
 }
 return result.replace(/\{(\w+)\}/g,(match,key)=>values[key]===undefined?match:String(values[key]));
}
