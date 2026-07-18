import { Copy } from 'lucide-react';
import { Button, Field } from './ui';
import { useToast } from './Toast';

export function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const toast = useToast();
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <code className="glass-input flex-1 overflow-x-auto whitespace-nowrap px-3 py-2.5 font-mono text-xs">
          {value}
        </code>
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy className="size-3.5" />}
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
          }}
        >
          Copy
        </Button>
      </div>
      {secret && (
        <p className="mt-1 text-[11px] text-amber-300/80">⚠ Store this securely; it won't be shown again.</p>
      )}
    </Field>
  );
}
