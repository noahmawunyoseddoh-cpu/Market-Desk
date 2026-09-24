import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const origin='https://test.invalid',handlers={},stores=new Map();
const key=value=>new URL(typeof value==='string'?value:value.url,origin).href;
const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const rows=stores.get(name);return {async match(request){return rows.get(key(request))?.clone();},async put(request,response){rows.set(key(request),response.clone());}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
let network=true,status=200;
const scope={location:{origin},clients:{claim:async()=>{}},skipWaiting:()=>{},addEventListener:(type,handler)=>{handlers[type]=handler;}};
const fetch=async request=>{if(!network)throw new TypeError('Offline');const url=new URL(typeof request==='string'?request:request.url,origin);if(url.pathname==='/offline-assets.json')return Response.json({version:2,assets:['/assets/app.js','/fonts/DejaVuSans.ttf']});return new Response(url.pathname==='/'?'<html>Authenticated app shell</html>':'asset',{status,headers:{'Content-Type':url.pathname==='/'?'text/html':'application/javascript'}});};
vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),{self:scope,caches,fetch,Response,Request,URL,console,Set,AbortController,setTimeout,clearTimeout});
async function message(data){let pending,result;handlers.message({data,ports:[{postMessage:r=>{result=r;}}],waitUntil:p=>{pending=p;}});await pending;return result;}
async function request(path,mode='cors',method='GET'){let response;handlers.fetch({request:{url:origin+path,mode,method},respondWith:p=>{response=p;}});return response?await response:null;}
assert.equal((await message({type:'PREPARE',ownerId:'vendor',assets:[origin+'/assets/app.js']})).ok,true);
network=false;assert.match(await (await request('/','navigate')).text(),/Authenticated/);assert.equal(await (await request('/assets/app.js')).text(),'asset');
assert.equal(await request('/api/store'),null);assert.equal(await request('/api/sales','cors','POST'),null);
network=true;status=401;assert.equal((await request('/','navigate')).status,401);
status=200;await message({type:'PREPARE',ownerId:'another',assets:[]});assert.ok(![...stores.keys()].some(name=>name.endsWith('vendor')));
await message({type:'CLEAR'});network=false;await assert.rejects(request('/','navigate'),/Offline/);
console.log('PASS: offline app shell/assets, authenticated error responses never replaced by cache, no API write caching, owner changes and sign-out clear private caches.');
