/* Private offline shell. API writes always go to the authenticated server. */
const VERSION='v2',PREFIX=`marketdesk-shell-${VERSION}-`,META=PREFIX+'meta';
let activeOwner;
async function boundedFetch(request,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);try{return await fetch(request,{...options,signal:controller.signal});}finally{clearTimeout(timer);}}
async function owner(){if(activeOwner===undefined){const value=await (await caches.open(META)).match('/offline-owner');activeOwner=value?await value.text():'';}return activeOwner;}
async function clearAllShells(){activeOwner='';for(const key of await caches.keys())if(key.startsWith('marketdesk-shell-'))await caches.delete(key);}
async function clearOtherVersions(){for(const key of await caches.keys())if(key.startsWith('marketdesk-shell-')&&!key.startsWith(PREFIX))await caches.delete(key);}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{await clearOtherVersions();await self.clients.claim();})()));
function asset(url){return url.origin===self.location.origin&&(/\.(js|css|woff2?|ttf|svg|png|webp|jpg|jpeg|ico)$/.test(url.pathname)||url.pathname==='/api/photos');}
function safeNavigation(url){return url.origin===self.location.origin;}
self.addEventListener('message',event=>{event.waitUntil((async()=>{try{
 if(event.data?.type==='CLEAR'){await clearAllShells();event.ports[0]?.postMessage({ok:true});return;}
 if(event.data?.type!=='PREPARE'||typeof event.data.ownerId!=='string'||!event.data.ownerId)return;
 if(await owner()!==event.data.ownerId)await clearAllShells();
 activeOwner=event.data.ownerId;
 await (await caches.open(META)).put('/offline-owner',new Response(activeOwner));
 const cache=await caches.open(PREFIX+activeOwner),root=await boundedFetch('/',{cache:'no-store',credentials:'same-origin'});
 if(!root.ok||root.redirected||!root.headers.get('content-type')?.includes('text/html'))throw new Error('Sign in to prepare offline access.');
 await cache.put('/',root.clone());
 const manifestResponse=await boundedFetch('/offline-assets.json',{cache:'no-store',credentials:'same-origin'});
 if(!manifestResponse.ok||manifestResponse.redirected)throw new Error('Offline files are unavailable. Reconnect and refresh.');
 const manifest=await manifestResponse.json();
 if(manifest.version!==2||!Array.isArray(manifest.assets)||!manifest.assets.length)throw new Error('Offline files are from an older version. Refresh while online.');
 await Promise.all(manifest.assets.map(async path=>{if(typeof path!=='string'||!asset(new URL(path,self.location.origin)))throw new Error('Invalid offline asset.');const response=await boundedFetch(path,{credentials:'same-origin'});if(!response.ok||response.redirected)throw new Error('Offline files are unavailable. Reconnect and refresh.');await cache.put(path,response);}));
 // Product photos already viewed are optional; all app code and fonts above are required.
 await Promise.all((event.data.assets??[]).filter(path=>{try{const url=new URL(path,self.location.origin);return url.origin===self.location.origin&&url.pathname==='/api/photos';}catch{return false;}}).map(async path=>{try{const response=await boundedFetch(path,{credentials:'same-origin'});if(response.ok&&!response.redirected)await cache.put(path,response);}catch{}}));
 event.ports[0]?.postMessage({ok:true,version:VERSION});
 }catch(error){event.ports[0]?.postMessage({error:error instanceof Error?error.message:'Offline setup failed.'});}})());});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname.includes('signout')){event.respondWith((async()=>{await clearAllShells();return boundedFetch(request);})());return;}
 if(request.mode==='navigate'&&safeNavigation(url)){event.respondWith((async()=>{try{const response=await boundedFetch(request,{credentials:'same-origin'});if(response.ok&&!response.redirected&&response.headers.get('content-type')?.includes('text/html')){const id=await owner();if(id)await (await caches.open(PREFIX+id)).put('/',response.clone());}return response;}catch(error){const id=await owner();const cached=id&&await (await caches.open(PREFIX+id)).match('/');if(cached)return cached;throw error;}})());return;}
 if(asset(url)){event.respondWith((async()=>{const id=await owner();if(!id)return boundedFetch(request);const cache=await caches.open(PREFIX+id);try{const response=await boundedFetch(request,{credentials:'same-origin'});if(response.ok&&!response.redirected)await cache.put(request,response.clone());return response;}catch(error){const cached=await cache.match(request);if(cached)return cached;throw error;}})());}
});
