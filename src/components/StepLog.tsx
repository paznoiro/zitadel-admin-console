import { CheckCircle2, CircleDashed, Loader2, MinusCircle, XCircle } from 'lucide-react';
import type { TransferStep } from '../api/transfer';
import { cn } from './ui';

/** One row of a live export/import progress log. */
export function StepRow({ step }: { step: TransferStep }) {
  const icon =
    step.status === 'done' ? (
      <CheckCircle2 className="size-4 text-[var(--color-good)]" />
    ) : step.status === 'error' ? (
      <XCircle className="size-4 text-[var(--color-bad)]" />
    ) : step.status === 'running' ? (
      <Loader2 className="size-4 animate-spin text-[var(--color-accent-2)]" />
    ) : step.status === 'skipped' ? (
      <MinusCircle className="size-4 text-amber-400" />
    ) : (
      <CircleDashed className="size-4 text-[var(--color-ink-dim)]" />
    );

  const indent = step.kind === 'role' || step.kind === 'app' ? 'ml-6' : '';

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm',
        step.kind === 'project' && 'mt-1 font-medium',
        indent,
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <span className="text-[var(--color-ink)]">{step.label}</span>
        {step.detail && (
          <span
            className={cn(
              'ml-2 text-[11px]',
              step.status === 'error' ? 'text-rose-300' : 'text-[var(--color-ink-dim)]',
            )}
          >
            {step.detail}
          </span>
        )}
      </div>
    </div>
  );
}
