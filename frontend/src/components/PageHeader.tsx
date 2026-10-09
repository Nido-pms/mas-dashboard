import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="content-header">
      <div className="container-fluid">
        <div className="row mb-2 align-items-center">
          <div className="col-sm-6">
            <h1 className="m-0">{title}</h1>
            {subtitle && <small className="text-muted">{subtitle}</small>}
          </div>
          <div className="col-sm-6 d-flex justify-content-sm-end align-items-center flex-wrap page-actions mt-2 mt-sm-0">
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
