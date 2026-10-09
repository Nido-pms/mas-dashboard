import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Footer from './Footer';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

const DESKTOP = window.matchMedia('(min-width: 992px)');

/** AdminLTE page shell: navbar, sidebar, content and footer. */
export default function AdminLayout() {
  const [desktop, setDesktop] = useState(DESKTOP.matches);
  const [collapsed, setCollapsed] = useState(false);   // desktop: icon-only sidebar
  const [mobileOpen, setMobileOpen] = useState(false); // below 992px: sidebar slid in over the content
  const { pathname } = useLocation();

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    const onChange = () => { setDesktop(DESKTOP.matches); setMobileOpen(false); };
    DESKTOP.addEventListener('change', onChange);
    return () => DESKTOP.removeEventListener('change', onChange);
  }, []);

  // AdminLTE drives the sidebar through classes on <body>. Below 992px the sidebar stays
  // collapsed (icons only on tablets, hidden on phones) unless opened.
  useEffect(() => {
    document.body.classList.toggle('sidebar-collapse', desktop ? collapsed : !mobileOpen);
    document.body.classList.toggle('sidebar-open', !desktop && mobileOpen);
  }, [desktop, collapsed, mobileOpen]);

  const toggleSidebar = () => (desktop ? setCollapsed((c) => !c) : setMobileOpen((o) => !o));

  return (
    <div className="wrapper">
      <Navbar onToggleSidebar={toggleSidebar} />
      <Sidebar />
      <div className="content-wrapper">
        <Outlet />
      </div>
      <Footer />
      <div id="sidebar-overlay" onClick={() => setMobileOpen(false)} />
    </div>
  );
}
