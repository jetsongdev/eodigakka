import { parseAffordableQuery } from './filter';
import type { QueryMode, SizeBucket } from './filter';

export type SizeOption = SizeBucket | 'all';

export interface AffordableQueryState {
  mode: QueryMode;
  cashMin: number;
  cashMax: number;
  size: SizeOption;
}

export const DEFAULT_QUERY: AffordableQueryState = {
  mode: 'trade',
  cashMin: 40000,
  cashMax: 80000,
  size: 'M',
};

export function hasAffordableQueryParams(params: URLSearchParams): boolean {
  return ['mode', 'cash_min', 'cash_max', 'size'].some((key) => params.has(key));
}

export function parseAffordableQueryState(params: URLSearchParams): AffordableQueryState {
  if (!hasAffordableQueryParams(params)) {
    return DEFAULT_QUERY;
  }
  try {
    const parsed = parseAffordableQuery(params, {
      mode: DEFAULT_QUERY.mode,
      cashMin: DEFAULT_QUERY.cashMin,
      cashMax: DEFAULT_QUERY.cashMax,
      size: DEFAULT_QUERY.size,
    });
    return {
      mode: parsed.mode,
      cashMin: parsed.cashMin,
      cashMax: parsed.cashMax,
      size: parsed.size,
    };
  } catch {
    return DEFAULT_QUERY;
  }
}

export function buildAffordableQueryString(query: AffordableQueryState): string {
  const params = new URLSearchParams();
  params.set('mode', query.mode);
  params.set('cash_min', String(query.cashMin));
  params.set('cash_max', String(query.cashMax));
  params.set('size', query.size);
  return params.toString();
}

export function isSameAffordableQuery(a: AffordableQueryState, b: AffordableQueryState): boolean {
  return (
    a.mode === b.mode &&
    a.cashMin === b.cashMin &&
    a.cashMax === b.cashMax &&
    a.size === b.size
  );
}
