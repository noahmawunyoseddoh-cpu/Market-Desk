import { consumeEmailVerification } from "@/app/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  let ok = false;
  try {
    ok = token ? await consumeEmailVerification(token) : false;
  } catch {
    ok = false;
  }
  return Response.redirect(new URL(`/?verified=${ok ? "1" : "0"}`, url.origin), 302);
}
