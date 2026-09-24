'use client';
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from './i18n-provider';

const REASONS: { value: string; label: string }[] = [
  { value: 'too_expensive', label: 'Too expensive' },
  { value: 'missing_features', label: "Missing features I need" },
  { value: 'switching_tools', label: 'Switching to another tool' },
  { value: 'no_longer_needed', label: 'No longer need this' },
  { value: 'other', label: 'Other' },
];

export default function DeleteAccount({ ownsSoloBusiness }: { ownsSoloBusiness: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reasonCategory, setReasonCategory] = useState('');
  const [reasonDetails, setReasonDetails] = useState('');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, reasonCategory, reasonDetails }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not delete your account.');
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your account.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <section className="panel recovery-panel">
        <div className="panel-title"><div><span>{t('DANGER ZONE')}</span><h2>{t('Delete account')}</h2></div><AlertTriangle size={22} /></div>
        <p>{t('Permanently delete your MarketDesk account.')}</p>
        <button className="danger secondary" onClick={() => setOpen(true)}>{t('Delete my account')}</button>
      </section>
    );
  }

  return (
    <section className="panel recovery-panel">
      <div className="panel-title"><div><span>{t('DANGER ZONE')}</span><h2>{t('Delete account')}</h2></div><AlertTriangle size={22} /></div>
      <p>
        {ownsSoloBusiness
          ? t('You are the only owner of at least one business. Deleting your account will permanently delete that business and all its products, sales, purchases and history. This cannot be undone.')
          : t('This permanently deletes your account and removes you from every business you belong to. Businesses you co-own with another owner will keep running. This cannot be undone.')}
      </p>
      <form className="product-form" onSubmit={submit}>
        <label>{t('Why are you leaving?')}
          <select required value={reasonCategory} onChange={e => setReasonCategory(e.target.value)}>
            <option value="" disabled>{t('Choose a reason')}</option>
            {REASONS.map(r => <option key={r.value} value={r.value}>{t(r.label)}</option>)}
          </select>
        </label>
        <label>{t('Anything else you want to tell us? (optional)')}
          <textarea maxLength={500} rows={3} value={reasonDetails} onChange={e => setReasonDetails(e.target.value)} />
        </label>
        <label>{t('Confirm your password')}
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <label>{t('Type DELETE to confirm')}
          <input value={confirmText} onChange={e => setConfirmText(e.target.value.toUpperCase())} placeholder="DELETE" />
        </label>
        {error && <p className="notice warning">{t(error)}</p>}
        <div className="recovery-actions">
          <button type="submit" className="primary danger" disabled={busy || confirmText !== 'DELETE'}>{busy ? t('Deleting…') : t('Permanently delete my account')}</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setOpen(false)}>{t('Cancel')}</button>
        </div>
      </form>
    </section>
  );
}
