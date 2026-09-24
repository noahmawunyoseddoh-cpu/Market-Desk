'use client';
import { useEffect, useState } from 'react';

export default function VerifiedBanner() {
  const [status, setStatus] = useState<'verified' | 'failed' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verified = params.get('verified');
    if (verified === '1') setStatus('verified');
    else if (verified === '0') setStatus('failed');
    if (verified !== null) {
      params.delete('verified');
      const rest = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
    }
  }, []);

  if (!status) return null;
  return (
    <div style={{ padding: '10px 16px', textAlign: 'center', fontSize: 14, background: status === 'verified' ? '#eaf7ef' : '#fff7e9', color: status === 'verified' ? '#2f7a56' : '#966127' }}>
      {status === 'verified' ? 'Your email is verified.' : 'That verification link is invalid or has expired. You can request a new one from your account.'}
    </div>
  );
}
