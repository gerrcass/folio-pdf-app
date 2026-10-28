import { FileText, X } from 'lucide-react';

interface OpeningOverlayProps {
  name: string;
  stage: string;
  progress?: number;
  onCancel: () => void;
}

export function OpeningOverlay({ name, stage, progress, onCancel }: OpeningOverlayProps) {
  return (
    <div className="opening-overlay" role="status" aria-live="polite">
      <div className="opening-card">
        <div className="opening-icon">
          <FileText size={19} />
        </div>
        <div className="opening-copy">
          <div className="opening-name" title={name}>
            {name}
          </div>
          <div className="opening-stage">
            <span className="spinner" />
            {stage}
          </div>
          {typeof progress === 'number' ? (
            <div className="progress" style={{ marginTop: 8 }}>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          ) : null}
        </div>
        <button className="icon-button" onClick={onCancel} aria-label="Cancel opening" type="button">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
