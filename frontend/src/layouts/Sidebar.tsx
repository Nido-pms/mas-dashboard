import { Fragment, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { HOME, sections, type NavSection, type PageDef } from '../pages';

function PageLink({ page, sub }: { page: PageDef; sub?: boolean }) {
  return (
    <li className="nav-item">
      <NavLink to={page.path} end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        <i className={`nav-icon fas ${page.icon}${sub ? ' fa-sm' : ''}`} />
        <p>{page.label}</p>
      </NavLink>
    </li>
  );
}

/** One sidebar item that opens to show the section's pages; open while one of them is showing. */
function Dropdown({ section }: { section: NavSection }) {
  const { pathname } = useLocation();
  const current = section.pages.some((p) => p.path === pathname);
  const [open, setOpen] = useState(current);
  useEffect(() => { if (current) setOpen(true); }, [current]);

  return (
    <li className={`nav-item${open ? ' menu-open' : ''}`}>
      <a href="#" className={`nav-link${current ? ' active' : ''}`} aria-expanded={open}
         onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}>
        <i className={`nav-icon fas ${section.icon}`} />
        <p>{section.title}<i className="right fas fa-angle-left" /></p>
      </a>
      {open && (
        <ul className="nav nav-treeview d-block">
          {section.pages.map((p) => <PageLink key={p.path} page={p} sub />)}
        </ul>
      )}
    </li>
  );
}

export default function Sidebar() {
  return (
    <aside className="main-sidebar sidebar-dark-primary elevation-4">
      <Link to={HOME} className="brand-link">
        <img src="/theme/dist/img/logo.png" alt="NIDO" className="brand-image img-circle elevation-3" style={{ opacity: 0.9 }} />
        <span className="brand-text font-weight-light">NIDO WORKZ</span>
      </Link>
      <div className="sidebar">
        <nav className="mt-2">
          <ul className="nav nav-pills nav-sidebar flex-column" role="menu">
            {sections.map((s) => (s.icon ? <Dropdown key={s.title} section={s} /> : (
              <Fragment key={s.title}>
                <li className="nav-header">{s.title.toUpperCase()}</li>
                {s.pages.map((p) => <PageLink key={p.path} page={p} />)}
              </Fragment>
            )))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
