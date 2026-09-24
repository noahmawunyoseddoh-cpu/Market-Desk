import { boundary, json, body, AppError, rateLimit, clientIp } from "@/lib/server";
import { consumePasswordReset } from "@/app/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return boundary(async () => {
    await rateLimit(`reset:ip:${clientIp(request)}`, 15, 3600);
    const data = await body(request);
    const token = typeof data.token === "string" ? data.token : "";
    const password = typeof data.password === "string" ? data.password : "";
    const confirmPassword = typeof data.confirmPassword === "string" ? data.confirmPassword : "";
    if (!token) throw new AppError("This reset link is missing its token. Request a new one.");
    if (password.length < 8) throw new AppError("Your password must be at least 8 characters.");
    if (password !== confirmPassword) throw new AppError("Passwords do not match.");
    const ok = await consumePasswordReset(token, password);
    if (!ok) throw new AppError("This reset link is invalid or has expired. Request a new one.");
    return json({ ok: true });
  });
}
