import { useState, type FormEvent } from 'react';
import { api } from '../api';

type Props = {
  required?: boolean;
  authenticated: boolean;
  onClose: () => void;
  onAuthenticated: (token: string) => void;
  onSignOut: () => void;
};

export function AccountDialog({ required = false, authenticated, onClose, onAuthenticated, onSignOut }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') await api.register(username.trim(), password);
      const { token } = await api.login(username.trim(), password);
      onAuthenticated(token);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Account request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={required ? 'auth-gate' : 'modal'} role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
      {required && <p className="auth-gate__brand">Nano-BluePrint</p>}
      <div className={`modal__card account-dialog${required ? ' account-dialog--required' : ''}`}>
        <header>
          <h2 id="account-dialog-title">{required ? 'Sign in to continue' : 'Account'}</h2>
          {!required && <button className="icon" onClick={onClose} aria-label="Close">×</button>}
        </header>
        {authenticated ? (
          <>
            <p>You are signed in. Your projects and published schemas are linked to your account.</p>
            <div className="row">
              <button onClick={onClose}>Close</button>
              <button className="danger" onClick={onSignOut}>Sign out</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="row">
              <button type="button" className={mode === 'login' ? 'primary' : ''} onClick={() => setMode('login')}>Sign in</button>
              <button type="button" className={mode === 'register' ? 'primary' : ''} onClick={() => setMode('register')}>Create account</button>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <label>Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </label>
            <label>Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required />
            </label>
            {mode === 'register' && <p className="hint">Use a strong password that meets the server's password policy.</p>}
            <div className="row">
              {!required && <button type="button" onClick={onClose}>Cancel</button>}
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
