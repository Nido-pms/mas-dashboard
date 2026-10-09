import type { ReactNode } from 'react';

interface Props {
  note: ReactNode;
  dirty: boolean;
  canSave: boolean;
  saving: boolean;
  label: string;  // e.g. "Save shifts"
  onDiscard: () => void;
  onSave: () => void;
}

/** Card footer of a configuration section: a note, Discard changes and Save. */
export default function SaveBar({ note, dirty, canSave, saving, label, onDiscard, onSave }: Props) {
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: '.5rem' }}>
      <span className="small text-muted">{note}</span>
      <span>
        <button type="button" className="btn btn-default mr-2" disabled={!dirty || saving} onClick={onDiscard}>
          Discard changes
        </button>
        <button type="button" className="btn btn-primary" disabled={!canSave} onClick={onSave}>
          <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'} mr-1`} />{label}
        </button>
      </span>
    </div>
  );
}
