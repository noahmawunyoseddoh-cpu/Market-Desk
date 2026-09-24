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
Multi-business access with per-person custom permissions is enabled — each staff member is granted an exact set of abilities (sales, products, purchases, refunds, reports, payments, settings, recovery, staff management) rather than being locked into a fixed role; owners can change anyone's access at any time. Reports query all matching saved sales; the invoice and purchase lists show the latest 500. Reports keep currencies separate and show refunds on their actual refund dates. Purchase costs, expenses, profit calculations, taxes and payment-provider settlement are outside this version. Legacy sales that did not deduct stock are not deducted retrospectively.

The hosted app uses email/password sign-in with email verification, password reset and rate limiting, plus Cloudflare D1/R2 storage. Do not expose D1/R2 credentials or the Worker's bindings publicly. Sample records in automated tests are isolated from the hosted shop.

## Development
Preserve the project's pnpm lockfile. The database schema lives in db/schema.ts; generated migrations live in drizzle/. Bindings (`DB`, `BUCKET`) and mail settings (`MAIL_FROM`, `APP_URL`) are declared in wrangler.toml; the `RESEND_API_KEY` used to send invite, verification and password-reset emails is stored as a Worker secret (`wrangler secret put RESEND_API_KEY`), never committed. Production migration changes are append-only after publication. See `DEPLOY.md` for the full setup and deploy walkthrough.

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

## Account security
Sign-up requires a password (minimum 8 characters, entered twice) and sends a verification email via Resend. The account works immediately after sign-up, but verification is required before a pending staff invite can activate for that email — this stops someone from claiming a colleague's invite by signing up with their email before they do. Accounts that miss or lose the verification link can request a new one from a banner shown while signed in and unverified.

**Forgot password** on the sign-in screen emails a reset link (2-hour expiry) that lets someone set a new password; using it signs the account out on every device for safety.

**Rate limiting** is applied to sign-in (8 attempts per 15 minutes per email, 30 per 15 minutes per IP), sign-up (5 per hour per IP), forgot-password (3 per hour per email, 10 per hour per IP), password reset (15 per hour per IP), staff invites (20 per hour per business and per IP) and account deletion (5 per hour per IP), backed by a lightweight table in D1. This needs no extra Cloudflare setup beyond the D1 database already used for everything else.

## Multi-business staff access

This source includes migrations through `drizzle/0010_rate_limits.sql`.
Existing shops are preserved: on the first signed-in request after migration, the existing user ID becomes that shop's business ID and an owner membership is created without moving or deleting products, sales, purchases, settings, backups, or stock.

Access is fully custom per person rather than fixed roles. Every staff member (except owners, who always have full access) is granted an exact combination of: sales, product management, purchases, refunds/cancellations, reports, payments, shop settings, recovery & history, and inviting/managing other staff. Owners set this per person at invite time and can change it at any time from **Staff & businesses**. A business must always keep at least one owner, and nobody can grant a permission — or owner access — that they don't already hold themselves.

Staff invitations are email-based and send a real email via Resend with the access being granted. Invite the exact email the employee uses to sign in (they'll create their account, or sign in, with that email). The pending membership becomes active automatically once that email is verified and they next sign in. A user can belong to multiple businesses and switch the active business under **Staff & businesses**.

## Account deletion
Any signed-in user can permanently delete their own account from a "Danger zone" section on **Staff & businesses**. It requires picking a reason from a short list (kept afterward, by email, in `account_deletion_feedback` for the shop owner or developer to review — not shown anywhere in the app itself), re-entering the current password, and typing `DELETE` to confirm.

If the account is the *sole* owner of a business, that business and all of its data — products, sales, purchases, adjustments, backups, audit history and R2 photos — is permanently deleted along with it, since no one would be left to run it. If another active owner exists, or the account is only staff, just that person's membership is removed and the business is untouched. This distinction is enforced server-side regardless of what the confirmation UI shows.
