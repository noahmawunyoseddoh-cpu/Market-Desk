# MarketDesk — Sales, purchases and invoices

A private, responsive sales workspace for market vendors. React, TypeScript and Vinext on Cloudflare Workers, with D1 data storage, R2 product photos, and email/password sign-in. Data is scoped to the signed-in owner. See `DEPLOY.md` for deploying this to your own Cloudflare account.

## Included
- Add, edit and delete products; name, price, category, SKU, stock quantity and photo. Checkout search results include product photos.
- Record purchases containing up to 100 products, with date, optional supplier and receipt reference. Saving adds all received quantities to stock atomically; retrying a purchase does not add stock again. View the latest 500 purchase records with original product snapshots.
- Sales reports for today, the last seven days, this month or custom inclusive dates in Ghana time: net/gross sales, discounts, transactions, average sale, units sold, daily totals and best sellers. Reports query all saved sales in the period, filter by currency to avoid mixing totals, and export CSV with explicit currency and translated headings.
- Checkout with whole-item quantities, a fixed amount discount, optional invoice customer details, amount received and change.
- Shop settings for Ghana cedis (GHS) or Togo CFA francs (XOF), and English or French. Prices are stored separately by currency; an unset price must be entered before selling. No automatic currency conversion. GHS uses integer pesewas; XOF uses whole francs.
- Server-calculated totals, atomic stock deduction on new sales, insufficient-stock rejection and idempotent sale saves. Product revision checks prevent stale edits from overwriting stock movements.
- Client-generated, paginated PDF invoices with embedded fonts, downloads and device sharing; WhatsApp, email and SMS text fallbacks. New invoices snapshot currency, language and business details. Legacy invoices without currency/language tags remain GHS/English.
- Latest 500 invoices, with search and date filtering; original product/business snapshots are preserved.
- Editable business name, contact details, address and invoice footer.

## Offline selling and device sync
Open the private app using the same account on each device. After the first online load, the app prepares its offline shell and invoice fonts; look for **Ready to reopen offline**. Completed sales are written to IndexedDB before any network request. A stable UUID survives refreshes and uncertain responses, and server transactions prevent duplicate invoices or stock deductions. Unsent units are reserved locally.

The app polls for committed changes every five seconds while visible. Pending sales upload when the app is open online, including on reconnect or focus. This is foreground sync, not a promise of background upload after the browser closes. The cloud remains authoritative. Other devices can change stock while one is offline: conflicts remain in **Recovery & history** for review. Check physical stock, record missing purchases, map removed products to the correct catalog item, correct a bad device timestamp, or explicitly keep the original paid prices and currency. Never enter a queued sale a second time. Browser data must be retained until its queue is confirmed; exporting pending sales provides an emergency copy. Purchases, catalog edits, refunds and reports require a connection.

## Payments, returns and recovery
Checkout records cash, mobile money or card payments and an optional reference. It records money already received; it does not charge customers or connect to payment providers. Older sales without a method remain **Unspecified**. Daily reconciliation compares actual net collections with sales less refunds, separately for GHS and XOF. Exclude opening cash float and unrelated cash movements from the counted amount. Reconcile only after all devices have synced; later records may require another reconciliation.

Returns create immutable credit notes attached to the original invoice. Refund amounts and returned quantities have independent cumulative limits, and stock is added only for explicitly selected, saleable returned goods. Cancellation refunds the remaining paid amount while keeping the original invoice. Confirm that money has actually been returned outside the app. Refund retries and concurrent submissions cannot refund or restock the same request twice. Unconfirmed purchases and adjustments retain their original reference on the device.

Cloud snapshots are saved in R2 after successful changes, with retries during foreground sync if backup storage fails. **Recovery & history** lists the latest 50 snapshots, manual backup/download/restore controls and the latest 200 audit events. A restore makes a safety snapshot first, rejects intervening writes, changes records atomically and preserves audit history. Old operation IDs remain retired so delayed retries cannot recreate records removed by restoration. Product photos remain in the same shop’s R2 storage: downloaded JSON contains photo links, not photo binaries. Restoring is for this shop’s cloud snapshots, not importing arbitrary JSON into another account.

## Current scope
Multi-business access with owner, manager and cashier memberships is enabled. Reports query all matching saved sales; the invoice and purchase lists show the latest 500. Reports keep currencies separate and show refunds on their actual refund dates. Purchase costs, expenses, profit calculations, taxes and payment-provider settlement are outside this version. Legacy sales that did not deduct stock are not deducted retrospectively.

The hosted app uses email/password sign-in and Cloudflare D1/R2 storage. Do not expose D1/R2 credentials or the Worker's bindings publicly. Sample records in automated tests are isolated from the hosted shop.

## Development
Preserve the project's pnpm lockfile. The database schema lives in db/schema.ts; generated migrations live in drizzle/. Bindings (`DB`, `BUCKET`) are declared in wrangler.toml. Production migration changes are append-only after publication. See `DEPLOY.md` for the full setup and deploy walkthrough.

## Validation
Run `pnpm test`, `pnpm exec tsc --noEmit`, then the Sites production build. Tests execute the actual route handlers against transactional SQLite and an R2 adapter. Coverage includes migrations, exact GHS/XOF amounts, legacy invoices, report totals beyond 500 sales, stock races, lost responses, stale edits, purchase retries, payment reconciliation, partial refunds, cancellations, restore rollback, cross-account rejection and retired operation IDs.

The IndexedDB adapter tests reload recovery, pending-operation durability, stale snapshot rejection, lost-response retries and full-storage failures. A service-worker harness checks offline fallback, authentication errors, account changes and cache clearing. Sample pending invoices and credit-note PDFs were rendered and inspected. These tests use isolated sample records; browser/device UI and hosted end-to-end tests have not been run in this session.

Before your first market day, test the following with your real products on your intended phone and second device:
1. Confirm product prices and physical quantities, business details, currency and language.
2. Make one sale and check stock, payment method and the shared PDF on both devices.
3. After offline preparation completes, disconnect, save a sale, reload, reconnect and confirm it syncs exactly once.
4. Check a partial return and daily reconciliation with a small test transaction.
5. Download a backup. Rehearse restore with test data before relying on it for recovery.

Browser storage eviction, a lost device before sync and device-specific PDF sharing need real-device validation; no software test can replace that check. Pending offline sales must sync before switching or creating another business, preventing a device from stranding unsynced transactions under the wrong workspace.

## Multi-business staff access

This source includes migration `drizzle/0005_business_memberships.sql`.
Existing shops are preserved: on the first signed-in request after migration, the existing user ID becomes that shop's business ID and an owner membership is created without moving or deleting products, sales, purchases, settings, backups, or stock.

Roles:
- Owner: full shop, recovery, settings, and staff access.
- Manager: sales, products, purchases, reports, payments, refunds, and cashier management.
- Cashier: checkout/read access only.

Staff invitations are email-based. Invite the exact email the employee uses to sign in (they'll create their account, or sign in, with that email). The pending membership becomes active automatically on their next sign-in. A user can belong to multiple businesses and switch the active business under **Staff & businesses**.
