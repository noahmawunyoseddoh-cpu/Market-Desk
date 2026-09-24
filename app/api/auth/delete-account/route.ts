import { boundary, json, body, textField, database, bucket, AppError, rateLimit, clientIp } from "@/lib/server";
import { getSessionUser, verifyPassword, signOutCurrentSession, isSecureRequest } from "@/app/auth";

export const dynamic = "force-dynamic";

const REASON_CATEGORIES = ["too_expensive", "missing_features", "switching_tools", "no_longer_needed", "other"] as const;

// Best-effort R2 cleanup for a business being fully removed. Never blocks account deletion if it fails —
// losing a few orphaned files is far less harmful than failing to delete someone's account and data.
async function deleteBusinessFiles(businessId: string) {
  const b = bucket();
  for (const prefix of [`${businessId}/`, `backups/${businessId}/`]) {
    try {
      let cursor: string | undefined;
      do {
        const listing = await b.list({ prefix, cursor, limit: 500 });
        if (listing.objects.length) await Promise.all(listing.objects.map((o) => b.delete(o.key)));
        cursor = listing.truncated ? listing.cursor : undefined;
      } while (cursor);
    } catch (err) {
      console.error("Could not fully clean up storage for business", businessId, err);
    }
  }
}

async function deleteBusinessData(businessId: string) {
  const db = database();
  await db.batch([
    db.prepare("DELETE FROM products WHERE owner=?").bind(businessId),
    db.prepare("DELETE FROM sales WHERE owner=?").bind(businessId),
    db.prepare("DELETE FROM purchases WHERE owner=?").bind(businessId),
    db.prepare("DELETE FROM adjustments WHERE owner=?").bind(businessId),
    db.prepare("DELETE FROM reconciliations WHERE owner=?").bind(businessId),
    db.prepare("DELETE FROM shop_revision WHERE owner=?").bind(businessId),
    db.prepare("DELETE FROM audit_events WHERE owner=?").bind(businessId),
    db.prepare("DELETE FROM backups WHERE owner=?").bind(businessId),
    db.prepare("DELETE FROM restore_operations WHERE owner=?").bind(businessId),
    db.prepare("DELETE FROM retired_operations WHERE owner=?").bind(businessId),
    db.prepare("DELETE FROM business_memberships WHERE business_id=?").bind(businessId),
    db.prepare("DELETE FROM active_businesses WHERE business_id=?").bind(businessId),
    db.prepare("DELETE FROM businesses WHERE owner=?").bind(businessId),
  ]);
  await deleteBusinessFiles(businessId);
}

export async function POST(request: Request) {
  return boundary(async () => {
    const user = await getSessionUser();
    if (!user) throw new AppError("Please sign in again to continue.", 401);
    await rateLimit(`delete-account:ip:${clientIp(request)}`, 5, 3600);

    const data = await body(request);
    const password = typeof data.password === "string" ? data.password : "";
    const reasonCategory = textField(data.reasonCategory, 40, true);
    const reasonDetails = textField(data.reasonDetails ?? "", 500);
    if (!(REASON_CATEGORIES as readonly string[]).includes(reasonCategory)) throw new AppError("Please choose a reason from the list.");

    const db = database();
    const account = await db.prepare("SELECT password_hash AS passwordHash FROM users WHERE id=?").bind(user.userId).first<{ passwordHash: string }>();
    if (!account || !(await verifyPassword(password, account.passwordHash))) throw new AppError("Your password was incorrect.", 401);

    // Every business this account belongs to, and whether another active owner exists for it.
    const memberships = (
      await db
        .prepare(
          `SELECT m.business_id AS businessId, m.is_owner AS isOwner,
            (SELECT COUNT(*) FROM business_memberships o WHERE o.business_id=m.business_id AND o.is_owner=1 AND o.status='active' AND o.user_id!=m.user_id) AS otherOwners
           FROM business_memberships m WHERE m.user_id=? AND m.status='active'`,
        )
        .bind(user.userId)
        .all<{ businessId: string; isOwner: number; otherOwners: number }>()
    ).results;

    for (const m of memberships) {
      if (m.isOwner && m.otherOwners === 0) {
        // This account is the only owner — the business has no one left to run it, so it's removed entirely.
        await deleteBusinessData(m.businessId);
      } else {
        // Someone else can still run this business; just remove this person from it.
        await db.prepare("DELETE FROM business_memberships WHERE business_id=? AND user_id=?").bind(m.businessId, user.userId).run();
      }
    }

    await db.batch([
      db.prepare("INSERT INTO account_deletion_feedback(id,email,reason_category,reason_details,created_at) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(), user.email, reasonCategory, reasonDetails, new Date().toISOString()),
      db.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM email_verifications WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM password_resets WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM active_businesses WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM users WHERE id=?").bind(user.userId),
    ]);

    await signOutCurrentSession(isSecureRequest(request));
    return json({ ok: true });
  });
}
