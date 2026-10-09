// Mirrors backend/app/schemas/rejection_codes.py

export const SCOPES = ['Client', 'NIDO'] as const;
export type Scope = (typeof SCOPES)[number];

export interface RejectionCodeIn {
  code: string;     // e.g. "DBAR"; saved upper-case, unique
  name: string;
  reasons: string;  // may be empty
  scope: Scope;
}

export interface RejectionCode extends RejectionCodeIn {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface RejectionCodeList {
  site: string;  // each site has its own list
  sites: string[];
  codes: RejectionCode[];
}
