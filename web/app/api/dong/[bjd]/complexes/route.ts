import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'kysely';

import { db } from '../../../../../lib/db';
import { buildEvidence } from '../../../../../lib/filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TopComplexRow {
  complex_name: string;
  median_man: number;
  tx_count_3m: number;
  last_contract_date: string;
}

interface RecentTransactionRow {
  mode: 'TRADE' | 'JEONSE';
  complex_name: string;
  area_m2: number;
  amount_man: number;
  monthly_man: number;
  floor: number | null;
  contract_date: string;
}

interface DistributionRow {
  mode: 'TRADE' | 'JEONSE';
  size_bucket: 'S' | 'M' | 'L';
  p25_man: number | null;
  median_man: number | null;
  p75_man: number | null;
  tx_count_3m: number;
  confidence: 'high' | 'low' | 'insufficient';
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ bjd: string }> },
) {
  const { bjd } = await context.params;

  if (!/^\d{10}$/.test(bjd)) {
    return NextResponse.json(
      { error: 'bjd must be a 10-digit legal dong code', evidence: '법정동코드 형식 오류' },
      { status: 400 },
    );
  }

  const [dongNameResult, tradeTopResult, jeonseTopResult, recentResult, distributionResult] = await Promise.all([
    sql<{ bjd_name: string | null }>`
      SELECT bjd_name
      FROM bjd_polygon
      WHERE bjd_code = ${bjd}
    `.execute(db),
    sql<TopComplexRow>`
      SELECT
        complex_name,
        CAST(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_man) AS DOUBLE PRECISION) AS median_man,
        COUNT(*)::int AS tx_count_3m,
        MAX(contract_date)::text AS last_contract_date
      FROM tx_apt_trade
      WHERE bjd_code = ${bjd}
        AND contract_date >= CURRENT_DATE - INTERVAL '3 months'
      GROUP BY complex_name
      ORDER BY median_man DESC, tx_count_3m DESC
      LIMIT 5
    `.execute(db),
    sql<TopComplexRow>`
      SELECT
        complex_name,
        CAST(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY deposit_man) AS DOUBLE PRECISION) AS median_man,
        COUNT(*)::int AS tx_count_3m,
        MAX(contract_date)::text AS last_contract_date
      FROM tx_apt_rent
      WHERE bjd_code = ${bjd}
        AND monthly_man = 0
        AND contract_date >= CURRENT_DATE - INTERVAL '3 months'
      GROUP BY complex_name
      ORDER BY median_man DESC, tx_count_3m DESC
      LIMIT 5
    `.execute(db),
    sql<RecentTransactionRow>`
      SELECT
        'TRADE'::text AS mode,
        complex_name,
        CAST(area_m2 AS DOUBLE PRECISION) AS area_m2,
        price_man AS amount_man,
        0::int AS monthly_man,
        floor,
        contract_date::text AS contract_date
      FROM tx_apt_trade
      WHERE bjd_code = ${bjd}
      UNION ALL
      SELECT
        'JEONSE'::text AS mode,
        complex_name,
        CAST(area_m2 AS DOUBLE PRECISION) AS area_m2,
        deposit_man AS amount_man,
        monthly_man,
        floor,
        contract_date::text AS contract_date
      FROM tx_apt_rent
      WHERE bjd_code = ${bjd}
        AND monthly_man = 0
      ORDER BY contract_date DESC
      LIMIT 10
    `.execute(db),
    sql<DistributionRow>`
      SELECT
        mode,
        size_bucket,
        CAST(p25_man AS DOUBLE PRECISION) AS p25_man,
        CAST(median_man AS DOUBLE PRECISION) AS median_man,
        CAST(p75_man AS DOUBLE PRECISION) AS p75_man,
        tx_count_3m::int AS tx_count_3m,
        confidence
      FROM mv_dong_stats
      WHERE bjd_code = ${bjd}
    `.execute(db),
  ]);

  const bjdName = dongNameResult.rows[0]?.bjd_name;
  if (!bjdName) {
    return NextResponse.json(
      { error: 'dong not found', evidence: 'bjd_polygon 매칭 실패' },
      { status: 404 },
    );
  }

  const lastEvidenceDate =
    recentResult.rows[0]?.contract_date ??
    tradeTopResult.rows[0]?.last_contract_date ??
    jeonseTopResult.rows[0]?.last_contract_date ??
    new Date().toISOString().slice(0, 10);

  return NextResponse.json({
    bjd_code: bjd,
    bjd_name: bjdName,
    trade_top5: tradeTopResult.rows.map((row) => ({
      complex_name: row.complex_name,
      median_man: Math.round(Number(row.median_man)),
      tx_count_3m: row.tx_count_3m,
      evidence: buildEvidence(row.tx_count_3m, 1, row.last_contract_date),
    })),
    jeonse_top5: jeonseTopResult.rows.map((row) => ({
      complex_name: row.complex_name,
      median_man: Math.round(Number(row.median_man)),
      tx_count_3m: row.tx_count_3m,
      evidence: buildEvidence(row.tx_count_3m, 1, row.last_contract_date),
    })),
    recent_transactions: recentResult.rows.map((row) => ({
      mode: row.mode,
      complex_name: row.complex_name,
      area_m2: Number(row.area_m2),
      amount_man: row.amount_man,
      monthly_man: row.monthly_man,
      floor: row.floor,
      contract_date: row.contract_date,
      evidence: `RTMS ${row.contract_date} 신고분`,
    })),
    distributions: distributionResult.rows.map((row) => ({
      mode: row.mode,
      size_bucket: row.size_bucket,
      p25_man: row.p25_man === null ? null : Math.round(Number(row.p25_man)),
      median_man: row.median_man === null ? null : Math.round(Number(row.median_man)),
      p75_man: row.p75_man === null ? null : Math.round(Number(row.p75_man)),
      tx_count_3m: Number(row.tx_count_3m),
      confidence: row.confidence,
    })),
    generated_at: new Date().toISOString(),
    evidence: buildEvidence(recentResult.rows.length, tradeTopResult.rows.length + jeonseTopResult.rows.length, lastEvidenceDate),
  });
}
