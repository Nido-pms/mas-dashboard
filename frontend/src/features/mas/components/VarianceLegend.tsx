export default function VarianceLegend() {
  return (
    <span className="small text-muted">
      <span className="text-danger font-weight-bold">Red</span> = below target (positive shortfall).{' '}
      <span className="text-success font-weight-bold">Green</span> = target met (zero or negative).
    </span>
  );
}
