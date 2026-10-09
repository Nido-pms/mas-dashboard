import { useEffect, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Bootstrap modal asking the user to confirm an action; Escape or the backdrop cancels. */
export default function ConfirmDialog({ title, children, confirmLabel, danger, busy, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <>
      <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="confirmTitle"
           onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="confirmTitle">{title}</h5>
              <button type="button" className="close" aria-label="Close" disabled={busy} onClick={onCancel}><span>&times;</span></button>
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer">
              <button type="button" className="btn btn-default" disabled={busy} onClick={onCancel}>Cancel</button>
              <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy} autoFocus
                      onClick={onConfirm}>
                {busy && <i className="fas fa-spinner fa-spin mr-1" />}{confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
}
