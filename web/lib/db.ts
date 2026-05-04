import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

export interface TxAptTradeTable {
  id: number;
  sigungu_code: string;
  bjd_code: string;
  complex_name: string;
  area_m2: string;
  build_year: number | null;
  floor: number | null;
  price_man: number;
  contract_date: string;
  source: string;
  fetched_at: string;
}

export interface TxAptRentTable {
  id: number;
  sigungu_code: string;
  bjd_code: string;
  complex_name: string;
  area_m2: string;
  build_year: number | null;
  floor: number | null;
  deposit_man: number;
  monthly_man: number;
  contract_date: string;
  source: string;
  fetched_at: string;
}

export interface BjdPolygonTable {
  bjd_code: string;
  bjd_name: string;
  sido: string;
  sigungu: string;
  dong: string;
  geom: unknown;
}

export interface MvDongStatsTable {
  bjd_code: string;
  size_bucket: 'S' | 'M' | 'L';
  mode: 'TRADE' | 'JEONSE';
  tx_count_3m: number;
  unique_complex_3m: number;
  median_man: string;
  p25_man: string;
  p75_man: string;
  last_contract_date: string;
  median_build_year: string | null;
  build_year_stddev: string | null;
  confidence: 'high' | 'low' | 'insufficient';
}

export interface MvJeonseRatioTable {
  bjd_code: string;
  size_bucket: 'S' | 'M' | 'L';
  sale_median: string;
  jeonse_median: string;
  ratio: number | null;
}

export interface EtlJobStatusTable {
  job_name: string;
  last_started_at: string | null;
  last_succeeded_at: string | null;
  mv_refreshed_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export interface Database {
  tx_apt_trade: TxAptTradeTable;
  tx_apt_rent: TxAptRentTable;
  bjd_polygon: BjdPolygonTable;
  mv_dong_stats: MvDongStatsTable;
  mv_jeonse_ratio: MvJeonseRatioTable;
  etl_job_status: EtlJobStatusTable;
}

declare global {
  // eslint-disable-next-line no-var
  var __eodigakkaDb: Kysely<Database> | undefined;
}

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: 10,
      }),
    }),
  });
}

export const db = globalThis.__eodigakkaDb ?? createDb();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__eodigakkaDb = db;
}
