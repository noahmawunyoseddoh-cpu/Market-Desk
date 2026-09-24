import { cookies } from "next/headers";
import { env } from "cloudflare:workers";

export type SessionUser = {
  userId: string;
  email: string;
  displayName: string;
  fullName: string | null;
  emailVerified: boolean;
};

const SESSION_COOKIE = "md_session";
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000;

function database() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Buffer.from(buffer).toString("base64");
}
function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${toBase64(salt)}:${toBase64(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const actual = await deriveBits(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

function randomToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, "");
}

export function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

// Looks up a user by email. Returns null if none exists.
export async function findUserByEmail(email: string) {
  return database()
    .prepare("SELECT id, email, display_name AS displayName, password_hash AS passwordHash, email_verified AS emailVerified FROM users WHERE email=?")
    .bind(normalizedEmail(email))
    .first<{ id: string; email: string; displayName: string; passwordHash: string; emailVerified: number }>();
}

// Creates a new user account. Throws if the email is already registered.
export async function createUser(email: string, password: string, displayName: string): Promise<{ id: string; email: string; displayName: string }> {
  const db = database();
  const normalized = normalizedEmail(email);
  const existing = await db.prepare("SELECT id FROM users WHERE email=?").bind(normalized).first();
  if (existing) throw new Error("An account with this email already exists.");
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  await db
    .prepare("INSERT INTO users(id,email,display_name,password_hash,created_at) VALUES(?,?,?,?,?)")
    .bind(id, normalized, displayName.trim() || normalized, passwordHash, now)
    .run();
  return { id, email: normalized, displayName: displayName.trim() || normalized };
}

// Starts a new session for the given user id and returns the raw token to store in a cookie.
export async function createSession(userId: string): Promise<string> {
  const db = database();
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db
    .prepare("INSERT INTO sessions(id,user_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, tokenHash, now.toISOString(), expires.toISOString())
    .run();
  return token;
}

export async function destroySession(token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await database().prepare("DELETE FROM sessions WHERE token_hash=?").bind(tokenHash).run();
}

export async function setSessionCookie(token: string, secure: boolean): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(secure: boolean): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// Reads the session cookie (if any) and resolves it to a signed-in user.
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await database()
    .prepare(
      `SELECT s.expires_at AS expiresAt, u.id AS userId, u.email AS email, u.display_name AS displayName, u.email_verified AS emailVerified
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{ expiresAt: string; userId: string; email: string; displayName: string; emailVerified: number }>();
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) return null;
  return { userId: row.userId, email: row.email, displayName: row.displayName, fullName: null, emailVerified: !!row.emailVerified };
}

export async function signOutCurrentSession(secure: boolean): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  await clearSessionCookie(secure);
}

// Verification links are valid for a day; reset links are shorter-lived since a leaked reset link is more dangerous.
const VERIFICATION_HOURS = 24;
const RESET_HOURS = 2;

export async function createEmailVerification(userId: string): Promise<string> {
  const db = database();
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + VERIFICATION_HOURS * 60 * 60 * 1000);
  await db
    .prepare("INSERT INTO email_verifications(id,user_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, tokenHash, now.toISOString(), expires.toISOString())
    .run();
  return token;
}

// Marks the owning user's email verified if the token is valid and unexpired. Always consumes the token.
export async function consumeEmailVerification(token: string): Promise<boolean> {
  const db = database();
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare("SELECT id,user_id AS userId,expires_at AS expiresAt FROM email_verifications WHERE token_hash=?")
    .bind(tokenHash)
    .first<{ id: string; userId: string; expiresAt: string }>();
  if (!row) return false;
  await db.prepare("DELETE FROM email_verifications WHERE id=?").bind(row.id).run();
  if (new Date(row.expiresAt).getTime() < Date.now()) return false;
  await db.prepare("UPDATE users SET email_verified=1 WHERE id=?").bind(row.userId).run();
  return true;
}

export async function createPasswordReset(userId: string): Promise<string> {
  const db = database();
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + RESET_HOURS * 60 * 60 * 1000);
  await db
    .prepare("INSERT INTO password_resets(id,user_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, tokenHash, now.toISOString(), expires.toISOString())
    .run();
  return token;
}

// Applies a new password if the reset token is valid and unexpired, and signs the account out everywhere
// for safety. Always consumes the token so it can't be replayed.
export async function consumePasswordReset(token: string, newPassword: string): Promise<boolean> {
  const db = database();
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare("SELECT id,user_id AS userId,expires_at AS expiresAt FROM password_resets WHERE token_hash=?")
    .bind(tokenHash)
    .first<{ id: string; userId: string; expiresAt: string }>();
  if (!row) return false;
  await db.prepare("DELETE FROM password_resets WHERE id=?").bind(row.id).run();
  if (new Date(row.expiresAt).getTime() < Date.now()) return false;
  const passwordHash = await hashPassword(newPassword);
  await db.batch([
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(passwordHash, row.userId),
    db.prepare("DELETE FROM sessions WHERE user_id=?").bind(row.userId),
  ]);
  return true;
}

// True unless the request plainly arrived over http (i.e. local dev). Behind
// Cloudflare in production this is always true.
export function isSecureRequest(request: Request): boolean {
  if (new URL(request.url).protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto") === "https";
}
