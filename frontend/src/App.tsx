import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import { HOME, sections } from './pages';

export default function App() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        {sections.map((s) => (
          <Route key={s.title} element={s.layout}>
            {s.pages.map((p) => <Route key={p.path} path={p.path} element={p.element} />)}
          </Route>
        ))}
        <Route path="*" element={<Navigate to={HOME} replace />} />
      </Route>
    </Routes>
  );
}
