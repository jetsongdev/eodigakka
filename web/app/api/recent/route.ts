import { NextResponse } from 'next/server';
import { cacheLife, cacheTag } from 'next/cache';
import { sql } from 'kysely';

import { db } from '../../../lib/db';

const SIGUNGU_NAME_SQL = sql<string>`
  CASE LEFT(bjd_code, 5)
    WHEN '11110' THEN '종로구'
    WHEN '11140' THEN '중구'
    WHEN '11170' THEN '용산구'
    WHEN '11200' THEN '성동구'
    WHEN '11215' THEN '광진구'
    WHEN '11230' THEN '동대문구'
    WHEN '11260' THEN '중랑구'
    WHEN '11290' THEN '성북구'
    WHEN '11305' THEN '강북구'
    WHEN '11320' THEN '도봉구'
    WHEN '11350' THEN '노원구'
    WHEN '11380' THEN '은평구'
    WHEN '11410' THEN '서대문구'
    WHEN '11440' THEN '마포구'
    WHEN '11470' THEN '양천구'
    WHEN '11500' THEN '강서구'
    WHEN '11530' THEN '구로구'
    WHEN '11545' THEN '금천구'
    WHEN '11560' THEN '영등포구'
    WHEN '11590' THEN '동작구'
    WHEN '11620' THEN '관악구'
    WHEN '11650' THEN '서초구'
    WHEN '11680' THEN '강남구'
    WHEN '11710' THEN '송파구'
    WHEN '11740' THEN '강동구'
    ELSE ''
  END
`;

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
  'use cache: remote';
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
        COALESCE(NULLIF(sigungu, ''), ${SIGUNGU_NAME_SQL}) AS sigungu,
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
