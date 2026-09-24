import { boundary, json, body, textField, AppError, rateLimit, clientIp } from "@/lib/server";
import { createUser, createSession, setSessionCookie, normalizedEmail, isSecureRequest, createEmailVerification } from "@/app/auth";
import { sendVerificationEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  return boundary(async () => {
    await rateLimit(`signup:ip:${clientIp(request)}`, 5, 3600);
    const data = await body(request);
    const email = textField(data.email, 200, true);
    const displayName = textField(data.displayName ?? email, 100, true);
    const password = typeof data.password === "string" ? data.password : "";
    const confirmPassword = typeof data.confirmPassword === "string" ? data.confirmPassword : "";
    if (!validEmail(email)) throw new AppError("Please enter a valid email address.");
    if (password.length < 8) throw new AppError("Your password must be at least 8 characters.");
    if (password !== confirmPassword) throw new AppError("Passwords do not match.");
    let user;
    try {
      user = await createUser(normalizedEmail(email), password, displayName);
    } catch {
      throw new AppError("An account with this email already exists.", 409);
    }
    const token = await createSession(user.id);
    await setSessionCookie(token, isSecureRequest(request));
    const verificationToken = await createEmailVerification(user.id);
    const verificationEmailSent = await sendVerificationEmail(user.email, verificationToken);
    return json({ email: user.email, displayName: user.displayName, verificationEmailSent });
  });
}
