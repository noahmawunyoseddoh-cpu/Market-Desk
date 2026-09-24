import { env } from "cloudflare:workers";

// Sends an email via Resend. Returns true on success, false on any failure
// (missing API key, network error, Resend rejecting the request, etc). This
// never throws — a failed email should never block the action that triggered
// it (e.g. an invite record should still be saved even if the email fails).
export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set; skipping email send.");
    return false;
  }
  const from = env.MAIL_FROM || "MarketDesk <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      console.error("Resend request failed", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend request threw", err);
    return false;
  }
}

export function appUrl(): string {
  return env.APP_URL || "https://app.marketstand.online";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export async function sendStaffInviteEmail(toEmail: string, inviterName: string, accessLabel: string): Promise<boolean> {
  const url = appUrl();
  const safeInviter = escapeHtml(inviterName || "A shop owner");
  const safeAccess = escapeHtml(accessLabel);
  const safeEmail = escapeHtml(toEmail);
  const html = `<p>${safeInviter} invited you to join their shop on MarketDesk with the following access: <b>${safeAccess}</b>.</p>
<p>To get access, go to <a href="${url}">${url}</a> and sign in (or create an account if you don't have one yet) using this exact email address: <b>${safeEmail}</b>.</p>
<p>Your access activates automatically as soon as you sign in with that email — no separate approval step needed.</p>`;
  const text = `${inviterName || "A shop owner"} invited you to join their shop on MarketDesk with this access: ${accessLabel}.\n\nGo to ${url} and sign in (or create an account) using this exact email address: ${toEmail}.\n\nYour access activates automatically as soon as you sign in with that email.`;
  return sendEmail(toEmail, "You've been invited to a MarketDesk shop", html, text);
}

export async function sendVerificationEmail(toEmail: string, token: string): Promise<boolean> {
  const link = `${appUrl()}/api/auth/verify?token=${encodeURIComponent(token)}`;
  const html = `<p>Confirm this is your email address to finish setting up your MarketDesk account.</p>
<p><a href="${link}">Verify my email</a></p>
<p>This link expires in 24 hours. If you didn't create a MarketDesk account, you can ignore this email.</p>`;
  const text = `Confirm this is your email address to finish setting up your MarketDesk account:\n\n${link}\n\nThis link expires in 24 hours. If you didn't create a MarketDesk account, you can ignore this email.`;
  return sendEmail(toEmail, "Verify your email for MarketDesk", html, text);
}

export async function sendPasswordResetEmail(toEmail: string, token: string): Promise<boolean> {
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const html = `<p>Someone requested a password reset for this MarketDesk account.</p>
<p><a href="${link}">Reset my password</a></p>
<p>This link expires in 2 hours. If you didn't request this, you can ignore this email — your password won't change.</p>`;
  const text = `Someone requested a password reset for this MarketDesk account:\n\n${link}\n\nThis link expires in 2 hours. If you didn't request this, you can ignore this email — your password won't change.`;
  return sendEmail(toEmail, "Reset your MarketDesk password", html, text);
}
