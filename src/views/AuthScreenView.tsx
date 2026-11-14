import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  ArrowRight,
  AlertTriangle,
  UserCheck,
  Stethoscope,
  Shield,
  HeartHandshake,
  KeyRound,
  CheckCircle2,
  Sparkles,
  MapPin,
  Pill,
  Receipt,
  Users
} from 'lucide-react';
import { AppUser } from '../types/hospital';
import { hospitalApi } from '../services/hospitalApi';

interface AuthScreenViewProps {
  initialMode?: 'login' | 'activate';
  onLoginSuccess: (user?: AppUser) => void;
  onReturnToDashboard: () => void;
  users?: AppUser[];
  currentUser?: AppUser;
}

export const AuthScreenView: React.FC<AuthScreenViewProps> = ({
  initialMode = 'login',
  onLoginSuccess,
  onReturnToDashboard,
  users = hospitalApi.getUsers(),
  currentUser = hospitalApi.getCurrentUser()
}) => {
  const [mode, setMode] = useState<'login' | 'activate'>(initialMode);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Activation form state
  const [activateEmail, setActivateEmail] = useState('');
  const [activatePin, setActivatePin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Feedback states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Strict domain validation helper
  const isSahacharaDomain = (email: string) => {
    const clean = (email || '').trim().toLowerCase();
    return clean.endsWith('@sahachara.com') && clean.indexOf('@') > 0;
  };

  // Handle Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = loginEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setErrorMessage('Please enter your official staff email address.');
      return;
    }

    if (!isSahacharaDomain(cleanEmail)) {
      setErrorMessage(
        'Access Denied: Only official @sahachara.com email accounts are permitted to authenticate into SahacharaOS.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await hospitalApi.login(cleanEmail, loginPassword);
      setIsSubmitting(false);

      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setErrorMessage(res.error || 'Authentication failed. Please verify credentials or contact IT.');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Network error during login.');
    }
  };

  // Handle Account Activation submission
  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = activateEmail.trim().toLowerCase();
    const cleanPin = activatePin.trim();

    if (!cleanEmail) {
      setErrorMessage('Please enter your official staff email address.');
      return;
    }

    if (!isSahacharaDomain(cleanEmail)) {
      setErrorMessage(
        'Access Denied: Account activation is strictly restricted to @sahachara.com staff members.'
      );
      return;
    }

    if (!cleanPin) {
      setErrorMessage('Please enter the security PIN provided by hospital administration.');
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setErrorMessage('Security password must contain at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('The passwords entered do not match. Please re-enter carefully.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await hospitalApi.activateAccount(cleanEmail, cleanPin, newPassword);
      setIsSubmitting(false);

      if (res.success && res.user) {
        setSuccessMessage('Account activated successfully! Logging you into SahacharaOS...');
        setTimeout(() => {
          onLoginSuccess(res.user);
        }, 600);
      } else {
        setErrorMessage(res.error || 'Activation failed. Please verify your security PIN.');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Connection error during account activation.');
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-white font-sans select-none overflow-x-hidden">
      {/* Main Split Section */}
      <div className="flex-1 flex flex-col lg:flex-row w-full min-h-[calc(100vh-48px)]">
        {/* Left Side: Exact Hospital Photo Asset provided by user */}
        <div className="relative w-full lg:w-[61%] min-h-[340px] lg:min-h-full flex items-center justify-center overflow-hidden bg-[#020b24]">
          <img
            src="/assets/aistudio/LOGIN_05a89b00.png"
            alt="Sahachara Ayurveda Yoga Ecoliving"
            className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
          />
          {/* Subtle gradient overlay to enhance legibility and clinical branding */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />


        </div>

        {/* Right Side: Clean Carbon Form Panel */}
        <div className="w-full lg:w-[39%] bg-white flex flex-col justify-center px-6 sm:px-12 md:px-16 lg:px-16 xl:px-20 py-8 lg:py-12">
          <div className="max-w-[420px] w-full mx-auto flex flex-col justify-between">
            {/* Top Branding & Headers */}
            <div>
              <div className="flex items-center justify-between">
                <div className="text-[12px] sm:text-[13px] font-bold tracking-[0.08em] text-[#161616] uppercase">
                  SAHACHARA AYURVEDA
                </div>

              </div>
              <h1 className="text-2xl sm:text-[26px] font-semibold text-[#161616] tracking-tight leading-tight mt-1">
                Operations Management System
              </h1>


              {/* Mode Toggle Tabs: [ Sign in ] vs [ Activate Staff Account ] */}
              <div className="flex border-b border-[#e0e0e0] mt-5 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`pb-2.5 px-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 -mb-[2px] ${mode === 'login'
                    ? 'border-[#0f62fe] text-[#0f62fe]'
                    : 'border-transparent text-[#525252] hover:text-[#161616]'
                    }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('activate');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`pb-2.5 px-3 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer border-b-2 -mb-[2px] flex items-center gap-1.5 ${mode === 'activate'
                    ? 'border-[#0f62fe] text-[#0f62fe]'
                    : 'border-transparent text-[#525252] hover:text-[#161616]'
                    }`}
                >

                  <span>Activate Staff Account</span>
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="mb-5 p-3 bg-[#fff1f1] border-l-4 border-[#da1e28] text-[#da1e28] text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Success Banner */}
            {successMessage && (
              <div className="mb-5 p-3 bg-[#defbe6] border-l-4 border-[#24a148] text-[#0e6027] text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#24a148]" />
                <span className="leading-relaxed font-medium">{successMessage}</span>
              </div>
            )}

            {/* MODE 1: SIGN IN */}
            {mode === 'login' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-5">
                {/* Field 1: Staff Email Address */}
                <div>
                  <label className="block text-xs font-normal text-[#525252] mb-1">
                    Staff Email Address
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="username@sahachara.com"
                    className="w-full bg-transparent border-b border-[#8d8d8d] focus:border-[#0f62fe] text-sm text-[#161616] py-2 px-0 outline-none transition-colors placeholder-[#a8a8a8] rounded-none font-mono"
                    required
                  />

                </div>

                {/* Field 2: Password */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-normal text-[#525252]">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('activate');
                        setActivateEmail(loginEmail);
                      }}
                      className="text-[11px] text-[#0f62fe] hover:underline cursor-pointer"
                    >

                    </button>
                  </div>
                  <div className="relative flex items-center border-b border-[#8d8d8d] focus-within:border-[#0f62fe] transition-colors">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your security password"
                      className="w-full bg-transparent text-sm text-[#161616] py-2 pr-9 px-0 outline-none placeholder-[#a8a8a8] rounded-none"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-1 text-[#525252] hover:text-[#161616] transition-colors p-1 cursor-pointer"
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Sign in Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white flex items-center justify-between px-5 text-sm font-normal tracking-[0.16px] transition-colors cursor-pointer rounded-none disabled:opacity-60 mt-2"
                >
                  <span>{isSubmitting ? 'Authenticating...' : 'Sign in'}</span>
                  <div className="flex items-center">
                    <svg className="w-4 h-4 stroke-current fill-none" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 3h6v10H6" strokeWidth="1.5" strokeLinecap="square" />
                      <path d="M2 8h7m-3-3 3 3-3 3" strokeWidth="1.5" strokeLinecap="square" />
                    </svg>
                  </div>
                </button>
              </form>
            ) : (
              /* MODE 2: ACTIVATE STAFF ACCOUNT */
              <form onSubmit={handleActivateSubmit} className="space-y-4">


                {/* Field 1: Staff Email Address */}
                <div>
                  <label className="block text-xs font-normal text-[#525252] mb-1">
                    Staff Email Address <span className="text-[#da1e28]">*</span>
                  </label>
                  <input
                    type="email"
                    value={activateEmail}
                    onChange={(e) => setActivateEmail(e.target.value)}
                    placeholder="username@sahachara.com"
                    className="w-full bg-transparent border-b border-[#8d8d8d] focus:border-[#0f62fe] text-sm text-[#161616] py-2 px-0 outline-none transition-colors placeholder-[#a8a8a8] rounded-none font-mono"
                    required
                  />
                  <p className="text-[11px] text-[#6f6f6f] mt-1">Must be an @sahachara.com staff account</p>
                </div>

                {/* Field 2: Security PIN */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-normal text-[#525252]">
                      Onboarding Security PIN <span className="text-[#da1e28]">*</span>
                    </label>

                  </div>
                  <input
                    type="text"
                    value={activatePin}
                    onChange={(e) => setActivatePin(e.target.value)}
                    placeholder="Enter 4-digit PIN"
                    maxLength={4}
                    className="w-full bg-transparent border-b border-[#8d8d8d] focus:border-[#0f62fe] text-sm text-[#161616] py-2 px-0 outline-none transition-colors placeholder-[#a8a8a8] rounded-none font-mono tracking-widest"
                    required
                  />
                  <p className="text-[11px] text-[#6f6f6f] mt-1">
                    Enter the 4-digit code provided on your onboarding memo
                  </p>
                </div>

                {/* Field 3: Create Password */}
                <div>
                  <label className="block text-xs font-normal text-[#525252] mb-1">
                    Create Security Password <span className="text-[#da1e28]">*</span>
                  </label>
                  <div className="relative flex items-center border-b border-[#8d8d8d] focus-within:border-[#0f62fe] transition-colors">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full bg-transparent text-sm text-[#161616] py-2 pr-9 px-0 outline-none placeholder-[#a8a8a8] rounded-none"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-1 text-[#525252] hover:text-[#161616] transition-colors p-1 cursor-pointer"
                      aria-label="Toggle password view"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Field 4: Confirm Password */}
                <div>
                  <label className="block text-xs font-normal text-[#525252] mb-1">
                    Confirm Security Password <span className="text-[#da1e28]">*</span>
                  </label>
                  <div className="relative flex items-center border-b border-[#8d8d8d] focus-within:border-[#0f62fe] transition-colors">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full bg-transparent text-sm text-[#161616] py-2 pr-9 px-0 outline-none placeholder-[#a8a8a8] rounded-none"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-1 text-[#525252] hover:text-[#161616] transition-colors p-1 cursor-pointer"
                      aria-label="Toggle password view"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit Activation Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white flex items-center justify-between px-5 text-sm font-normal tracking-[0.16px] transition-colors cursor-pointer rounded-none disabled:opacity-60 mt-3"
                >
                  <span>{isSubmitting ? 'Verifying PIN & Activating...' : 'Activate & Sign in'}</span>
                  <KeyRound className="w-4 h-4" />
                </button>
              </form>
            )}



            {/* Bottom Row inside Form Container: Version & System Overview Link */}
            <div className="w-full border-t border-[#e0e0e0] mt-6 pt-4 flex items-center justify-between text-xs text-[#525252]">
              <span className="font-mono text-[11px]">SahacharaOS v2.4 (SAH)</span>
              <button
                type="button"
                onClick={onReturnToDashboard}
                className="text-[#0f62fe] hover:underline flex items-center gap-1.5 font-medium cursor-pointer"
              >
                <span>System Overview</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dark Footer Bar Spanning 100% Width */}
      <footer className="w-full h-12 bg-[#161616] border-t border-[#262626] flex items-center justify-between px-4 sm:px-8 text-xs text-[#c6c6c6] shrink-0">
        <div className="flex items-center gap-4 sm:gap-8">
          <button
            type="button"
            onClick={onReturnToDashboard}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Contact
          </button>
          <button
            type="button"
            onClick={onReturnToDashboard}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Privacy
          </button>
          <button
            type="button"
            onClick={onReturnToDashboard}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Terms of use
          </button>
          <button
            type="button"
            onClick={onReturnToDashboard}
            className="hover:text-white transition-colors cursor-pointer hidden sm:inline-block"
          >
            Accessibility
          </button>
        </div>

        <div className="text-xs text-[#c6c6c6]">
          Powered By <strong className="text-white font-semibold">Quebec Technologies</strong>
        </div>
      </footer>
    </div>
  );
};
