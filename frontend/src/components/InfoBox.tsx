import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: string;   // Font Awesome class
  color: string;  // AdminLTE background class, e.g. "bg-info"
}

export default function InfoBox({ label, value, sub, icon, color }: Props) {
  return (
    <div className="info-box">
      <span className={`info-box-icon ${color} elevation-1`}><i className={`fas ${icon}`} /></span>
      <div className="info-box-content">
        <span className="info-box-text">{label}</span>
        <span className="info-box-number">{value}</span>
        <span className="info-box-sub">{sub}</span>
      </div>
    </div>
  );
}
