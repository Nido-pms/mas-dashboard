import { useState, type ReactNode } from 'react';

interface Props {
  title: ReactNode;
  icon?: string;
  tools?: ReactNode;
  collapsible?: boolean;
  footer?: ReactNode;
  bodyClassName?: string;
  id?: string;
  children: ReactNode;
}

/** AdminLTE outlined card. */
export default function Card({ title, icon, tools, collapsible, footer, bodyClassName = '', id, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div id={id} className={`card card-primary card-outline${collapsed ? ' collapsed-card' : ''}`}>
      <div className="card-header">
        <h3 className="card-title">{icon && <i className={`fas ${icon} mr-1`} />}{title}</h3>
        {(tools || collapsible) && (
          <div className="card-tools">
            {tools}
            {collapsible && (
              <button type="button" className="btn btn-tool" aria-label={collapsed ? 'Expand' : 'Collapse'}
                      onClick={() => setCollapsed((c) => !c)}>
                <i className={`fas ${collapsed ? 'fa-plus' : 'fa-minus'}`} />
              </button>
            )}
          </div>
        )}
      </div>
      {!collapsed && (
        <>
          <div className={`card-body ${bodyClassName}`}>{children}</div>
          {footer && <div className="card-footer">{footer}</div>}
        </>
      )}
    </div>
  );
}
