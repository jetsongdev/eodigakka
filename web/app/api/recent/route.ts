import { NextResponse } from 'next/server';
import { cacheLife, cacheTag } from 'next/cache';
import { sql } from 'kysely';

import { db } from '../../../lib/db';

interface RecentTxRow {
  mode: 'TRADE' | 'JEONSE';
  contract_date: string;
  bjd_code: string;
  sigungu: string;
  dong: string;
  complex_name: string;
  area_m2: number;
  amount_man: number;
  floor: number | null;
}

interface RecentTxData {
  rows: RecentTxRow[];
  lastContractDate: string | null;
  timing: { recent_ms: number; fresh_ms: number; db_ms: number };
}

async function fetchRecentData(): Promise<RecentTxData> {
  'use cache';
  cacheLife({ revalidate: 3600 });
  cacheTag('mv_dong_stats');

  const t0 = performance.now();
  let tRecent = 0;
  let tFresh = 0;
  const [recent, freshness] = await Promise.all([
    sql<RecentTxRow>`
      SELECT
        mode,
        contract_date::text AS contract_date,
        bjd_code,
        sigungu,
        dong,
        complex_name,
        CAST(area_m2 AS DOUBLE PRECISION) AS area_m2,
        amount_man,
        floor
      FROM (
        SELECT
          'TRADE' AS mode,
          t.id AS sort_id,
          t.contract_date,
          t.bjd_code,
          p.sigungu,
          p.dong,
          t.complex_name,
          t.area_m2,
          t.price_man AS amount_man,
          t.floor
        FROM tx_apt_trade t
        JOIN bjd_polygon p USING (bjd_code)
        UNION ALL
        SELECT
          'JEONSE' AS mode,
          r.id AS sort_id,
          r.contract_date,
          r.bjd_code,
          p.sigungu,
          p.dong,
          r.complex_name,
          r.area_m2,
          r.deposit_man AS amount_man,
          r.floor
        FROM tx_apt_rent r
        JOIN bjd_polygon p USING (bjd_code)
        WHERE r.monthly_man = 0
      ) recent_tx
      ORDER BY contract_date DESC, sort_id DESC
      LIMIT 50
    `.execute(db).then((r) => { tRecent = performance.now() - t0; return r; }),
    sql<{ last_contract_date: string | null }>`
      SELECT GREATEST(
        last_contract_date_trade,
        last_contract_date_rent
      )::text AS last_contract_date
      FROM etl_job_status
      WHERE job_name = 'rtms_phase1'
    `.execute(db).then((r) => { tFresh = performance.now() - t0; return r; }),
  ]);
  const tDb = performance.now() - t0;

  return {
    rows: recent.rows,
    lastContractDate: freshness.rows[0]?.last_contract_date ?? null,
    timing: {
      recent_ms: Number(tRecent.toFixed(1)),
      fresh_ms: Number(tFresh.toFixed(1)),
      db_ms: Number(tDb.toFixed(1)),
    },
  };
}

export async function GET() {
  const { rows, lastContractDate, timing } = await fetchRecentData();

  return NextResponse.json(
    {
      items: rows.map((row) => ({
        mode: row.mode,
        contract_date: row.contract_date,
        bjd_code: row.bjd_code.trim(),
        sigungu: row.sigungu,
        dong: row.dong,
        complex_name: row.complex_name,
        area_m2: Number(row.area_m2),
        amount_man: Number(row.amount_man),
        floor: row.floor,
      })),
      generated_at: new Date().toISOString(),
      data_freshness: lastContractDate
        ? `RTMS ${lastContractDate} 신고분까지`
        : 'RTMS 신고분 없음',
      _timing: timing,
    },
    {
      headers: {
        'Server-Timing': `recent;dur=${timing.recent_ms}, fresh;dur=${timing.fresh_ms}, db;dur=${timing.db_ms}`,
      },
    },
  );
}
