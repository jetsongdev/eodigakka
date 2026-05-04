export type QueryMode = 'trade' | 'jeonse';
export type StatsMode = 'TRADE' | 'JEONSE';
export type SizeBucket = 'S' | 'M' | 'L';
export type Confidence = 'high' | 'low' | 'insufficient';
export type DongColor =
  | 'deep_green'
  | 'light_green'
  | 'deep_green_low'
  | 'yellow'
  | 'red'
  | 'grey';

export interface AffordableQuery {
  mode: QueryMode;
  cashMin: number;
  cashMax: number;
  size: SizeBucket | 'all';
  loanFilter: string | null;
}

export interface DongStatInput {
  bjdCode: string;
  bjdName: string;
  sizeBucket: SizeBucket;
  mode: StatsMode;
  txCount3m: number;
  uniqueComplex3m: number;
  medianMan: number;
  p25Man: number | null;
  p75Man: number | null;
  lastContractDate: string;
  confidence: Confidence;
  jeonseRatio: number | null;
  medianBuildYear: number | null;
  buildYearStddev: number | null;
}

export interface AffordableDong extends DongStatInput {
  color: DongColor;
  evidence: string;
}

function parseIntegerParam(
  value: string | null,
  fallback: number,
  name: string,
): number {
  if (value === null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}`);
  }
  return parsed;
}

export function parseAffordableQuery(params: URLSearchParams): AffordableQuery {
  const modeParam = (params.get('mode') ?? 'trade').toLowerCase();
  if (modeParam !== 'trade' && modeParam !== 'jeonse') {
    throw new Error('mode must be trade or jeonse');
  }

  const sizeParam = (params.get('size') ?? 'all').toUpperCase();
  if (sizeParam !== 'ALL' && sizeParam !== 'S' && sizeParam !== 'M' && sizeParam !== 'L') {
    throw new Error('size must be S, M, L, or all');
  }

  const cashMin = parseIntegerParam(params.get('cash_min'), 40000, 'cash_min');
  const cashMax = parseIntegerParam(params.get('cash_max'), 80000, 'cash_max');
  if (cashMin > cashMax) {
    throw new Error('cash_min must be less than or equal to cash_max');
  }

  return {
    mode: modeParam,
    cashMin,
    cashMax,
    size: sizeParam === 'ALL' ? 'all' : (sizeParam as SizeBucket),
    loanFilter: params.get('loan_filter'),
  };
}

export function computeIqrRatio(p25Man: number | null, p75Man: number | null): number | null {
  if (p25Man === null || p75Man === null || p25Man <= 0) {
    return null;
  }
  return p75Man / p25Man;
}

export function buildEvidence(txCount3m: number, uniqueComplex3m: number, lastContractDate: string): string {
  const end = new Date(lastContractDate);
  if (Number.isNaN(end.getTime())) {
    return `최근 3개월 ${txCount3m}건, 단지 ${uniqueComplex3m}개, RTMS 최근 신고분`;
  }
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 2, 1));
  const startMonth = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  const endMonth = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`;
  return `최근 3개월 ${txCount3m}건, 단지 ${uniqueComplex3m}개, RTMS ${startMonth}~${endMonth}`;
}

function isWithinCashRange(dong: DongStatInput, query: AffordableQuery): boolean {
  return dong.medianMan >= query.cashMin && dong.medianMan <= query.cashMax;
}

function hasMinimumComplexDiversity(dong: DongStatInput): boolean {
  return dong.uniqueComplex3m >= 2;
}

export function evaluateAffordableDong(
  dong: DongStatInput,
  query: AffordableQuery,
): AffordableDong | null {
  if (!isWithinCashRange(dong, query)) {
    return null;
  }

  if (!hasMinimumComplexDiversity(dong)) {
    return null;
  }

  const iqrRatio = computeIqrRatio(dong.p25Man, dong.p75Man);
  const iqrViolation = iqrRatio !== null && iqrRatio >= 1.5;

  let color: DongColor;
  if (dong.confidence === 'insufficient') {
    color = 'grey';
  } else if (dong.mode === 'JEONSE' && dong.jeonseRatio !== null && dong.jeonseRatio >= 0.8) {
    color = 'red';
  } else if (iqrViolation) {
    color = 'yellow';
  } else if (dong.confidence === 'low') {
    color = 'deep_green_low';
  } else if (iqrRatio === null) {
    color = 'light_green';
  } else {
    color = 'deep_green';
  }

  if (dong.mode === 'JEONSE' && dong.jeonseRatio === null && dong.confidence !== 'insufficient') {
    return null;
  }

  return {
    ...dong,
    color,
    evidence: buildEvidence(dong.txCount3m, dong.uniqueComplex3m, dong.lastContractDate),
  };
}
