import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Loader2 } from 'lucide-react';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ---- Button ----------------------------------------------------------------

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'text-white bg-gradient-to-br from-[var(--color-accent)] to-[#5b8bff] hover:brightness-110 shadow-[0_8px_24px_-8px_rgba(124,92,255,0.7)] border border-white/10',
  ghost:
    'text-[var(--color-ink)] bg-white/5 hover:bg-white/10 border border-white/10',
  subtle:
    'text-[var(--color-ink-dim)] hover:text-white hover:bg-white/5 border border-transparent',
  danger:
    'text-white bg-gradient-to-br from-[#f43f5e] to-[#fb7185] hover:brightness-110 border border-white/10',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm',
        variantClasses[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---- Card ------------------------------------------------------------------

export function GlassCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('glass p-5', className)}>{children}</div>;
}

// ---- Inputs ----------------------------------------------------------------

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-[var(--color-ink-dim)]">
        {label}
        {required && <span className="text-[var(--color-bad)]">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[var(--color-ink-dim)]/70">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        {...rest}
        className={cn('glass-input w-full px-3.5 py-2.5 text-sm', className)}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        {...rest}
        className={cn('glass-input w-full px-3.5 py-2.5 text-sm', className)}
      />
    );
  },
);

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn('glass-input w-full px-3.5 py-2.5 text-sm [&>option]:bg-[#0b1024]', className)}
    >
      {children}
    </select>
  );
}

// ---- Misc ------------------------------------------------------------------

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--color-ink-dim)]">
      <Loader2 className="size-5 animate-spin text-[var(--color-accent)]" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-white/8 text-[var(--color-ink-dim)] border-white/10',
    good: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
    warn: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
    bad: 'bg-rose-400/10 text-rose-300 border-rose-400/20',
    accent: 'bg-violet-400/10 text-violet-300 border-violet-400/20',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="grid size-11 place-items-center rounded-xl bg-white/5 text-[var(--color-accent-2)]">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-[var(--color-ink-dim)]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
      {message}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-white/5 text-[var(--color-ink-dim)]">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-[var(--color-ink)]">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-[var(--color-ink-dim)]">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
