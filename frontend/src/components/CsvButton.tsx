export default function CsvButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-primary btn-sm" disabled={disabled} onClick={onClick}>
      <i className="fas fa-download mr-1" />Download CSV
    </button>
  );
}
