import { NextResponse } from 'next/server';
import { sql } from 'kysely';

import { db } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CountRow {
  trade_count: string | number;
  rent_count: string | number;
}

interface EtlStatusRow {
  last_succeeded_at: string | null;
  mv_refreshed_at: string | null;
  last_error: string | null;
}

export async function GET() {
  const [countsResult, statusTableResult] = await Promise.all([
    sql<CountRow>`
      SELECT
        (SELECT COUNT(*) FROM tx_apt_trade) AS trade_count,
        (SELECT COUNT(*) FROM tx_apt_rent) AS rent_count
    `.execute(db),
    sql<{ exists: boolean }>`
      SELECT to_regclass('public.etl_job_status') IS NOT NULL AS exists
    `.execute(db),
  ]);

  let status: EtlStatusRow = {
    last_succeeded_at: null,
    mv_refreshed_at: null,
    last_error: null,
  };

  if (statusTableResult.rows[0]?.exists) {
    const statusResult = await sql<EtlStatusRow>`
      SELECT last_succeeded_at::text, mv_refreshed_at::text, last_error
      FROM etl_job_status
      WHERE job_name = 'rtms_phase1'
    `.execute(db);
    status = statusResult.rows[0] ?? status;
  }

  const counts = countsResult.rows[0];

  return NextResponse.json({
    etl_last_succeeded_at: status.last_succeeded_at,
    raw_counts: {
      tx_apt_trade: Number(counts?.trade_count ?? 0),
      tx_apt_rent: Number(counts?.rent_count ?? 0),
    },
    mv_refreshed_at: status.mv_refreshed_at,
    etl_disabled: process.env.ETL_DISABLED === '1',
    last_error: status.last_error,
    generated_at: new Date().toISOString(),
    evidence: `trade ${Number(counts?.trade_count ?? 0)}건, rent ${Number(counts?.rent_count ?? 0)}건 기준`,
  });
}
