'use client';
import { useState } from 'react';

export default function VerifyReminder() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  async function resend() {
    setState('sending');
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const data = (await res.json()) as { sent?: boolean; alreadyVerified?: boolean };
      if (!res.ok) throw new Error();
      if (data.alreadyVerified) {
        window.location.reload();
        return;
      }
      setState(data.sent ? 'sent' : 'failed');
    } catch {
      setState('failed');
    }
  }

  return (
    <div style={{ padding: '10px 16px', textAlign: 'center', fontSize: 14, background: '#fff7e9', color: '#966127', display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
      <span>
        {state === 'sent'
          ? 'Verification email sent — check your inbox.'
          : state === 'failed'
          ? "Couldn't send the email right now. Try again in a moment."
          : 'Verify your email to secure your account and accept staff invites.'}
      </span>
      {state !== 'sent' && (
        <button onClick={resend} disabled={state === 'sending'} style={{ textDecoration: 'underline', background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: 0, font: 'inherit' }}>
          {state === 'sending' ? 'Sending…' : 'Resend email'}
        </button>
      )}
    </div>
  );
}
