interface Props {
  updatedAt: Date | null;
  failed: boolean;
  autoRefresh: boolean;
  onAutoRefreshChange: (on: boolean) => void;
  onRefresh: () => void;
}

/** Connection status, auto-refresh switch and manual refresh button. */
export default function RefreshControls({ updatedAt, failed, autoRefresh, onAutoRefreshChange, onRefresh }: Props) {
  const status = failed ? 'Connection problem'
    : updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-IN')}` : 'Connecting…';
  return (
    <>
      <span className="small text-muted d-flex align-items-center">
        <span className={`status-dot${failed ? ' error' : updatedAt ? ' ok' : ''}`} />{status}
      </span>
      <div className="custom-control custom-switch">
        <input type="checkbox" className="custom-control-input" id="autoRefresh" checked={autoRefresh}
               onChange={(e) => onAutoRefreshChange(e.target.checked)} />
        <label className="custom-control-label small" htmlFor="autoRefresh">Auto-refresh</label>
      </div>
      <button type="button" className="btn btn-sm btn-outline-primary" onClick={onRefresh}>
        <i className="fas fa-sync-alt mr-1" />Refresh
      </button>
    </>
  );
}
