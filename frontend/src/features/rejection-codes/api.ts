import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../api/client';
import type { RejectionCode, RejectionCodeIn, RejectionCodeList, Scope } from './types';

// Each site has its own list; leaving out the site uses the backend's default site.
const url = (id: string) => `/rejection-codes/${encodeURIComponent(id)}`;

export const fetchCodes = (site: string | undefined, signal?: AbortSignal) =>
  apiGet<RejectionCodeList>('/rejection-codes', { site }, signal);

export const addCode = (site: string, c: RejectionCodeIn) => apiPost<RejectionCode>('/rejection-codes', c, { site });

export const updateCode = (site: string, id: string, c: RejectionCodeIn) => apiPut<RejectionCode>(url(id), c, { site });

export const setScope = (site: string, id: string, scope: Scope) =>
  apiPatch<RejectionCode>(`${url(id)}/scope`, { scope }, { site });

export const deleteCode = (site: string, id: string) => apiDelete<{ deleted: string }>(url(id), { site });
