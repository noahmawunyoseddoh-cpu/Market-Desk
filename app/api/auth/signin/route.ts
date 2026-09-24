import { boundary, json, body, textField, AppError, rateLimit, clientIp } from "@/lib/server";
import { findUserByEmail, verifyPassword, createSession, setSessionCookie, isSecureRequest, normalizedEmail } from "@/app/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return boundary(async () => {
    const data = await body(request);
    const email = textField(data.email, 200, true);
    const password = typeof data.password === "string" ? data.password : "";
    // Limit by IP (stop one attacker hitting many accounts) and by the target email
    // (stop distributed attempts at guessing one specific account's password).
    await rateLimit(`signin:ip:${clientIp(request)}`, 30, 900);
    await rateLimit(`signin:email:${normalizedEmail(email)}`, 8, 900);
    const user = await findUserByEmail(email);
    const valid = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !valid) throw new AppError("Incorrect email or password.", 401);
    const token = await createSession(user.id);
    await setSessionCookie(token, isSecureRequest(request));
    return json({ email: user.email, displayName: user.displayName });
  });
}
