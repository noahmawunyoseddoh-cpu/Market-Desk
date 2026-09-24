# Deploying MarketDesk to your own Cloudflare account

This project now uses plain email/password sign-in and a standard `wrangler.toml`,
so it deploys to any Cloudflare account you control — no proprietary hosting
platform required.

## 0. Prerequisites
- Node.js >= 22.13
- A Cloudflare account (the free tier works for D1 + R2 + Workers at this scale)
- `pnpm` (`corepack enable` or `npm i -g pnpm`)

Install dependencies once:
```bash
pnpm install
```

## 1. Log in to Cloudflare
```bash
pnpm exec wrangler login
```
This opens a browser to authorize the CLI against your account.

## 2. Create the D1 database
```bash
pnpm exec wrangler d1 create marketdesk-db
```
This prints a `database_id`. Open `wrangler.toml` and replace
`REPLACE_WITH_YOUR_D1_DATABASE_ID` with that value.

## 3. Create the R2 bucket (for product photos)
```bash
pnpm exec wrangler r2 bucket create marketdesk-photos
```
The bucket name already matches `wrangler.toml`; no further edits needed there.
If you'd rather use a different bucket/database name, update both the create
command and the matching `bucket_name` / `database_name` in `wrangler.toml`.

## 4. Run the database migrations
Apply all migrations (including `0006_email_auth.sql`, which adds the `users`
and `sessions` tables) to your live D1 database:
```bash
pnpm run db:migrate:remote
```
For local development against a local SQLite copy of D1 instead:
```bash
pnpm run db:migrate:local
```

## 5. Try it locally first (optional but recommended)
```bash
pnpm run dev
```
Visit the printed local URL, create an account on the sign-in screen, and make
sure products/sales/etc. work end-to-end against your local D1/R2 emulation.

## 6. Deploy
```bash
pnpm run deploy
```
This runs the production build (`vite build` + offline asset manifest) and
then `wrangler deploy`, which reads `wrangler.toml` and pushes the Worker with
your real D1/R2 bindings. Wrangler prints the live `*.workers.dev` URL (or your
custom domain, if you've configured one in the Cloudflare dashboard).

## First sign-in
There's no seeded account. Open the deployed URL and use "Create one" on the
sign-in screen to register the first owner account for your shop — it
automatically becomes the `owner` of a new business, exactly like the first
sign-in used to work with ChatGPT auth.

## Notes
- Sessions are cookie-based (`md_session`, HttpOnly, Secure, 30-day expiry) and
  stored hashed in the `sessions` D1 table. Signing out deletes the session
  row and clears the cookie.
- Passwords are hashed with PBKDF2-SHA256 (100,000 iterations) via the Web
  Crypto API — no external auth service required.
- If you ever want to add Google/GitHub login instead of or alongside
  passwords, that's a separate follow-up — the `SessionUser` shape in
  `app/auth.ts` is the only thing `lib/server.ts` depends on, so it's a
  contained change.
- `pnpm test` and `pnpm exec tsc --noEmit` both pass against this version —
  run them again after any further changes.
