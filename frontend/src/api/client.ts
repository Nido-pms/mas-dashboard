export class ApiError extends Error {}

export const isAbortError = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

type Params = Record<string, string | number | null | undefined>;

async function errorDetail(res: Response) {
  try {
    const { detail } = await res.json();
    if (Array.isArray(detail)) {
      return 'Invalid input: ' + detail.map((d: { loc: unknown[]; msg: string }) => `${d.loc.at(-1)} (${d.msg})`).join(', ');
    }
    if (typeof detail === 'string') return detail;
  } catch {
    // not a JSON error body
  }
  return `Server error (${res.status})`;
}

/** Call /api{path}; empty params are left out. Throws ApiError with a user-readable message. */
async function request<T>(method: string, path: string, params: Params, body?: unknown, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const query = qs.toString();
  let res: Response;
  try {
    res = await fetch(`/api${path}${query ? `?${query}` : ''}`, {
      method, signal,
      ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw new ApiError('Cannot reach the server. Check that it is running.');
  }
  if (!res.ok) throw new ApiError(await errorDetail(res));
  return res.json() as Promise<T>;
}

export const apiGet = <T>(path: string, params: Params = {}, signal?: AbortSignal) =>
  request<T>('GET', path, params, undefined, signal);

export const apiPut = <T>(path: string, body: unknown, params: Params = {}) =>
  request<T>('PUT', path, params, body);

export const apiPost = <T>(path: string, body: unknown, params: Params = {}) =>
  request<T>('POST', path, params, body);

export const apiPatch = <T>(path: string, body: unknown, params: Params = {}) =>
  request<T>('PATCH', path, params, body);

export const apiDelete =<T>(path: string, params: Params = {}) =>
  request<T>('DELETE', path, params);
