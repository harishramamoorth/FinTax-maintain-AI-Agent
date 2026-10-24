import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, BriefcaseBusiness, FileText, KeyRound, Languages, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '@/services/api';
import { Button, Field, Input } from '@/components/ui/primitives';
import type { FinTaxUser } from '@/types/api';

export function FinTaxLogin({ user }: { user?: FinTaxUser }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeError, setChangeError] = useState('');
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const queryClient = useQueryClient();
  const arabic = language === 'ar';
  const demoSignIn = (account: 'admin' | 'staff' | 'client') => {
    const demoAccounts = {
      admin: { identifier: 'admin demo', password: 'admin demo@2026' },
      staff: { identifier: 'staff demo', password: 'staff demo@2026' },
      client: { identifier: 'client demo', password: 'client demo@2026' },
    };
    setIdentifier(demoAccounts[account].identifier);
    setPassword(demoAccounts[account].password);
    signIn.reset();
  };
  const signIn = useMutation({
    mutationFn: () => api.login(identifier.trim(), password),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(['fintax-user'], { user });
      void queryClient.invalidateQueries();
    },
  });
  const changePassword = useMutation({
    mutationFn: () => api.changePassword(password, newPassword),
    onSuccess: ({ user: updated }) => {
      queryClient.setQueryData(['fintax-user'], { user: updated });
      setPassword('');
    },
  });
  const changePasswordError = changePassword.error instanceof Error ? changePassword.error.message : changeError;
  const signInError = signIn.error instanceof ApiError
    ? (signIn.error.status === 401
      ? (arabic ? 'اسم المستخدم أو كلمة المرور غير صحيحة.' : 'Account or password is incorrect.')
      : signIn.error.message)
    : signIn.error instanceof Error
      ? signIn.error.message
      : null;

  return (
    <main dir={arabic ? 'rtl' : 'ltr'} lang={language} className="min-h-full overflow-y-auto px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto grid min-h-[min(720px,calc(100vh-6rem))] w-full max-w-5xl content-center items-center gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)] lg:gap-8">
        <section className="glass w-full rounded-2xl p-6 sm:p-9">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-cyan/10 text-cyan"><ShieldCheck className="size-6" /></div>
              <div><h1 className="text-xl font-semibold tracking-tight">FinTax</h1><p className="text-xs text-muted">{arabic ? 'بوابة آمنة للعملاء والموظفين' : 'Secure client and staff portal'}</p></div>
            </div>
            <button type="button" lang={arabic ? 'en' : 'ar'} onClick={() => setLanguage(arabic ? 'en' : 'ar')} className="inline-flex items-center gap-1.5 rounded-lg border hairline px-2.5 py-2 text-xs text-muted hover:text-ink">
              <Languages className="size-4" />{arabic ? 'English' : 'العربية'}
            </button>
          </div>

          {user?.must_change_password ? (
            <form className="mt-8 space-y-4" onSubmit={(e) => {
              e.preventDefault();
              setChangeError('');
              if (newPassword !== confirmPassword) { setChangeError(arabic ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.'); return; }
              changePassword.mutate();
            }}>
              <div><h2 className="text-lg font-semibold">{arabic ? 'أنشئ كلمة مرور جديدة' : 'Set a new password'}</h2><p className="mt-1 text-sm text-muted">{arabic ? 'غيّر كلمة المرور المؤقتة قبل المتابعة.' : 'Change your temporary password before continuing.'}</p></div>
              <Field label={arabic ? 'كلمة المرور الجديدة (12 حرفًا على الأقل)' : 'New password (at least 12 characters)'} htmlFor="fintax-new-password">
                <Input id="fintax-new-password" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </Field>
              <Field label={arabic ? 'تأكيد كلمة المرور الجديدة' : 'Confirm new password'} htmlFor="fintax-confirm-password">
                <Input id="fintax-confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </Field>
              {changePasswordError && <p role="alert" className="rounded-lg border border-bad/25 bg-bad/5 px-3 py-2 text-sm text-bad">{changePasswordError}</p>}
              <Button type="submit" variant="primary" loading={changePassword.isPending} className="w-full">{arabic ? 'تغيير كلمة المرور' : 'Change password'}</Button>
            </form>
          ) : (
            <form className="mt-8 space-y-5" onSubmit={(e) => { e.preventDefault(); signIn.mutate(); }}>
              <div><h2 className="text-2xl font-semibold tracking-tight">{arabic ? 'تسجيل الدخول' : 'Sign in'}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">{arabic ? 'سجّل الدخول باستخدام حساب FinTax. ستُفتح مساحة العمل المناسبة تلقائيًا حسب حسابك.' : 'Sign in with your FinTax account. Your workspace is selected automatically from your account.'}</p></div>
              <Field
                label={arabic ? 'اسم المستخدم أو البريد الإلكتروني أو رقم العميل' : 'Username, staff email, or client number'}
                htmlFor="fintax-identifier"
                hint={arabic ? 'يسجّل العملاء الدخول باستخدام رقم العميل.' : 'Clients sign in with their client number.'}
              >
                <Input id="fintax-identifier" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
              </Field>
              <Field label={arabic ? 'كلمة المرور' : 'Password'} htmlFor="fintax-password">
                <Input id="fintax-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {signInError && <p role="alert" className="rounded-lg border border-bad/25 bg-bad/5 px-3 py-2 text-sm text-bad">{signInError}</p>}
              <Button type="submit" variant="primary" loading={signIn.isPending} icon={<KeyRound className="size-4" />} className="w-full">
                {arabic ? 'تسجيل الدخول بأمان' : 'Sign in securely'}
              </Button>
              <Link to="/demo" className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border hairline text-sm font-medium text-cyan hover:bg-cyan/5">
                <FileText className="size-4" />{arabic ? 'استكشف العرض التفاعلي' : 'Explore interactive demo'}
              </Link>
              <p className="text-center text-xs text-muted">{arabic ? 'تنشئ FinTax الحسابات. التسجيل العام غير متاح.' : 'Accounts are created by FinTax. Public sign-up is disabled.'}</p>
            </form>
          )}
        </section>

        <aside className="space-y-4" aria-label={arabic ? 'أنواع الحسابات ومساعدة تسجيل الدخول' : 'Account roles and sign-in help'}>
          <div className="px-1">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan">{arabic ? 'بوابة واحدة بصلاحيات حسب الدور' : 'One portal, role-based access'}</p>
            <h2 className="mt-2 text-xl font-semibold">{arabic ? 'يحدد حسابك مساحة العمل الخاصة بك.' : 'Your account determines your workspace.'}</h2>
            <p className="mt-1 text-sm text-muted">{arabic ? 'لا يوجد اختيار للدور عند تسجيل الدخول. يقتصر الوصول على الصلاحيات الممنوحة لحسابك.' : 'No role switch at sign-in. Access is limited to your assigned permissions.'}</p>
          </div>
          <RoleCard
            icon={<ShieldCheck className="size-5" />}
            title={arabic ? 'المسؤول' : 'Administrator'}
            description={arabic ? 'يدير الحسابات والموظفين وتعيين العملاء.' : 'Manages accounts, staff, and client assignments.'}
            onDemoLogin={import.meta.env.DEV ? () => demoSignIn('admin') : undefined}
            demoLabel={arabic ? 'تعبئة دخول تجريبي' : 'Fill demo login'}
          />
          <RoleCard
            icon={<BriefcaseBusiness className="size-5" />}
            title={arabic ? 'الموظف' : 'Staff'}
            description={arabic ? 'يعمل مع العملاء المعيّنين إليه ويمكنه إنشاء حسابات للعملاء.' : 'Works with assigned clients and can create client accounts.'}
            onDemoLogin={import.meta.env.DEV ? () => demoSignIn('staff') : undefined}
            demoLabel={arabic ? 'تعبئة دخول تجريبي' : 'Fill demo login'}
          />
          <RoleCard
            icon={<Building2 className="size-5" />}
            title={arabic ? 'العميل' : 'Client'}
            description={arabic ? 'يمكنه الاطلاع على مستندات شركته ورفعها فقط.' : 'Can view and upload documents for their own company only.'}
            onDemoLogin={import.meta.env.DEV ? () => demoSignIn('client') : undefined}
            demoLabel={arabic ? 'تعبئة دخول تجريبي' : 'Fill demo login'}
          />
          {import.meta.env.DEV && <p className="rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-xs leading-5 text-muted">{arabic ? 'حسابات تجريبية محلية فقط. لا تستخدم مستندات حقيقية ولا تعرض خادم التطوير على الإنترنت.' : 'Local demo accounts only. Do not use real documents or expose the development server to the internet.'}</p>}
          <div className="flex gap-3 rounded-xl border hairline bg-bg2/55 p-4">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-cyan" />
            <div>
              <p className="text-sm font-medium">{arabic ? 'ملاحظة أمنية' : 'Security note'}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{arabic ? 'رموز التحقق لمرة واحدة للموظفين عبر البريد الإلكتروني وإعادة تعيين كلمة المرور عبر البريد غير مفعّلة بعد. تواصل مع FinTax للمساعدة في الحساب.' : 'Staff email one-time codes and email password reset are not enabled yet. Contact FinTax if you need account help.'}</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function RoleCard({ icon, title, description, onDemoLogin, demoLabel }: { icon: ReactNode; title: string; description: string; onDemoLogin?: () => void; demoLabel?: string }) {
  return (
    <div className="glass flex gap-3 rounded-xl p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-cyan/10 text-cyan">{icon}</span>
      <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted">{description}</p>
        {onDemoLogin && <button type="button" onClick={onDemoLogin} className="mt-2 text-xs font-medium text-cyan underline-offset-4 hover:underline">{demoLabel}</button>}
      </div>
    </div>
  );
}
