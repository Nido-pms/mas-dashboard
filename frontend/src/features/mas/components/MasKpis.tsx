import InfoBox from '../../../components/InfoBox';
import { fmt } from '../../../utils/format';
import type { KpiTotals } from '../types';

export default function MasKpis({ totals: t }: { totals: KpiTotals }) {
  const tiles = [
    { label: 'Total target', value: fmt(t.target), icon: 'fa-bullseye', color: 'bg-info' },
    { label: 'Total induction', value: fmt(t.induction), icon: 'fa-box', color: 'bg-primary' },
    { label: 'Achievement', value: `${t.achievement}%`, sub: 'of target', icon: 'fa-chart-line',
      color: t.achievement >= 100 ? 'bg-success' : 'bg-warning' },
    { label: 'Short of target', value: fmt(Math.max(t.shortfall, 0)),
      sub: t.shortfall < 0 ? `exceeded by ${fmt(-t.shortfall)}` : 'targeted − inducted',
      icon: 'fa-arrow-down', color: t.shortfall > 0 ? 'bg-danger' : 'bg-success' },
    { label: 'Total reject', value: fmt(t.rejected),
      sub: t.induction ? `${Math.round((t.rejected * 100) / t.induction)}% of induction` : '', icon: 'fa-ban', color: 'bg-danger' },
  ];
  return (
    <div className="kpi-grid">
      {tiles.map((k) => <InfoBox key={k.label} {...k} />)}
    </div>
  );
}
