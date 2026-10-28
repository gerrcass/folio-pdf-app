import {
  Camera,
  Check,
  Image as ImageIcon,
  Keyboard,
  PenLine,
  ShieldAlert,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { loadRememberedSignature, forgetRememberedSignature } from '../../storage';
import type { RememberedSignature } from '../../storage';
import {
  drawVideoFrame,
  stopMediaStream,
  trimSignatureImage,
  typedSignature,
} from '../../signatures/image';
import { SignaturePad, type SignaturePadHandle } from '../../signatures/SignaturePad';
import { Modal } from '../../components/Modal';

type Tab = 'draw' | 'type' | 'upload' | 'camera' | 'saved';

interface SignatureDialogProps {
  open: boolean;
  onClose: () => void;
  onUse: (dataUrl: string, remember: boolean, sourceLabel: string) => void;
  hasDigitalSignatures: boolean;
  protectedDocument: boolean;
  signatureTargetCount: number;
  suggestionsSuppressed: boolean;
}

export function SignatureDialog({
  open,
  onClose,
  onUse,
  hasDigitalSignatures,
  protectedDocument,
  signatureTargetCount,
  suggestionsSuppressed,
}: SignatureDialogProps) {
  const [tab, setTab] = useState<Tab>('draw');
  const [typed, setTyped] = useState('');
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [cameraPreview, setCameraPreview] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [saved, setSaved] = useState<RememberedSignature | null>(null);
  const [confirmForget, setConfirmForget] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotice(null);
    setBusy(false);
    setRemember(false);
    setConfirmForget(false);
    setTyped('');
    setUploadPreview(null);
    setUploadName('');
    setCameraPreview(null);
    setCameraError(null);
    padRef.current?.clear();
    let active = true;
    void loadRememberedSignature().then((signature) => {
      if (!active) return;
      setSaved(signature);
      setTab(signature ? 'saved' : 'draw');
    });
    return () => {
      active = false;
      stopMediaStream(cameraStream);
      setCameraStream(null);
    };
    // The dialog resets once per open; cameraStream is intentionally not a reset trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopCamera = () => {
    stopMediaStream(cameraStream);
    setCameraStream(null);
    setCameraReady(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!cameraStream) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = cameraStream;
    void video.play().catch(() => setCameraError('The camera preview could not start.'));
    return () => {
      if (video.srcObject === cameraStream) video.srcObject = null;
    };
  }, [cameraStream, tab]);

  useEffect(() => {
    if (tab !== 'camera' && cameraStream) {
      stopMediaStream(cameraStream);
      setCameraStream(null);
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  }, [tab, cameraStream]);

  useEffect(() => {
    return () => stopMediaStream(cameraStream);
  }, [cameraStream]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setCameraReady(false);
      setCameraStream(stream);
    } catch (caught) {
      setCameraError(
        caught instanceof Error
          ? caught.name === 'NotAllowedError'
            ? 'Camera access was denied. You can draw, type, or upload instead.'
            : `Camera unavailable: ${caught.message}`
          : 'Camera unavailable. You can draw, type, or upload instead.',
      );
    }
  };

  const captureCamera = async () => {
    const video = videoRef.current;
    if (!video || !cameraReady) {
      setCameraError('Wait for the camera preview, then capture your signature.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const raw = drawVideoFrame(video);
      const trimmed = await trimSignatureImage(raw);
      setCameraPreview(trimmed);
      setNotice('Photo captured. Nothing is added to the PDF until you approve placement.');
      stopCamera();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The camera frame could not be processed.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = (file: File) => {
    setError(null);
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Choose a PNG or JPEG image of your signature.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('Choose an image smaller than 12 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setUploadPreview(typeof reader.result === 'string' ? reader.result : null);
      setUploadName(file.name);
    };
    reader.onerror = () => setError('That image could not be read.');
    reader.readAsDataURL(file);
  };

  const prepareSignature = async () => {
    setError(null);
    setBusy(true);
    try {
      let dataUrl: string | null = null;
      let source = 'drawn';
      let shouldRemember = remember;
      if (tab === 'saved' && saved) {
        dataUrl = saved.dataUrl;
        source = 'saved';
        shouldRemember = false;
      } else if (tab === 'draw') {
        const raw = padRef.current?.toDataURL();
        if (!raw) throw new Error('Draw a signature first.');
        dataUrl = await trimSignatureImage(raw);
        source = 'drawn';
      } else if (tab === 'type') {
        dataUrl = await typedSignature(typed);
        source = 'typed';
      } else if (tab === 'upload') {
        if (!uploadPreview) throw new Error('Choose a signature image first.');
        dataUrl = await trimSignatureImage(uploadPreview);
        source = 'uploaded';
      } else if (tab === 'camera') {
        if (!cameraPreview) throw new Error('Capture a signature first.');
        dataUrl = await trimSignatureImage(cameraPreview);
        source = 'camera';
      }
      if (!dataUrl) throw new Error('Create a signature first.');
      stopCamera();
      onUse(dataUrl, shouldRemember, source);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The signature could not be prepared.');
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <>
      <span className="hint" style={{ marginRight: 'auto', maxWidth: 360 }}>
        Next you will preview the signature on the page. Nothing is added until you click “Approve and add
        signature”.
      </span>
      <button className="button ghost" type="button" onClick={onClose}>
        Cancel
      </button>
      <button className="button primary" type="button" onClick={() => void prepareSignature()} disabled={busy}>
        {busy ? <span className="spinner" /> : <Check size={14} />}
        Continue to placement
      </button>
    </>
  );

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; hidden?: boolean }> = [
    { id: 'draw', label: 'Draw', icon: <PenLine size={13} /> },
    { id: 'type', label: 'Type', icon: <Keyboard size={13} /> },
    { id: 'upload', label: 'Upload', icon: <Upload size={13} /> },
    { id: 'camera', label: 'Camera', icon: <Camera size={13} />, hidden: !cameraSupported },
    { id: 'saved', label: 'Saved', icon: <ImageIcon size={13} />, hidden: !saved },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a visual signature"
      subtitle={
        suggestionsSuppressed
          ? 'Field suggestions are suppressed because this PDF already has digital signatures.'
          : signatureTargetCount > 0
            ? `We found ${signatureTargetCount} possible signature ${signatureTargetCount === 1 ? 'field' : 'fields'} on this page.`
            : 'No signature field was detected on this page. You can place the signature manually.'
      }
      className="signature-modal"
      footer={footer}
    >
      {hasDigitalSignatures ? (
        <div className="notice warn signature-warning">
          <ShieldAlert size={16} style={{ flex: '0 0 auto', marginTop: 1 }} />
          <div>
            This PDF contains one or more digital signatures. Adding a visual signature does not create a digital
            certificate, and exporting an edited copy may affect the validity of existing signatures. Folio cannot
            verify those signatures.
          </div>
        </div>
      ) : null}

      {protectedDocument ? (
        <div className="notice">
          This document is password-protected. You can read it, but Folio cannot export an annotated copy without an
          unprotected version.
        </div>
      ) : null}

      <div className="signature-layout">
        <div className="signature-tabs" role="tablist" aria-label="Signature method">
          {tabs
            .filter((entry) => !entry.hidden)
            .map((entry) => (
              <button
                key={entry.id}
                className={`signature-tab ${tab === entry.id ? 'active' : ''}`}
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => {
                  setError(null);
                  setTab(entry.id);
                }}
                type="button"
              >
                {entry.icon}
                {entry.label}
              </button>
            ))}
        </div>

        {tab === 'draw' ? (
          <>
            <div className="signature-stage" style={{ minHeight: 218 }}>
              <SignaturePad ref={padRef} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="button sm"
                type="button"
                onClick={() => {
                  padRef.current?.undo();
                  setError(null);
                }}
              >
                <Undo2 size={13} />
                Undo stroke
              </button>
              <button
                className="button sm ghost"
                type="button"
                onClick={() => {
                  padRef.current?.clear();
                  setError(null);
                }}
              >
                <Trash2 size={13} />
                Clear
              </button>
              <span className="hint" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
                Draw with a mouse, trackpad, or pen.
              </span>
            </div>
          </>
        ) : null}

        {tab === 'type' ? (
          <div className="signature-stage" style={{ minHeight: 190 }}>
            <input
              className="signature-name-input"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setError(null);
              }}
              placeholder="Type your name"
              aria-label="Typed signature text"
              maxLength={80}
              autoFocus
            />
          </div>
        ) : null}

        {tab === 'upload' ? (
          <div className="signature-stage" style={{ minHeight: 218 }}>
            {uploadPreview ? (
              <img className="signature-preview-image" src={uploadPreview} alt="Uploaded signature preview" />
            ) : (
              <div className="upload-drop">
                <ImageIcon size={26} />
                <span>Choose a PNG or JPEG of your signature.</span>
                <button className="button sm" type="button" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={13} />
                  Choose image
                </button>
                <span className="hint">A photo on plain paper works; Folio removes near-white background.</span>
              </div>
            )}
            {uploadPreview ? (
              <div style={{ position: 'absolute', bottom: 10, display: 'flex', gap: 6 }}>
                <button className="button sm" type="button" onClick={() => fileInputRef.current?.click()}>
                  Replace image
                </button>
                <button
                  className="button sm ghost"
                  type="button"
                  onClick={() => {
                    setUploadPreview(null);
                    setUploadName('');
                  }}
                >
                  Remove
                </button>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="signature-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleUpload(file);
                event.target.value = '';
              }}
              aria-label="Upload signature image"
            />
            {uploadName ? <span className="sr-only">Selected file {uploadName}</span> : null}
          </div>
        ) : null}

        {tab === 'camera' ? (
          <div className="signature-stage" style={{ minHeight: 250, padding: 0 }}>
            <div className="camera-stage">
              {cameraPreview ? (
                <>
                  <img className="signature-preview-image" src={cameraPreview} alt="Captured signature preview" />
                  <div className="camera-actions">
                    <button
                      className="button sm"
                      type="button"
                      onClick={() => {
                        setCameraPreview(null);
                        void startCamera();
                      }}
                    >
                      <Camera size={13} />
                      Retake
                    </button>
                  </div>
                </>
              ) : cameraStream ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    aria-label="Camera preview"
                    onCanPlay={() => setCameraReady(true)}
                  />
                  <div className="camera-actions">
                    <button
                      className="button sm primary"
                      type="button"
                      onClick={() => void captureCamera()}
                      disabled={busy || !cameraReady}
                    >
                      <Camera size={13} />
                      Capture
                    </button>
                    <button className="button sm" type="button" onClick={stopCamera}>
                      Stop
                    </button>
                  </div>
                </>
              ) : (
                <div className="camera-placeholder">
                  <Camera size={26} style={{ marginBottom: 8 }} />
                  <div>Photograph a signature on plain paper.</div>
                  <div style={{ marginTop: 4 }}>The camera is used only while this tab is open.</div>
                  <button className="button sm" type="button" style={{ marginTop: 12 }} onClick={() => void startCamera()}>
                    Start camera
                  </button>
                </div>
              )}
            </div>
            {cameraError ? <div className="notice warn" style={{ margin: 12 }}>{cameraError}</div> : null}
          </div>
        ) : null}

        {tab === 'saved' && saved ? (
          <div className="signature-stage" style={{ minHeight: 218 }}>
            <img className="signature-preview-image" src={saved.dataUrl} alt="Saved signature preview" />
          </div>
        ) : null}

        {error ? <div className="notice warn">{error}</div> : null}
        {notice ? <div className="notice info">{notice}</div> : null}

        {tab !== 'saved' ? (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>
              <strong>Remember this signature after I approve placement.</strong> It will be stored locally in
              IndexedDB and is not encrypted. This is off by default and never saved before approval.
            </span>
          </label>
        ) : (
          <div className="signature-saved-row">
            <img src={saved?.dataUrl} alt="" />
            <div className="grow">
              <strong>Saved signature</strong>
              <div className="hint">Stored locally in IndexedDB, unencrypted.</div>
            </div>
            {confirmForget ? (
              <>
                <button
                  className="button sm ghost"
                  type="button"
                  onClick={() => {
                    setConfirmForget(false);
                    setSaved(null);
                    setNotice('Saved signature removed from this device.');
                    void forgetRememberedSignature();
                    setTab('draw');
                  }}
                >
                  Forget
                </button>
                <button className="button sm" type="button" onClick={() => setConfirmForget(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button
                className="button sm ghost"
                type="button"
                onClick={() => setConfirmForget(true)}
                aria-label="Forget saved signature"
              >
                <Trash2 size={13} />
                Forget saved signature
              </button>
            )}
          </div>
        )}

        <div className="signature-footer-note">
          <ShieldAlert size={13} style={{ flex: '0 0 auto', marginTop: 1 }} />
          A visual signature is a picture of your signature, not a cryptographic digital certificate. Folio does
          not verify identity and cannot prove the document was not changed later.
        </div>
      </div>
    </Modal>
  );
}
