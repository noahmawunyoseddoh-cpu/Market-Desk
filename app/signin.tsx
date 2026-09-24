'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Mode = 'signin' | 'signup' | 'forgot';

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedUp, setSignedUp] = useState<{ email: string; verificationEmailSent: boolean } | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'forgot') {
        await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        // Always show the same message, whether or not the account exists.
        setForgotSent(true);
        return;
      }
      const res = await fetch(`/api/auth/${mode === 'signin' ? 'signin' : 'signup'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'signin' ? { email, password } : { email, password, confirmPassword, displayName }),
      });
      const data = (await res.json()) as { error?: string; email?: string; verificationEmailSent?: boolean };
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      if (mode === 'signup') {
        setSignedUp({ email: data.email || email, verificationEmailSent: !!data.verificationEmailSent });
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (signedUp) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              {signedUp.verificationEmailSent
                ? `We sent a verification link to ${signedUp.email}. You can start using MarketDesk now, but verifying secures your account and is needed to accept staff invites sent to this email.`
                : `Your account was created, but we couldn't send a verification email right now. You can still use MarketDesk — try verifying again later from your account.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => window.location.reload()}>Continue to MarketDesk</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'signin' ? 'Sign in to MarketDesk' : mode === 'signup' ? 'Create your MarketDesk account' : 'Reset your password'}</CardTitle>
          <CardDescription>
            {mode === 'signin' ? 'Use the email and password for your shop.' : mode === 'signup' ? 'Set up sign-in for your shop.' : "Enter your account's email and we'll send a reset link."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === 'forgot' && forgotSent ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">If an account exists for {email}, a reset link is on its way. Check your inbox.</p>
              <Button className="w-full" onClick={() => { switchMode('signin'); setForgotSent(false); }}>Back to sign in</Button>
            </>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              {mode === 'signup' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="displayName">Your name</Label>
                  <Input id="displayName" value={displayName} onChange={e => setDisplayName(e.target.value)} required maxLength={100} />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={200} autoComplete="email" />
              </div>
              {mode !== 'forgot' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={mode === 'signup' ? 8 : undefined}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  />
                </div>
              )}
              {mode === 'signup' && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
                </div>
              )}
              {mode === 'signin' && (
                <button type="button" className="text-sm text-muted-foreground underline underline-offset-4 text-left w-fit" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
              </Button>
            </form>
          )}
          {!(mode === 'forgot' && forgotSent) && (
            <button
              type="button"
              className="mt-4 text-sm text-muted-foreground underline underline-offset-4"
              onClick={() => switchMode(mode === 'signup' ? 'signin' : mode === 'forgot' ? 'signin' : 'signup')}
            >
              {mode === 'signin' ? "Don't have an account? Create one" : mode === 'signup' ? 'Already have an account? Sign in' : 'Back to sign in'}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
