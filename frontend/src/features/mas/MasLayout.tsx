import { Outlet } from 'react-router-dom';
import { MasContext, useMasState } from './MasContext';

/** Wraps the MAS pages so they share filters and data; leaving the section discards them. */
export default function MasLayout() {
  return (
    <MasContext.Provider value={useMasState()}>
      <Outlet />
    </MasContext.Provider>
  );
}
