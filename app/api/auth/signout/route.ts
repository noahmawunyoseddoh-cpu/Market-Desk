import { boundary, json } from "@/lib/server";
import { signOutCurrentSession, isSecureRequest } from "@/app/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return boundary(async () => {
    await signOutCurrentSession(isSecureRequest(request));
    return json({ ok: true });
  });
}
