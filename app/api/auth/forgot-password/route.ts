import { boundary, json, body, textField, rateLimit, clientIp } from "@/lib/server";
import { findUserByEmail, createPasswordReset, normalizedEmail } from "@/app/auth";
import { sendPasswordResetEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return boundary(async () => {
    const data = await body(request);
    const email = textField(data.email, 200, true);
    // Limit by IP (stop mass requests) and by target email (stop someone flooding a specific inbox).
    await rateLimit(`forgot:ip:${clientIp(request)}`, 10, 3600);
    await rateLimit(`forgot:email:${normalizedEmail(email)}`, 3, 3600);
    const user = await findUserByEmail(email);
    // Always report success, whether or not the account exists, so this can't be used to check who has an account.
    if (user) {
      const token = await createPasswordReset(user.id);
      await sendPasswordResetEmail(user.email, token);
    }
    return json({ ok: true });
  });
}
