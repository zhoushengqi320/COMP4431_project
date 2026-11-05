import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, GraduationCap, LoaderCircle } from 'lucide-react';
import { apiRequest } from './auth.js';
import './auth.css';

function AuthBrand() {
  return <div className="auth-brand">
    <GraduationCap size={23} strokeWidth={1.7} aria-hidden="true" />
    <span>PolyPath</span>
  </div>;
}

function PasswordField({ id, label, value, onChange, autoComplete, hint, invalid, disabled }) {
  const [visible, setVisible] = useState(false);
  return <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className="auth-input-wrap">
      <input id={id} name={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} required minLength={8} maxLength={128} autoComplete={autoComplete} placeholder={id === 'auth-confirmation' ? 'Enter your password again' : 'Enter your password'} aria-describedby={hint ? `${id}-hint` : undefined} aria-invalid={invalid || undefined} disabled={disabled} />
      <button className="auth-password-toggle" type="button" onClick={() => setVisible(previous => !previous)} aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} disabled={disabled}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
    </div>
    {hint && <span className="auth-field-hint" id={`${id}-hint`}>{hint}</span>}
  </div>;
}

export function AuthScreen({ onAuthenticated, onContinueAsGuest }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const request = useRef(null);
  const errorRef = useRef(null);
  const isRegister = mode === 'register';

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function switchMode(next) {
    if (pending || next === mode) return;
    setMode(next); setError(''); setInvalidField(''); setPassword(''); setConfirmation('');
  }

  function edit(setter, field) {
    return event => { setter(event.target.value); if (invalidField === field) setInvalidField(''); if (error) setError(''); };
  }

  async function submit(event) {
    event.preventDefault();
    if (pending || request.current) return;
    setError(''); setInvalidField('');
    if (isRegister && name.trim().length < 2) { setError('Please enter a name with at least 2 characters.'); setInvalidField('name'); return; }
    if (isRegister && password !== confirmation) { setError('Your passwords do not match. Please enter the same password in both fields.'); setInvalidField('confirmation'); return; }
    setPending(true);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const body = isRegister ? { name: name.trim(), email: email.trim(), password } : { email: email.trim(), password, remember };
      const result = await apiRequest(`/api/auth/${mode}`, { method: 'POST', body, signal: controller.signal });
      if (!result?.user?.id) throw new Error('We could not open your workspace. Please try again.');
      onAuthenticated(result);
    } catch (caught) {
      setError(caught.name === 'AbortError' ? 'The request took too long. Please try again.' : caught.message);
    } finally {
      clearTimeout(timeout);
      setPending(false);
      if (request.current === controller) request.current = null;
    }
  }

  return <main className="auth-shell">
    <div className="auth-container">
      <AuthBrand />
      <section className="auth-form-panel" aria-labelledby="auth-title">
        <h1 id="auth-title">{isRegister ? 'Create account' : 'Sign in'}</h1>
        <p className="auth-form-description">Save your conversations and unlock documents, your academic profile and voice tools.</p>
        <form className="auth-form" onSubmit={submit} aria-busy={pending}>
          {error && <div className="auth-error" role="alert" ref={errorRef} tabIndex={-1}><AlertCircle size={17} /><span>{error}</span></div>}
          {isRegister && <div className="auth-field"><label htmlFor="auth-name">Name</label><div className="auth-input-wrap"><input id="auth-name" name="name" value={name} onChange={edit(setName, 'name')} autoComplete="name" placeholder="Your name" required minLength={2} maxLength={80} aria-invalid={invalidField === 'name' || undefined} disabled={pending} /></div></div>}
          <div className="auth-field"><label htmlFor="auth-email">Email address</label><div className="auth-input-wrap"><input id="auth-email" name="email" type="email" value={email} onChange={edit(setEmail, 'email')} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" required maxLength={254} disabled={pending} /></div></div>
          <PasswordField id="auth-password" label="Password" value={password} onChange={edit(setPassword, 'password')} autoComplete={isRegister ? 'new-password' : 'current-password'} hint={isRegister ? 'Use 8–128 characters.' : null} disabled={pending} />
          {isRegister && <PasswordField id="auth-confirmation" label="Confirm password" value={confirmation} onChange={edit(setConfirmation, 'confirmation')} autoComplete="new-password" invalid={invalidField === 'confirmation'} disabled={pending} />}
          {!isRegister && <label className="auth-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={pending} /><span>Keep me signed in</span></label>}
          <button className="auth-submit" type="submit" disabled={pending}>{pending && <LoaderCircle className="auth-spinner" size={17} />}<span>{pending ? (isRegister ? 'Creating account…' : 'Signing in…') : (isRegister ? 'Create account' : 'Sign in')}</span></button>
        </form>
        <p className="auth-switch-prompt">{isRegister ? 'Already have an account?' : 'Don’t have an account?'} <button type="button" onClick={() => switchMode(isRegister ? 'login' : 'register')} disabled={pending}>{isRegister ? 'Sign in' : 'Create account'}</button></p>
        {onContinueAsGuest && <button className="auth-guest-link" type="button" disabled={pending} onClick={onContinueAsGuest}>Continue as guest</button>}
      </section>
    </div>
  </main>;
}

export function AuthLoading({ error, onRetry }) {
  return <main className="auth-loading-screen"><AuthBrand /><div className="auth-loading-content">{error ? <><AlertCircle size={24} /><h1>Unable to open PolyPath</h1><p role="alert">{error}</p><button className="auth-submit" type="button" onClick={onRetry}>Try again</button></> : <><LoaderCircle size={24} className="auth-spinner" /><p role="status">Opening PolyPath…</p></>}</div></main>;
}

export default AuthScreen;
