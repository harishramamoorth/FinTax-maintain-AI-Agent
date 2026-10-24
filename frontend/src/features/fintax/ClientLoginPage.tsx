
import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  BriefcaseBusiness,
  Check,
  Eye,
  EyeOff,
  FileText,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import { Badge, Button } from '@/components/ui/primitives';
import { DEMO_ACCOUNTS, type DemoRole } from './demoAccounts';
import fintaxLogo from './image.png';

const roleDescription: Record<DemoRole, string> = {
  client: 'Upload company documents, check requests, and ask questions about your demo records.',
  staff: 'Review client documents, manage follow-ups, and reply to accounting questions.',
  admin: 'View the demo client portfolio, team activity, and workspace overview.',
};

const roleFeatures: Record<DemoRole, string[]> = {
  client: ['Company and document overview', 'Upload and track documents', 'Assistant answers from demo records'],
  staff: ['Assigned client workspaces', 'Document review and feedback', 'Requests and client replies'],
  admin: ['Client portfolio overview', 'Team and workflow activity', 'Demo administration tools'],
};

function LoginBrandHeader({
  selectedRole,
  selectedAccount,
  onSelectRole,
  onContinue,
  reduceMotion,
}: {
  selectedRole: DemoRole | null;
  selectedAccount: (typeof DEMO_ACCOUNTS)[number] | null;
  onSelectRole: (role: DemoRole) => void;
  onContinue: (role: DemoRole) => void;
  reduceMotion: boolean;
}) {
  return (
    <header className="auth-login-header">
      <div className="auth-login-brand">
        <motion.div
          whileHover={reduceMotion ? undefined : { rotate: -6, scale: 1.04 }}
          className="auth-brand-logo"
        >
          <img src={fintaxLogo} alt="FinTax logo" />
        </motion.div>
        <div className="auth-brand-copy">
          <p>FinTax <span>Consulting</span></p>
          <p>Accounting and client workspace demo</p>
        </div>
      </div>
      <div className="auth-login-controls">
        <nav aria-label="Choose a demo workspace" className="auth-role-nav">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.role}
              type="button"
              onClick={() => onSelectRole(account.role)}
              aria-current={selectedRole === account.role ? 'page' : undefined}
              className={selectedRole === account.role ? 'is-selected' : ''}
            >
              {account.title}
            </button>
          ))}
        </nav>
        <button
          type="button"
          disabled={!selectedAccount}
          onClick={() => selectedAccount && onContinue(selectedAccount.role)}
          className="auth-open-workspace"
        >
          Open workspace <ArrowRight size={15} />
        </button>
      </div>
    </header>
  );
}

export default function ClientLoginPage({
  error,
  onSelectRole,
  onContinue,
}: {
  error: string;
  onSelectRole: (role: DemoRole | null) => void;
  onContinue: (role: DemoRole) => void;
}) {
  const [selectedRole, setSelectedRole] = useState<DemoRole | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;

  const selectedAccount =
    DEMO_ACCOUNTS.find((account) => account.role === selectedRole) ?? null;

  const selectRole = (role: DemoRole | null) => {
    setSelectedRole(role);
    setShowPassword(false);
    onSelectRole(role);
  };

  const enterTransition = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.65, ease: 'easeOut' as const },
      };

  return (
    <main className="fintax-auth relative flex h-[100dvh] min-h-screen items-start justify-center overflow-x-clip overflow-y-auto px-3 py-4 sm:px-6 sm:py-8 md:items-center">
      {/* Animated background */}
      <div className="auth-background" aria-hidden="true">
        <motion.div
          className="auth-blob auth-blob-purple"
          animate={
            reduceMotion
              ? {}
              : {
                  borderRadius: [
                    '48% 52% 60% 40% / 45% 40% 60% 55%',
                    '60% 40% 42% 58% / 55% 60% 40% 45%',
                    '48% 52% 60% 40% / 45% 40% 60% 55%',
                  ],
                  rotate: [0, 9, 0],
                  scale: [1, 1.05, 1],
                }
          }
          transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="auth-blob auth-blob-blue"
          animate={
            reduceMotion
              ? {}
              : { y: [0, -22, 0], x: [0, 14, 0], rotate: [0, -7, 0] }
          }
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="auth-orb auth-orb-one" />
        <div className="auth-orb auth-orb-two" />
        <div className="auth-grid" />
      </div>

      <motion.div {...enterTransition} className="relative z-10 w-full max-w-6xl">
        <LoginBrandHeader
          selectedRole={selectedRole}
          selectedAccount={selectedAccount}
          onSelectRole={selectRole}
          onContinue={onContinue}
          reduceMotion={reduceMotion}
        />

        {/* Main split-screen card */}
        <section className="auth-card grid overflow-hidden md:grid-cols-2">
          {/* Left: Login and role selection */}
          <div className="auth-form-panel relative flex flex-col p-6 sm:p-9 lg:p-12">
            <div className="auth-small-glow" aria-hidden="true" />

            <div className="relative z-10">
              <motion.div
                key={selectedRole ?? 'welcome'}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <div className="auth-icon-circle">
                  {selectedRole === 'client' ? (
                    <UserRound size={24} />
                  ) : selectedRole === 'staff' ? (
                    <BriefcaseBusiness size={24} />
                  ) : selectedRole === 'admin' ? (
                    <ShieldCheck size={24} />
                  ) : (
                    <BriefcaseBusiness size={24} />
                  )}
                </div>

                <p className="mt-5 text-center text-xs font-bold uppercase tracking-[0.2em] text-violet-600">
                    {selectedAccount ? `${selectedAccount.title} demo access` : 'Role-based workspace preview'}
                </p>

                <h1 className="mt-2 text-center font-serif text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  {selectedAccount
                    ? `Hello, ${selectedAccount.title}!`
                    : 'Hello there!'}
                </h1>

                <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-6 text-slate-500">
                  {selectedAccount
                    ? roleDescription[selectedAccount.role]
                    : 'Choose Client, Staff, or Admin to preview the tools and sample data for that workspace.'}
                </p>
              </motion.div>

              {/* Role selector */}
              <div className="mt-7">
                <p className="mb-3 text-xs font-semibold text-slate-700">
                  Choose your workspace
                </p>

                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Choose demo role">
                  {DEMO_ACCOUNTS.map((account, index) => {
                    const Icon =
                      account.role === 'client'
                        ? UserRound
                        : account.role === 'staff'
                          ? BriefcaseBusiness
                          : ShieldCheck;

                    const active = selectedRole === account.role;

                    return (
                      <motion.button
                        key={account.role}
                        type="button"
                        aria-pressed={active}
                        onClick={() => selectRole(account.role)}
                        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.07, duration: 0.3 }}
                        whileHover={reduceMotion ? undefined : { y: -3 }}
                        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                        className={`auth-role-option ${
                          active ? 'auth-role-active' : ''
                        }`}
                      >
                        <Icon size={19} />
                        <span>{account.title}</span>
                        {active && <Check className="auth-role-check" size={13} />}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Selected account */}
              <div className="mt-5">
                {selectedAccount ? (
                  <motion.div
                    key={selectedAccount.role}
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="auth-account-box">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-600">
                            Fictional demo account
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {selectedAccount.name}
                          </p>
                        </div>
                        <Badge tone="violet">DEMO</Badge>
                      </div>

                      <label className="auth-field-label mt-4">
                        <span>Demo username</span>
                        <span className="auth-input-wrap">
                          <UserRound size={17} />
                          <input
                            readOnly
                            value={selectedAccount.username}
                            aria-label="Demo username"
                          />
                          <Check className="auth-field-check" size={16} />
                        </span>
                      </label>

                      <label className="auth-field-label mt-3">
                        <span>Demo password · display only</span>
                        <span className="auth-input-wrap">
                          <LockKeyhole size={17} />
                          <input
                            readOnly
                            type={showPassword ? 'text' : 'password'}
                            value={selectedAccount.password}
                            aria-label="Demo password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="auth-password-toggle"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </span>
                      </label>

                      <div className="mt-4 flex flex-col gap-2">
                        <motion.div
                          whileHover={reduceMotion ? undefined : { scale: 1.015 }}
                          whileTap={reduceMotion ? undefined : { scale: 0.985 }}
                        >
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => onContinue(selectedAccount.role)}
                            icon={<ArrowRight size={17} />}
                            className="w-full justify-center"
                          >
                            Continue to {selectedAccount.title}
                          </Button>
                        </motion.div>

                        <button
                          type="button"
                          onClick={() => selectRole(null)}
                          className="auth-back-button"
                        >
                          <ArrowLeft size={14} />
                          Choose another workspace
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-slate-500">
                      <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                      <p>
                        This demo opens the selected workspace directly. These sample
                        credentials are not sent to a server.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="role-prompt"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="auth-placeholder"
                  >
                    <BriefcaseBusiness size={18} />
                    <p>
                      Select a role to see its workspace details and continue.
                    </p>
                  </motion.div>
                )}
              </div>

              {error && (
                <motion.p
                  initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                >
                  {error}
                </motion.p>
              )}
            </div>

            <div className="mt-auto pt-7">
              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400">
                <ShieldCheck size={14} />
                Fictional sample data · no server login
              </div>
            </div>
          </div>

          {/* Right: Decorative animated purple panel */}
          <aside className="auth-art-panel relative isolate flex min-h-[420px] flex-col justify-between overflow-hidden p-7 text-white sm:p-10 lg:p-12">
            <div className="auth-art-blob auth-art-blob-one" />
            <div className="auth-art-blob auth-art-blob-two" />
            <div className="auth-art-ring auth-art-ring-one" />
            <div className="auth-art-ring auth-art-ring-two" />

            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/90">
                <span className="grid size-8 place-items-center rounded-xl border border-white/20 bg-white/10 backdrop-blur">
                  <Building2 size={16} />
                </span>
                FinTax Workspace
              </div>
              <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[9px] font-semibold tracking-widest text-white/90 backdrop-blur">
                INTERACTIVE DEMO
              </span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={selectedRole ?? 'art-welcome'}
                initial={reduceMotion ? false : { opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: -10 }}
                transition={{ duration: 0.35 }}
                className="relative z-10 my-12"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/65">
                  {selectedAccount
                    ? `${selectedAccount.title} workspace`
                    : 'A clearer place for your accounting work.'}
                </p>

                <h2 className="mt-4 max-w-lg font-serif text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                  {selectedAccount
                    ? selectedAccount.role === 'client'
                      ? 'Your business. In better focus.'
                      : selectedAccount.role === 'staff'
                        ? 'Your work. One clear flow.'
                        : 'Your platform. In control.'
                    : 'Welcome back to a clearer financial future.'}
                </h2>

                <p className="mt-5 max-w-md text-sm leading-7 text-white/80">
                  {selectedAccount
                    ? roleDescription[selectedAccount.role]
                    : 'Preview document workflows, client requests, and team review tools using fictional demo records.'}
                </p>

                {selectedAccount && (
                  <div className="mt-6 space-y-3">
                    {roleFeatures[selectedAccount.role].map((feature, index) => (
                      <motion.div
                        key={feature}
                        initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center gap-3 text-sm text-white/90"
                      >
                        <span className="grid size-6 place-items-center rounded-full border border-white/25 bg-white/10">
                          <Check size={13} />
                        </span>
                        {feature}
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Floating preview cards */}
            <div className="relative z-10 grid grid-cols-2 gap-3">
              <motion.div
                animate={reduceMotion ? {} : { y: [0, -5, 0] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                className="auth-preview-card"
              >
                <span className="auth-preview-icon">
                  <FileText size={17} />
                </span>
                <p className="mt-4 text-sm font-semibold">Document workflow</p>
                <p className="mt-1 text-[10px] leading-5 text-white/65">
                  Upload · organize · review
                </p>
              </motion.div>

              <motion.div
                animate={reduceMotion ? {} : { y: [0, 5, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                className="auth-preview-card"
              >
                <span className="auth-preview-icon">
                  <MessageSquareText size={17} />
                </span>
                <p className="mt-4 text-sm font-semibold">Accounting assistant</p>
                <p className="mt-1 text-[10px] leading-5 text-white/65">
                  Demo-record answers · next steps
                </p>
              </motion.div>
            </div>

            <div className="relative z-10 mt-7 flex items-center gap-2 text-[10px] text-white/60">
              <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,255,190,.8)]" />
              Fictional data · browser demo
              <span className="ml-auto">FinTax Consulting</span>
            </div>
          </aside>
        </section>

        <footer className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] text-slate-500">
          <span>Client documents</span>
          <span className="text-violet-300">✦</span>
          <span>Staff operations</span>
          <span className="text-violet-300">✦</span>
          <span>Admin overview</span>
        </footer>
      </motion.div>
    </main>
  );
}
