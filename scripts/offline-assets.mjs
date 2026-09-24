import {readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist/client');
async function collect(folder){const entries=await readdir(folder,{withFileTypes:true});return (await Promise.all(entries.filter(e=>!e.name.startsWith('.')).map(async entry=>{const full=path.join(folder,entry.name);if(entry.isDirectory())return collect(full);const relative=path.relative(root,full).split(path.sep).join('/');return /\.(js|css|ttf|woff2?|svg|png|webp|jpg|ico)$/.test(relative)&&relative!=='sw.js'?['/'+relative]:[];}))).flat();}
const assets=(await collect(root)).sort();
if(!assets.some(asset=>asset.endsWith('.js'))||!assets.includes('/fonts/DejaVuSans.ttf'))throw new Error('Offline assets are incomplete.');
await writeFile(path.join(root,'offline-assets.json'),JSON.stringify({version:2,assets}));
console.log('Prepared '+assets.length+' assets for offline reopening.');
