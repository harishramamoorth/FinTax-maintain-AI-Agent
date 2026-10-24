import fintaxLogo from '@/features/fintax/image.png';

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={fintaxLogo} alt="FinTax logo" className="size-8 shrink-0 rounded-lg bg-white object-contain p-0.5" />
      {!collapsed && <span className="text-[17px] font-semibold tracking-tight">FinTax</span>}
    </div>
  );
}
