import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './ui';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl' | '2xl' | 'fullscreen';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const width =
    size === 'fullscreen'
      ? 'max-w-[min(96rem,calc(100vw-2rem))]'
      : size === '2xl'
      ? 'max-w-6xl'
      : size === 'xl'
        ? 'max-w-3xl'
        : size === 'lg'
          ? 'max-w-2xl'
          : 'max-w-lg';
  const bodyMaxHeight = size === 'fullscreen' ? 'calc(100vh - 11rem)' : '70vh';

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-[#04060f]/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="flex min-h-full items-start justify-center p-4 py-8">
        <div
          role="dialog"
          aria-modal="true"
          className={cn('glass fade-up relative z-10 w-full', width)}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-ink)]">{title}</h2>
              {description && (
                <p className="mt-0.5 text-xs text-[var(--color-ink-dim)]">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-[var(--color-ink-dim)] transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: bodyMaxHeight }}>{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3.5">{footer}</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
