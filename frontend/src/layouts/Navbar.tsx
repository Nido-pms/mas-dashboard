import { Link } from 'react-router-dom';
import { HOME } from '../pages';

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}

export default function Navbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <nav className="main-header navbar navbar-expand navbar-white navbar-light">
      <ul className="navbar-nav">
        <li className="nav-item">
          <a className="nav-link" href="#" role="button" aria-label="Toggle sidebar"
             onClick={(e) => { e.preventDefault(); onToggleSidebar(); }}>
            <i className="fas fa-bars" />
          </a>
        </li>
        <li className="nav-item d-none d-sm-inline-block">
          <Link to={HOME} className="nav-link">Home</Link>
        </li>
      </ul>
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
