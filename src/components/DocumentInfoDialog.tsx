import { FileText, ShieldAlert } from 'lucide-react';
import type { Annotation } from '../annotations/types';
import type { DigitalSignatureInfo, PdfMetadata } from '../pdf/document';
import { formatBytes } from '../lib/utils';
import { Modal } from './Modal';

interface DocumentInfoDialogProps {
  open: boolean;
  onClose: () => void;
  name: string;
  title: string;
  metadata: PdfMetadata;
  pageCount: number;
  size: number;
  fingerprint: string;
  protectedDocument: boolean;
  annotations: Annotation[];
  digitalSignatures: DigitalSignatureInfo[];
  signatureStatus: 'checking' | 'none' | 'present' | 'unavailable';
}

function parsePdfDate(value?: string): string {
  if (!value) return '—';
  const match = value.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
  if (!match) return value;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour ?? 0),
    Number(minute ?? 0),
    Number(second ?? 0),
  );
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function DocumentInfoDialog({
  open,
  onClose,
  name,
  title,
  metadata,
  pageCount,
  size,
  fingerprint,
  protectedDocument,
  annotations,
  digitalSignatures,
  signatureStatus,
}: DocumentInfoDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Document information"
      subtitle={title}
      className="wide"
      footer={
        <button className="button" type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <FileText size={17} style={{ color: 'var(--ink-3)' }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 560, overflowWrap: 'anywhere' }}>{name}</div>
          <div className="hint">
            {pageCount} {pageCount === 1 ? 'page' : 'pages'} · {formatBytes(size)} ·{' '}
            {protectedDocument ? 'Password-protected' : 'No password'} · {annotations.length} annotations
          </div>
        </div>
      </div>

      <dl className="info-list">
        <dt>Title</dt>
        <dd>{metadata.title || title}</dd>
        <dt>Author</dt>
        <dd>{metadata.author || '—'}</dd>
        <dt>Subject</dt>
        <dd>{metadata.subject || '—'}</dd>
        <dt>Keywords</dt>
        <dd>{metadata.keywords || '—'}</dd>
        <dt>Creator</dt>
        <dd>{metadata.creator || '—'}</dd>
        <dt>Producer</dt>
        <dd>{metadata.producer || '—'}</dd>
        <dt>PDF version</dt>
        <dd>{metadata.pdfVersion || '—'}</dd>
        <dt>Created</dt>
        <dd>{parsePdfDate(metadata.creationDate)}</dd>
        <dt>Modified</dt>
        <dd>{parsePdfDate(metadata.modificationDate)}</dd>
        <dt>Fingerprint</dt>
        <dd style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5 }}>
          {fingerprint ? `${fingerprint.slice(0, 24)}…` : '—'}
        </dd>
      </dl>

      <div className={`notice ${digitalSignatures.length > 0 ? 'warn' : ''}`}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ShieldAlert size={15} style={{ flex: '0 0 auto', marginTop: 1 }} />
          <div>
            {signatureStatus === 'checking' ? (
              <>Checking for digital signatures…</>
            ) : signatureStatus === 'unavailable' ? (
              <>
                <strong>Folio could not check for digital signatures.</strong> Editing or exporting may affect a
                signature that could not be detected. This is not a statement that the document is unsigned.
              </>
            ) : digitalSignatures.length > 0 ? (
              <>
                <strong>
                  {digitalSignatures.length} digital signature
                  {digitalSignatures.length === 1 ? '' : 's'} detected.
                </strong>{' '}
                Editing or exporting this document may affect the validity of those signatures. Folio does not
                verify certificate identity or signature integrity.
                <ul style={{ margin: '6px 0 0', paddingLeft: 17 }}>
                  {digitalSignatures.slice(0, 4).map((signature) => (
                    <li key={signature.id}>
                      {signature.fieldName || 'Signature field'}
                      {signature.signerName ? ` — ${signature.signerName}` : ''}
                      {signature.signingTime ? `, ${signature.signingTime}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <strong>No digital signatures detected.</strong> Adding a visual signature does not create a
                cryptographic signature. It is an image stamp placed with your approval.
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
