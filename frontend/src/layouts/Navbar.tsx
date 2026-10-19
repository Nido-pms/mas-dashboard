import { Link } from 'react-router-dom';
import { HOME } from '../pages';

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}

export default function Navbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <nav className="main-header navbar navbar-expand navbar-dark app-header">
      <ul className="navbar-nav">
        <li className="nav-item">
          <a className="nav-link" href="#" role="button" aria-label="Toggle sidebar"
             onClick={(e) => { e.preventDefault(); onToggleSidebar(); }}>
            <i className="fas fa-bars" />
          </a>
        </li>
      </ul>
      <Link to={HOME} className="app-header-title" title="Home">MAS</Link>
      <ul className="navbar-nav ml-auto">
        <li className="nav-item">
          <a className="nav-link" href="#" role="button" aria-label="Full screen"
             onClick={(e) => { e.preventDefault(); toggleFullscreen(); }}>
            <i className="fas fa-expand-arrows-alt" />
          </a>
        </li>
      </ul>
    </nav>
  );
}
