import { boundary, json, AppError, database, rateLimit, clientIp } from "@/lib/server";
import { getSessionUser, createEmailVerification } from "@/app/auth";
import { sendVerificationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return boundary(async () => {
    const user = await getSessionUser();
    if (!user) throw new AppError("Please sign in again to continue.", 401);
    if (user.emailVerified) return json({ ok: true, alreadyVerified: true });
    await rateLimit(`resend-verification:user:${user.userId}`, 3, 3600);
    await rateLimit(`resend-verification:ip:${clientIp(request)}`, 10, 3600);
    // Old unused tokens for this account are cleared first so only the newest link works.
    await database().prepare("DELETE FROM email_verifications WHERE user_id=?").bind(user.userId).run();
    const token = await createEmailVerification(user.userId);
    const sent = await sendVerificationEmail(user.email, token);
    return json({ ok: true, sent });
  });
}
