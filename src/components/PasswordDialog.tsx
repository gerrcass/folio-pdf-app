import { Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PasswordReason } from '../pdf/document';
import { Modal } from './Modal';

interface PasswordDialogProps {
  open: boolean;
  reason: PasswordReason;
  documentName: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordDialog({
  open,
  reason,
  documentName,
  onSubmit,
  onCancel,
}: PasswordDialogProps) {
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    const timer = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, [open, reason]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="This PDF is locked"
      subtitle={documentName}
      closeLabel="Cancel opening this PDF"
      footer={
        <>
          <button className="button ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="button primary" type="submit" form="password-form" disabled={!password}>
            <Lock size={14} />
            Unlock PDF
          </button>
        </>
      }
    >
      <form
        id="password-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (password) onSubmit(password);
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div className="field">
          <label htmlFor="pdf-password">Document password</label>
          <input
            ref={inputRef}
            id="pdf-password"
            className="input"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="password-help"
            aria-invalid={reason === 'incorrect'}
          />
        </div>
        {reason === 'incorrect' ? (
          <p className="password-error" role="alert">
            That password was not accepted. Check it and try again.
          </p>
        ) : null}
        <p className="hint" id="password-help">
          The password is used only in memory to open this document. Folio does not store it and never sends the
          PDF anywhere.
        </p>
      </form>
    </Modal>
  );
}
