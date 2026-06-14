import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Bot } from 'lucide-react';
import { addMachineUser, updateMachineUser } from '../api/users';
import type { User } from '../api/types';
import { Button, Field, Input } from './ui';
import { useToast } from './Toast';

export function MachineUserFormOverlay({
  orgId,
  user,
  onClose,
  onSaved,
}: {
  orgId: string;
  user?: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const toast = useToast();
  const qc = useQueryClient();
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState(user?.machine?.name ?? '');
  const [description, setDescription] = useState(user?.machine?.description ?? '');
  const [username, setUsername] = useState(user?.username ?? '');

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const saveM = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await updateMachineUser(user!.userId, { name: name.trim(), description: description.trim() });
      } else {
        await addMachineUser({ orgId, username: username.trim() || name.trim(), name: name.trim(), description: description.trim() });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Service account updated' : 'Service account created');
      qc.invalidateQueries({ queryKey: ['users'] });
      onSaved();
    },
    onError: (e: Error) => toast.error(isEdit ? 'Could not update' : 'Could not create', e.message),
  });

  const canSave = !!name.trim();

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.2s',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          background: 'rgba(18,18,28,0.97)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
          transition: 'transform 0.25s cubic-bezier(.22,.68,0,1.2)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg,rgba(124,92,255,0.3),rgba(192,82,229,0.2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={20} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#fff' }}>
              {isEdit ? 'Edit Service Account' : 'New Service Account'}
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
              Machine user for programmatic access
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)', padding: 6, borderRadius: 8,
            display: 'flex', alignItems: 'center',
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="Name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-service-account"
              autoFocus
            />
          </Field>
          {!isEdit && (
            <Field label="Username" hint="Defaults to name if left empty">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="my-service-account"
              />
            </Field>
          )}
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </Field>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '16px 24px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saveM.isPending} disabled={!canSave} onClick={() => saveM.mutate()}>
            {isEdit ? 'Save Changes' : 'Create Account'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
