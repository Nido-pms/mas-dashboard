export default function ErrorAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="alert alert-danger d-flex justify-content-between align-items-center flex-wrap">
      <span><i className="icon fas fa-ban" />{message}</span>
      <button type="button" className="btn btn-sm btn-light" onClick={onRetry}>Try again</button>
    </div>
  );
}
