import React, { useCallback, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { CheckCircle2, KeyRound, Loader2, Mail, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { apiUrl } from '../lib/apiClient';
import { auth, facebookProvider, googleProvider } from '../lib/firebase';

type AuthMode = 'login' | 'signup' | 'forgot';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  socialLoginEnabled?: boolean;
  googleLoginEnabled?: boolean;
  facebookLoginEnabled?: boolean;
  facebookAppId?: string;
  onOpenLegalPage: (slug: string) => void;
  onUserVerified?: () => void;
}

interface HumanChallengeState {
  token: string;
  question: string;
  openedAt: number;
}

function mapAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('auth/operation-not-allowed')) {
    return 'This sign-in method is not enabled in Firebase Console yet. Enable it under Authentication > Sign-in method.';
  }
  if (msg.includes('auth/account-exists-with-different-credential')) {
    return 'An account already exists with this email using a different sign-in provider. Sign in with your original method first.';
  }
  if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
    return 'Invalid email or password. Check your credentials or reset your password.';
  }
  if (msg.includes('auth/user-not-found')) {
    return 'No account found with that email address.';
  }
  if (msg.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (msg.includes('auth/weak-password')) {
    return 'Password should be at least 6 characters long.';
  }
  if (msg.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (msg.includes('auth/popup-closed-by-user')) {
    return 'Sign-in popup was closed before completing.';
  }
  if (msg.includes('auth/popup-blocked')) {
    return 'Browser blocked the sign-in popup. Please allow popups for this site and try again.';
  }
  return msg || 'Authentication failed. Please try again.';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  socialLoginEnabled = true,
  googleLoginEnabled,
  facebookLoginEnabled = false,
  facebookAppId,
  onOpenLegalPage,
  onUserVerified,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Anti-bot / anti-AI account creation defense state
  const [challenge, setChallenge] = useState<HumanChallengeState | null>(null);
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [isLoadingChallenge, setIsLoadingChallenge] = useState(false);

  const isGoogleActive =
    typeof googleLoginEnabled === 'boolean' ? googleLoginEnabled : socialLoginEnabled;
  const isFacebookActive = Boolean(facebookLoginEnabled);
  const hasAnySocialLogin = isGoogleActive || isFacebookActive;

  const loadHumanChallenge = useCallback(async () => {
    setIsLoadingChallenge(true);
    setChallengeAnswer('');
    try {
      const res = await fetch(apiUrl('/api/auth/challenge'));
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(
          data.error || 'Automated browsers cannot register accounts on this platform.'
        );
        setChallenge(null);
        return;
      }
      const data = (await res.json()) as { token: string; prompt?: string; question?: string };
      setChallenge({
        token: data.token,
        question: data.prompt || data.question || '',
        openedAt: Date.now(),
      });
    } catch {
      setErrorMessage('Unable to load human verification challenge.');
    } finally {
      setIsLoadingChallenge(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && mode === 'signup') {
      void loadHumanChallenge();
    }
  }, [isOpen, mode, loadHumanChallenge]);

  if (!isOpen) return null;

  const needsVerification = Boolean(currentUser && !currentUser.emailVerified);

  const verifyHumanBeforeSignup = async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.webdriver) {
      setErrorMessage('Automated browsers cannot create accounts.');
      return false;
    }
    if (honeypot.trim()) {
      setErrorMessage('Verification failed.');
      return false;
    }
    if (!challenge?.token) {
      setErrorMessage('Human verification challenge not loaded. Click refresh and try again.');
      return false;
    }
    if (!challengeAnswer.trim()) {
      setErrorMessage('Please answer the human verification check before creating an account.');
      return false;
    }

    const res = await fetch(apiUrl('/api/auth/verify-human'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: challenge.token,
        answer: challengeAnswer.trim(),
        honeypot,
        elapsedMs: Date.now() - challenge.openedAt,
        webdriverFlag: Boolean(typeof navigator !== 'undefined' && navigator.webdriver),
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErrorMessage(data.error || 'Human verification failed. Please solve the new check.');
      void loadHumanChallenge();
      return false;
    }
    return true;
  };

  const handleSocialSignIn = async (providerName: 'google' | 'facebook') => {
    setErrorMessage(null);
    setNoticeMessage(null);

    if (mode === 'signup') {
      setIsSubmitting(true);
      try {
        const passed = await verifyHumanBeforeSignup();
        if (!passed) {
          setIsSubmitting(false);
          return;
        }
      } catch {
        setErrorMessage('Unable to verify request.');
        setIsSubmitting(false);
        return;
      }
    } else {
      setIsSubmitting(true);
    }

    try {
      if (providerName === 'facebook') {
        facebookProvider.setCustomParameters({ display: 'popup' });
        await signInWithPopup(auth, facebookProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
      onClose();
    } catch (err) {
      setErrorMessage(mapAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setNoticeMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'forgot') {
        await sendPasswordResetEmail(auth, cleanEmail);
        setNoticeMessage(`Password reset link sent to ${cleanEmail}. Check your inbox.`);
        return;
      }

      if (mode === 'signup') {
        if (!displayName.trim()) {
          setErrorMessage('Please enter your full name.');
          return;
        }
        if (password.length < 6) {
          setErrorMessage('Password must be at least 6 characters.');
          return;
        }
        if (password !== confirmPassword) {
          setErrorMessage('Passwords do not match.');
          return;
        }

        const humanOk = await verifyHumanBeforeSignup();
        if (!humanOk) return;

        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 120) });
        await sendEmailVerification(cred.user);
        setNoticeMessage(
          `Account created. A verification link was sent to ${cleanEmail}. Verify your email to activate cloud sync.`
        );
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      if (cred.user.emailVerified) {
        onClose();
      } else {
        setNoticeMessage('Please verify your email address to enable cloud sync.');
      }
    } catch (err) {
      setErrorMessage(mapAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!currentUser) return;
    setErrorMessage(null);
    setNoticeMessage(null);
    setIsSubmitting(true);
    try {
      await sendEmailVerification(currentUser);
      setNoticeMessage(`Verification email resent to ${currentUser.email}.`);
    } catch (err) {
      setErrorMessage(mapAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefreshVerification = async () => {
    if (!currentUser) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await currentUser.reload();
      await currentUser.getIdToken(true);
      if (auth.currentUser?.emailVerified) {
        onUserVerified?.();
        onClose();
      } else {
        setErrorMessage('Email is still unverified. Click the link in your inbox first.');
      }
    } catch (err) {
      setErrorMessage(mapAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2
            id="auth-modal-title"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            {needsVerification
              ? 'Verify Your Email'
              : mode === 'login'
                ? 'Sign In to ClipIndex'
                : mode === 'signup'
                  ? 'Create Your Account'
                  : 'Reset Password'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg"
            aria-label="Close authentication modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
          {needsVerification ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                  <Mail className="w-4 h-4" aria-hidden="true" />
                  Email verification required
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  We sent a verification link to <strong>{currentUser?.email}</strong>. Click the
                  link in your email, then click Refresh Status below to unlock your cloud library.
                </p>
              </div>

              {errorMessage && (
                <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
              )}
              {noticeMessage && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">{noticeMessage}</p>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleRefreshVerification()}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Refresh Status
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleResendVerification()}
                  className="px-4 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Resend Email
                </button>
              </div>
            </div>
          ) : (
            <>
              {mode !== 'forgot' && (
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMessage(null);
                      setNoticeMessage(null);
                    }}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      mode === 'login'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setErrorMessage(null);
                      setNoticeMessage(null);
                    }}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      mode === 'signup'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    Create Account
                  </button>
                </div>
              )}

              {mode === 'signup' && (
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <ShieldAlert className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      Human Check (Anti-Bot Protection)
                    </span>
                    <button
                      type="button"
                      onClick={() => void loadHumanChallenge()}
                      disabled={isLoadingChallenge}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${isLoadingChallenge ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      New check
                    </button>
                  </div>

                  {challenge ? (
                    <div className="flex items-center gap-2.5">
                      <label
                        htmlFor="auth-human-check"
                        className="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
                      >
                        {challenge.question}
                      </label>
                      <input
                        id="auth-human-check"
                        type="text"
                        inputMode="numeric"
                        value={challengeAnswer}
                        onChange={(e) => setChallengeAnswer(e.target.value)}
                        placeholder="Answer"
                        className="w-24 px-2.5 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      {isLoadingChallenge ? 'Preparing verification check...' : 'Human check unavailable.'}
                    </p>
                  )}

                  {/* Hidden honeypot field to trap automated bots */}
                  <div className="sr-only" aria-hidden="true">
                    <label htmlFor="auth-company-hp">Leave this field blank</label>
                    <input
                      id="auth-company-hp"
                      name="company_website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {mode !== 'forgot' && hasAnySocialLogin && (
                <>
                  <div className="space-y-2">
                    {isGoogleActive && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => void handleSocialSignIn('google')}
                        className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <span className="font-semibold text-blue-600 dark:text-blue-400">G</span>
                        Continue with Google
                      </button>
                    )}

                    {isFacebookActive && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => void handleSocialSignIn('facebook')}
                        data-fb-app-id={facebookAppId || undefined}
                        className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-xs font-medium text-white bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-60 rounded-lg transition-colors"
                      >
                        <span className="font-bold">f</span>
                        Continue with Facebook
                      </button>
                    )}
                  </div>

                  <div className="relative flex items-center">
                    <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
                    <span className="px-3 text-[11px] text-slate-500 dark:text-slate-400">
                      or with email
                    </span>
                    <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
                  </div>
                </>
              )}

              <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-3.5">
                {mode === 'signup' && (
                  <div className="space-y-1">
                    <label
                      htmlFor="auth-name"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Full Name
                    </label>
                    <input
                      id="auth-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Alex Rivera"
                      required
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Email Address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </div>

                {mode !== 'forgot' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="auth-password"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        Password
                      </label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode('forgot');
                            setErrorMessage(null);
                            setNoticeMessage(null);
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <input
                      id="auth-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    />
                  </div>
                )}

                {mode === 'signup' && (
                  <div className="space-y-1">
                    <label
                      htmlFor="auth-confirm-password"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      Confirm Password
                    </label>
                    <input
                      id="auth-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={6}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    />
                  </div>
                )}

                {errorMessage && (
                  <div
                    role="alert"
                    className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
                  >
                    {errorMessage}
                  </div>
                )}

                {noticeMessage && (
                  <div
                    role="status"
                    className="px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-700 dark:text-emerald-300"
                  >
                    {noticeMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : mode === 'forgot' ? (
                    <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : null}
                  {mode === 'login'
                    ? 'Sign In'
                    : mode === 'signup'
                      ? 'Create Account'
                      : 'Send Reset Link'}
                </button>

                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMessage(null);
                      setNoticeMessage(null);
                    }}
                    className="w-full py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    Back to Sign In
                  </button>
                )}
              </form>

              <p className="text-[11px] text-slate-600 dark:text-slate-400 text-center leading-relaxed">
                By continuing, you agree to our{' '}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLegalPage('terms-of-service');
                  }}
                  className="underline hover:text-slate-900 dark:hover:text-slate-100"
                >
                  Terms of Service
                </button>{' '}
                and{' '}
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLegalPage('privacy-policy');
                  }}
                  className="underline hover:text-slate-900 dark:hover:text-slate-100"
                >
                  Privacy Policy
                </button>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
