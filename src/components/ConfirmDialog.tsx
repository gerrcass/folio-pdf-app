import { AlertTriangle, FileWarning } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="button ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className={`button ${danger ? 'danger' : 'primary'}`} type="button" onClick={onConfirm}>
            {danger ? <AlertTriangle size={14} /> : <FileWarning size={14} />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-2)' }}>{message}</p>
    </Modal>
  );
}
