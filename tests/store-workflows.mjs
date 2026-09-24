import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
fs.mkdirSync('.sites-runtime',{recursive:true});
const folder=fs.readdirSync('node_modules/.pnpm').find(n=>n.startsWith('esbuild@'));
const {build}=await import(pathToFileURL(path.resolve('node_modules/.pnpm',folder,'node_modules/esbuild/lib/main.js')));
await build({stdin:{contents:"export * as adjustments from './app/api/adjustments/route';export * as backups from './app/api/backups/route';export * as payments from './app/api/payments/route';export * as sync from './app/api/sync/route';export * as audit from './app/api/audit/route';export * as offline from './lib/offline';export * as purchases from './app/api/purchases/route';export * as reports from './app/api/reports/route';export * as products from './app/api/products/route';export * as sales from './app/api/sales/route';export * as store from './app/api/store/route';export * as business from './app/api/business/route';export * as currency from './lib/currency';export * as i18n from './lib/i18n';export {makeInvoice} from './lib/invoice';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',packages:'external',outfile:'.sites-runtime/store-tests.mjs',plugins:[{name:'local-adapters',setup(b){b.onResolve({filter:/^@\//},a=>({path:path.resolve(a.path.slice(2)+'.ts')}));b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'testing'}));b.onLoad({filter:/.*/,namespace:'testing'},()=>({contents:'export const env=globalThis.__testEnv;'}));b.onLoad({filter:/app[\\/]auth\.ts$/},()=>({contents:'export async function getSessionUser(){return globalThis.__testUser;}',loader:'ts'}));}}]});
const db=new DatabaseSync(':memory:');
const migrations=fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort();
db.exec(fs.readFileSync('drizzle/'+migrations[0],'utf8'));
// Check an actual pre-currency row survives the append-only migration.
db.prepare("INSERT INTO products(id,owner,name,price,quantity,created_at) VALUES ('legacy-product','vendor','Legacy product',4525,10,'2026-09-01T00:00:00.000Z')").run();
for(const file of migrations.slice(1))db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
let beforeBatch;
function statement(sql,args=[]){return {bind(...a){return statement(sql,a);},async all(){return {results:db.prepare(sql).all(...args)};},async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};},execute(){return {results:db.prepare(sql).all(...args)};}};}
const objects=new Map();
globalThis.__testEnv={BUCKET:{async put(key,value){objects.set(key,value);},async get(key){return objects.has(key)?{async text(){return objects.get(key);}}:null;}},DB:{prepare:statement,async batch(items){if(beforeBatch){const hook=beforeBatch;beforeBatch=null;hook();}db.exec('BEGIN');try{const result=items.map(i=>i.execute());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}}};
const owner={userId:'vendor',email:'vendor@example.com',displayName:'Vendor',fullName:null};globalThis.__testUser=owner;
const routes=await import('../.sites-runtime/store-tests.mjs');
const request=(route,data)=>new Request('https://test.invalid/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://test.invalid'},body:JSON.stringify(data)});
const read=async r=>({status:r.status,data:await r.json()});
const post=async(route,data)=>read(await routes[route].POST(request(route,data)));
const load=async()=>(await read(await routes.store.GET())).data;
const product=async id=>(await load()).products.find(p=>p.id===id);
const raw=id=>db.prepare('SELECT * FROM products WHERE id=?').get(id);
const count=table=>db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
const buy=(id,quantity)=>post('purchases',{id:crypto.randomUUID(),date:'2026-09-12',lines:[{productId:id,quantity}]});
const saleInput=(id,quantity,price,currency='GHS')=>({id:crypto.randomUUID(),currency,lines:[{productId:id,quantity,price}],discount:0,received:quantity*price});
const settings={name:'Adell Market Shop',phone:'+228 90 00 00 00',email:'shop@example.com',address:'Lomé',footer:'Thank you for purchasing',currency:'GHS',language:'en'};
async function changeCurrency(currency,language='en'){
 const previousCurrency=(await load()).business.currency;
 const result=await post('business',{...settings,currency,language,previousCurrency,footer:language==='fr'?'Merci pour votre achat':settings.footer});assert.equal(result.status,200);return result.data;
}
let r=await load();assert.equal(r.business.currency,'GHS');assert.equal(r.business.language,'en');assert.equal(r.products[0].price,4525);assert.equal(r.products[0].priced,true);
assert.equal(routes.currency.parseAmount('45.25','GHS'),4525);assert.equal(routes.currency.parseAmount('5000','XOF'),5000);
for(const [value,currency] of [['1.001','GHS'],['5.5','XOF'],['1e3','GHS'],['-5','XOF']])assert.ok(Number.isNaN(routes.currency.parseAmount(value,currency)));
assert.equal(routes.currency.amountText(4525,'GHS'),'45.25');assert.equal(routes.currency.amountText(5000,'XOF'),'5000');assert.equal(routes.currency.money(5000,'XOF'),'CFA 5,000');
assert.equal(routes.i18n.translate('Sales reports','fr'),'Rapports de ventes');assert.equal(routes.i18n.translate('Only 2 units of Soap are available. Adjust the sale or record a purchase.','fr'),'Il reste seulement 2 unités de Soap. Modifiez la vente ou enregistrez un achat.');assert.equal(routes.i18n.translate('Unchanged product name','fr'),'Unchanged product name');
await changeCurrency('GHS');
const p1=(await post('products',{name:'Shea butter',sku:'SB-1',price:4575,quantity:10,currency:'GHS'})).data.id;
const p2=(await post('products',{name:'Soap',sku:'SP-1',price:700,quantity:20,currency:'GHS'})).data.id;
const oldDraft=await product(p1);
const first={...saleInput(p1,2,4575),discount:150,received:10000};
r=await post('sales',first);assert.equal(r.status,200);assert.equal(r.data.total,9000);assert.equal(r.data.change,1000);assert.equal(r.data.currency,'GHS');assert.equal(r.data.stockDeducted,true);assert.equal(raw(p1).quantity,8);assert.equal(raw(p1).revision,1);const ghsSale=r.data;delete ghsSale.syncRevision;
r=await post('sales',first);assert.equal(r.status,200);assert.equal(raw(p1).quantity,8);assert.equal(count('sales'),1);
r=await post('products',{...oldDraft,quantity:100});assert.equal(r.status,409);assert.equal(raw(p1).quantity,8);
const duplicate=saleInput(p1,7,4575);
let both=await Promise.all([post('sales',duplicate),post('sales',duplicate)]);assert.deepEqual(both.map(x=>x.status),[200,200]);assert.equal(raw(p1).quantity,1);assert.equal(count('sales'),2);
await buy(p1,2);
both=await Promise.all([post('sales',saleInput(p1,2,4575)),post('sales',saleInput(p1,2,4575))]);assert.deepEqual(both.map(x=>x.status).sort(),[200,409]);assert.equal(raw(p1).quantity,1);
const purchase={id:crypto.randomUUID(),date:'2026-09-12',lines:[{productId:p1,quantity:5},{productId:p2,quantity:5}]};
both=await Promise.all([post('purchases',purchase),post('purchases',purchase)]);assert.deepEqual(both.map(x=>x.status),[200,200]);assert.equal(raw(p1).quantity,6);assert.equal(raw(p2).quantity,25);
for(const payload of [{...saleInput(p1,1,4575),lines:[null]},{...saleInput(p1,1,4575),discount:0.5},{...saleInput(p1,1,4575),received:1},saleInput(p1,99,4575),saleInput(p1,1,1)])assert.ok([400,409].includes((await post('sales',payload)).status));
const stockBefore=[raw(p1).quantity,raw(p2).quantity],salesBefore=count('sales');
db.exec("CREATE TRIGGER fail_soap BEFORE UPDATE OF quantity ON products WHEN OLD.sku='SP-1' BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END");
const rollback={...saleInput(p1,1,4575),lines:[{productId:p1,quantity:1,price:4575},{productId:p2,quantity:1,price:700}],received:5275};
const originalError=console.error;console.error=()=>{};r=await post('sales',rollback);console.error=originalError;assert.equal(r.status,503);assert.deepEqual([raw(p1).quantity,raw(p2).quantity],stockBefore);assert.equal(count('sales'),salesBefore);
db.exec('DROP TRIGGER fail_soap');r=await post('sales',rollback);assert.equal(r.status,200);assert.equal(raw(p1).quantity,5);
const beforeRace=raw(p1).quantity;beforeBatch=()=>db.prepare("UPDATE products SET prices=json_object('GHS',9999) WHERE id=?").run(p1);
r=await post('sales',saleInput(p1,1,4575));assert.equal(r.status,409);assert.equal(raw(p1).quantity,beforeRace);db.prepare('UPDATE products SET prices=NULL WHERE id=?').run(p1);
beforeBatch=()=>db.prepare("UPDATE businesses SET data=json_set(data,'$.currency','XOF') WHERE owner='vendor'").run();
r=await post('sales',saleInput(p1,1,4575));assert.equal(r.status,409);assert.equal(raw(p1).quantity,beforeRace);
await changeCurrency('XOF','fr');let current=await product(p1);assert.equal(current.currency,'XOF');assert.equal(current.priced,false);assert.equal(current.price,0);
r=await post('sales',saleInput(p1,1,0,'XOF'));assert.equal(r.status,409);
r=await post('sales',saleInput(p1,1,4575));assert.equal(r.status,409);
r=await post('products',{...current,price:4900});assert.equal(r.status,200);assert.deepEqual(JSON.parse(raw(p1).prices),{GHS:4575,XOF:4900});
const xofProduct=(await post('products',{name:'Parfum',sku:'PF-1',price:5000,quantity:3,currency:'XOF'})).data.id;
assert.deepEqual(JSON.parse(raw(xofProduct).prices),{XOF:5000});
r=await post('products',{name:'Invalid fractional francs',price:5.5,quantity:1,currency:'XOF'});assert.equal(r.status,400);
r=await post('sales',{...saleInput(p1,1,4900,'XOF'),discount:50,received:5000});assert.equal(r.status,200);assert.equal(r.data.total,4850);assert.equal(r.data.change,150);assert.equal(r.data.business.language,'fr');const xofSale=r.data;delete xofSale.syncRevision;
await changeCurrency('GHS');assert.equal((await product(p1)).price,4575);assert.equal((await product(xofProduct)).priced,false);
assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM sales WHERE id=?').get(xofSale.id).data),xofSale);
assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM sales WHERE id=?').get(ghsSale.id).data),ghsSale);
// A historical invoice without a currency tag remains GHS.
const legacy={...ghsSale,id:crypto.randomUUID(),createdAt:'2026-09-12T10:00:00.000Z'};delete legacy.currency;delete legacy.stockDeducted;delete legacy.business.currency;delete legacy.business.language;
const insert=db.prepare('INSERT INTO sales(id,owner,invoice,created_at,total,data) VALUES(?,?,?,?,?,?)');
insert.run(legacy.id,'vendor','LEGACY',legacy.createdAt,legacy.total,JSON.stringify(legacy));
for(let i=0;i<505;i++){const id=crypto.randomUUID(),sale={...ghsSale,id,createdAt:'2026-09-12T12:00:00.000Z'};insert.run(id,'vendor','HISTORY-'+i,sale.createdAt,sale.total,JSON.stringify(sale));}
const report=async(currency='GHS',start='2000-01-01',end='9998-12-31')=>read(await routes.reports.GET(new Request('https://test.invalid/api/reports?'+new URLSearchParams({start,end,currency}))));
for(const currency of ['GHS','XOF']){
 const expected=db.prepare('SELECT data FROM sales WHERE owner=?').all('vendor').map(row=>JSON.parse(row.data)).filter(s=>(s.currency??'GHS')===currency);
 r=await report(currency);assert.equal(r.status,200);assert.equal(r.data.currency,currency);assert.equal(r.data.totals.transactions,expected.length);assert.equal(r.data.totals.net,expected.reduce((sum,s)=>sum+s.total,0));assert.equal(r.data.totals.gross,expected.reduce((sum,s)=>sum+s.subtotal,0));assert.equal(r.data.totals.discounts,expected.reduce((sum,s)=>sum+s.discount,0));assert.equal(r.data.totals.units,expected.reduce((sum,s)=>sum+s.lines.reduce((n,l)=>n+l.quantity,0),0));
}
assert.equal((await load()).sales.length,500);
r=await report('XOF');assert.equal(r.data.totals.net,4850);assert.equal(r.data.totals.transactions,1);
r=await report('USD');assert.equal(r.status,400);r=await report('GHS','2026-09-30','2026-09-01');assert.equal(r.status,400);r=await report('GHS','2026-02-30','2026-09-01');assert.equal(r.status,400);
r=await post('business',{...settings,currency:'USD'});assert.equal(r.status,400);r=await post('business',{...settings,language:'de'});assert.equal(r.status,400);
globalThis.__testUser={userId:'other',email:'other@example.com',displayName:'Other',fullName:null};r=await load();assert.equal(r.products.length,0);assert.equal(r.sales.length,0);assert.equal(r.purchases.length,0);r=await report();assert.equal(r.data.totals.transactions,0);r=await post('sales',saleInput(p1,1,4575));assert.equal(r.status,409);
globalThis.__testUser=null;r=await read(await routes.store.GET());assert.equal(r.status,401);r=await report();assert.equal(r.status,401);globalThis.__testUser=owner;
// Generated only for local QA; no test customers or sales reach the hosted app.
const fonts={normal:fs.readFileSync('public/fonts/DejaVuSans.ttf').toString('base64'),bold:fs.readFileSync('public/fonts/DejaVuSans-Bold.ttf').toString('base64')};
for(const [name,sale] of [['ghs-en',ghsSale],['xof-fr',xofSale],['legacy',legacy]]){const pdf=routes.makeInvoice(sale,fonts);assert.equal(pdf.getNumberOfPages(),1);fs.writeFileSync('.sites-runtime/invoice-'+name+'.pdf',Buffer.from(pdf.output('arraybuffer')));}
console.log('PASS: migrations, exact GHS/XOF amounts, translated labels/errors, separate prices, old invoices, currency and language saves, stock deduction, duplicate retries, last-item concurrency, rollback, stale edits/prices/currency, purchase additions, ownership, and reports beyond 500 invoices.');
// Production workflows: immutable credit notes, refunds, payment checks and recovery.
const ledgerDate=new Date().toISOString().slice(0,10);
const adjustment=(sale,extra={})=>({id:crypto.randomUUID(),saleId:sale.id,kind:'refund',amount:500,reason:'Returned unopened goods',paymentMethod:'cash',confirmed:true,lines:[],...extra});
const paymentProduct=(await post('products',{name:'Ledger test item',price:1000,quantity:20,currency:'GHS'})).data.id;
let paidSale=(await post('sales',{...saleInput(paymentProduct,3,1000),paymentMethod:'mobile_money',paymentReference:'TEST-001',discount:300,received:2700})).data;
assert.equal(paidSale.paymentMethod,'mobile_money');assert.equal(paidSale.paymentReference,'TEST-001');
r=await post('sales',{...saleInput(paymentProduct,1,1000),paymentMethod:'card',received:1100});assert.equal(r.status,400);
const stockBeforeRefund=raw(paymentProduct).quantity;
const refund=adjustment(paidSale,{amount:900,lines:[{productId:paymentProduct,quantity:1,restock:true}]});
both=await Promise.all([post('adjustments',refund),post('adjustments',refund)]);assert.deepEqual(both.map(r=>r.status),[200,200]);assert.equal(raw(paymentProduct).quantity,stockBeforeRefund+1);assert.equal(count('adjustments'),1);
r=await post('adjustments',adjustment(paidSale,{amount:1801}));assert.equal(r.status,400);
r=await post('adjustments',adjustment(paidSale,{amount:0,lines:[{productId:paymentProduct,quantity:3,restock:true}]}));assert.equal(r.status,400);
r=await post('adjustments',adjustment(paidSale,{confirmed:false}));assert.equal(r.status,400);
both=await Promise.all([post('adjustments',adjustment(paidSale,{amount:1500})),post('adjustments',adjustment(paidSale,{amount:1500}))]);assert.deepEqual(both.map(r=>r.status).sort(),[200,409]);
r=await post('adjustments',adjustment(paidSale,{kind:'cancel',amount:300,lines:[{productId:paymentProduct,quantity:2,restock:true}]}));assert.equal(r.status,200);assert.equal(raw(paymentProduct).quantity,stockBeforeRefund+3);
r=await post('adjustments',adjustment(paidSale,{amount:0}));assert.equal(r.status,409);
const updatedSale=(await load()).sales.find(s=>s.id===paidSale.id);assert.equal(updatedSale.adjustments.length,3);assert.equal(updatedSale.total,2700);
const creditPDF=routes.makeInvoice(updatedSale,fonts);assert.equal(creditPDF.getNumberOfPages(),4);fs.writeFileSync('.sites-runtime/invoice-refunded.pdf',Buffer.from(creditPDF.output('arraybuffer')));
const pendingPDF=routes.makeInvoice({...paidSale,pending:true},fonts);fs.writeFileSync('.sites-runtime/invoice-pending.pdf',Buffer.from(pendingPDF.output('arraybuffer')));
// Deleted products cannot be restocked implicitly, and the refund commits nothing.
const gone=(await post('products',{name:'Deleted return item',price:100,quantity:1,currency:'GHS'})).data.id;
const goneSale=(await post('sales',saleInput(gone,1,100))).data;
await routes.products.DELETE(new Request('https://test.invalid/api/products?id='+gone,{method:'DELETE'}));
const beforeGone=count('adjustments');r=await post('adjustments',adjustment(goneSale,{amount:100,lines:[{productId:gone,quantity:1,restock:true}]}));assert.equal(r.status,409);assert.equal(count('adjustments'),beforeGone);
r=await post('adjustments',adjustment(goneSale,{amount:100,lines:[{productId:gone,quantity:1,restock:false}]}));assert.equal(r.status,200);
const paymentReport=async()=>read(await routes.payments.GET(new Request('https://test.invalid/api/payments?'+new URLSearchParams({date:ledgerDate,currency:'GHS'}))));
r=await paymentReport();assert.equal(r.status,200);const paymentData=r.data;assert.equal(paymentData.expected.find(p=>p.method==='mobile_money').sales,2700);assert.equal(paymentData.expected.find(p=>p.method==='cash').refunds,2800);
const reconciliation={id:crypto.randomUUID(),date:ledgerDate,currency:'GHS',revision:paymentData.revision,actual:Object.fromEntries(paymentData.expected.map(p=>[p.method,p.expected])),note:'Counted after closing'};
r=await post('payments',reconciliation);assert.equal(r.status,200);assert.ok(r.data.counts.every(c=>c.difference===0));r=await post('payments',reconciliation);assert.equal(r.status,200);assert.equal(count('reconciliations'),1);
r=await post('payments',{...reconciliation,id:crypto.randomUUID()});assert.equal(r.status,409);
r=await report('GHS');assert.equal(r.data.totals.refunds,2800);assert.equal(r.data.totals.afterRefunds,r.data.totals.net-2800);
// Offline snapshots keep the paid currency, language and prices, with explicit conflict review.
const offlineProduct=(await post('products',{name:'Offline item',price:100,quantity:10,currency:'GHS'})).data.id;
const captured='2026-09-01T09:15:00.000Z';
const offlineInput={...saleInput(offlineProduct,2,100),offline:true,ownerId:'vendor',capturedAt:captured,business:{...settings,language:'fr'},paymentMethod:'cash'};
r=await post('products',{...(await product(offlineProduct)),price:200});assert.equal(r.status,200);
r=await post('sales',offlineInput);assert.equal(r.status,409);r=await post('sales',{...offlineInput,reconcile:true});assert.equal(r.status,200);assert.equal(r.data.total,200);assert.equal(r.data.createdAt,captured);assert.equal(r.data.business.language,'fr');assert.equal(r.data.reconciledOffline,true);assert.ok(r.data.syncRevision>0);const offlineRevision=r.data.syncRevision;
r=await post('sales',{...offlineInput,reconcile:true});assert.equal(r.status,200);assert.equal(raw(offlineProduct).quantity,8);
r=await post('sales',{...offlineInput,id:crypto.randomUUID(),ownerId:'other',reconcile:true});assert.equal(r.status,403);
r=await post('sales',{...offlineInput,id:crypto.randomUUID(),capturedAt:'2099-01-01',reconcile:true});assert.equal(r.status,400);
const cached={ownerId:'vendor',revision:offlineRevision-1,products:[{id:'test',quantity:5}],sales:[]};
const queued={ownerId:'vendor',key:'key',sale:{id:'pending',lines:[{productId:'test',quantity:2}]},payload:{}};
assert.equal(routes.offline.availableProducts(cached,[queued])[0].quantity,3);
assert.equal(routes.offline.availableProducts({...cached,revision:offlineRevision},[{...queued,syncRevision:offlineRevision}])[0].quantity,5);
assert.equal(routes.offline.availableProducts({...cached,sales:[{id:'pending'}]},[queued])[0].quantity,5);
// Backup failure cannot roll back or conceal a committed sale.
const oldPut=globalThis.__testEnv.BUCKET.put;globalThis.__testEnv.BUCKET.put=async()=>{throw new Error('R2 unavailable');};console.error=()=>{};
r=await post('sales',saleInput(offlineProduct,1,200));console.error=originalError;globalThis.__testEnv.BUCKET.put=oldPut;assert.equal(r.status,200);assert.equal(raw(offlineProduct).quantity,7);
await routes.sync.GET();
const backupList=async()=>read(await routes.backups.GET(new Request('https://test.invalid/api/backups')));
const latest=(await backupList()).data;assert.ok(latest.backups.length>0);assert.equal(latest.backups[0].revision,latest.revision);
const savedBackup=latest.backups[0],snapshot=(await read(await routes.backups.GET(new Request('https://test.invalid/api/backups?id='+savedBackup.id)))).data;
assert.equal(snapshot.owner,'vendor');assert.equal(snapshot.tables.sales.length,count('sales'));
const stockAtBackup=raw(offlineProduct).quantity,oldRevision=raw(offlineProduct).revision;
const afterBackupInput=saleInput(offlineProduct,1,200),afterBackupSale=(await post('sales',afterBackupInput)).data;assert.equal(raw(offlineProduct).quantity,stockAtBackup-1);
const auditBefore=count('audit_events'),restoreInput={action:'restore',id:savedBackup.id,revision:(await backupList()).data.revision,operationId:crypto.randomUUID(),confirm:'RESTORE'};
r=await post('backups',{...restoreInput,revision:0});assert.equal(r.status,409);assert.equal(raw(offlineProduct).quantity,stockAtBackup-1);
r=await post('backups',restoreInput);assert.equal(r.status,200);assert.equal(raw(offlineProduct).quantity,stockAtBackup);assert.ok(raw(offlineProduct).revision>oldRevision);assert.ok(count('audit_events')>auditBefore);assert.equal(db.prepare('SELECT id FROM sales WHERE id=?').get(afterBackupSale.id),undefined);
r=await post('backups',restoreInput);assert.equal(r.status,200);assert.equal(raw(offlineProduct).quantity,stockAtBackup);
r=await post('sales',afterBackupInput);assert.equal(r.status,409);assert.equal(raw(offlineProduct).quantity,stockAtBackup);
// Restore preconditions are checked again inside the transaction.
const newer=(await backupList()).data;beforeBatch=()=>{};
const restoreRace={action:'restore',id:savedBackup.id,revision:newer.revision,operationId:crypto.randomUUID(),confirm:'RESTORE'};
// A failed restore is fully reversible: no partial record deletion.
const beforeFailedRestore=count('sales');db.exec("CREATE TRIGGER reject_restore BEFORE DELETE ON sales BEGIN SELECT RAISE(ABORT,'simulated restore failure'); END");console.error=()=>{};
r=await post('backups',restoreRace);console.error=originalError;assert.equal(r.status,503);assert.equal(count('sales'),beforeFailedRestore);db.exec('DROP TRIGGER reject_restore');
globalThis.__testUser={userId:'other',email:'other@example.com',displayName:'Other',fullName:null};
r=await read(await routes.backups.GET(new Request('https://test.invalid/api/backups?id='+savedBackup.id)));assert.equal(r.status,404);
r=await post('adjustments',adjustment(paidSale));assert.equal(r.status,404);
r=await read(await routes.audit.GET());assert.equal(r.data.length,0);globalThis.__testUser=owner;
console.log('PASS: refund limits/concurrency/restocking, cancellation audit, credit-note PDF, payment methods and reconciliation, offline price review/date/ownership, pending-stock reservations, backup failure isolation, snapshot restore/retry/rollback, and retired operation protection.');
// IndexedDB integration with the real offline module and API handlers.
await import('fake-indexeddb/auto');
const offline=routes.offline;
const browserSaleInput={...saleInput(offlineProduct,1,200),ownerId:'vendor',offline:true,capturedAt:new Date().toISOString(),paymentMethod:'cash'};
const browserSale={...ghsSale,id:browserSaleInput.id,createdAt:browserSaleInput.capturedAt,lines:browserSaleInput.lines,total:200,subtotal:200,discount:0,received:200,change:0,pending:true};
const localRow={key:'vendor:sale:'+browserSale.id,ownerId:'vendor',payload:browserSaleInput,sale:browserSale};
await offline.saveSnapshot(await load());await offline.saveQueued(localRow,true);
const reloaded=(await import('../.sites-runtime/store-tests.mjs?reload=1')).offline;
assert.equal((await reloaded.readLocal('vendor')).queue[0].payload.id,browserSaleInput.id);
assert.equal((await reloaded.readLocal('other')).queue.length,0);
const nativeFetch=globalThis.fetch;let loseResponse=true;
globalThis.fetch=async(url,options={})=>{
 if(url==='/api/sync')return routes.sync.GET();
 if(url==='/api/store')return routes.store.GET();
 if(url==='/api/sales'){const result=await routes.sales.POST(new Request('https://test.invalid/api/sales',options));if(loseResponse){loseResponse=false;throw new TypeError('Connection lost after commit');}return result;}
 throw new Error('Unexpected network call');
};
const salesAtQueue=count('sales'),quantityAtQueue=raw(offlineProduct).quantity;
await reloaded.syncSales('vendor');assert.equal(count('sales'),salesAtQueue+1);assert.equal(raw(offlineProduct).quantity,quantityAtQueue-1);assert.equal((await offline.readLocal('vendor')).queue.length,1);
await offline.syncSales('vendor');assert.equal(count('sales'),salesAtQueue+1);assert.equal(raw(offlineProduct).quantity,quantityAtQueue-1);assert.equal((await reloaded.readLocal('vendor')).queue.length,0);
const currentCache=(await offline.readLocal('vendor')).snapshot;await offline.saveSnapshot({...currentCache,revision:0,products:[]});assert.equal((await offline.readLocal('vendor')).snapshot.revision,currentCache.revision);assert.ok((await offline.readLocal('vendor')).snapshot.products.length);
await offline.keepOperation('vendor','purchase',{id:'stable-purchase'});assert.equal((await reloaded.pendingOperation('vendor','purchase')).id,'stable-purchase');assert.equal((await offline.readLocal('vendor')).operations.length,1);await offline.finishOperation('vendor','purchase');assert.equal(await reloaded.pendingOperation('vendor','purchase'),null);
const wrongOwnerRow={...localRow,key:'vendor:sale:wrong',sale:{...browserSale,id:crypto.randomUUID()},payload:{...browserSaleInput,id:crypto.randomUUID()}};
await offline.saveQueued(wrongOwnerRow,true);globalThis.__testUser={userId:'other',email:'other@example.com',displayName:'Other',fullName:null};await assert.rejects(offline.syncSales('vendor'),/different account/);assert.equal((await offline.readLocal('vendor')).queue.length,1);globalThis.__testUser=owner;
await offline.clearLocal('vendor');assert.equal((await offline.readLocal('vendor')).queue.length,0);
const oldAdd=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(){throw new DOMException('Storage full','QuotaExceededError');};await assert.rejects(offline.saveQueued(localRow,true),/Storage full/);IDBObjectStore.prototype.add=oldAdd;assert.equal((await offline.readLocal('vendor')).queue.length,0);
globalThis.fetch=nativeFetch;
console.log('PASS: IndexedDB survives module reload, preserves sale IDs after a lost response, retries without duplicate stock changes, isolates accounts, rejects stale snapshots, retains pending operations and fails safely when local storage is full.');
