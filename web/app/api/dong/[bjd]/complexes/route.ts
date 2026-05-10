import { NextRequest, NextResponse } from 'next/server';
import { cacheLife, cacheTag } from 'next/cache';
import { sql } from 'kysely';

import { db } from '../../../../../lib/db';
import { buildEvidence } from '../../../../../lib/filter';

interface TopComplexRow {
  complex_name: string;
  median_man: number;
  tx_count_3m: number;
  last_contract_date: string;
}

interface RecentTxRow {
  complex_name: string;
  area_m2: number;
  amount_man: number;
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

interface ComplexesData {
  bjdName: string | null;
  tradeTop: TopComplexRow[];
  jeonseTop: TopComplexRow[];
  recentTrades: RecentTxRow[];
  recentJeonse: RecentTxRow[];
  distributions: DistributionRow[];
  timing: {
    dong_name_ms: number;
    trade_top_ms: number;
    jeonse_top_ms: number;
    recent_trade_ms: number;
    recent_jeonse_ms: number;
    distribution_ms: number;
    db_ms: number;
  };
}

async function fetchComplexesData(bjd: string): Promise<ComplexesData> {
  'use cache: remote';
  cacheLife({ revalidate: 3600 });
  cacheTag('mv_dong_stats', `complexes-${bjd}`);

  const t0 = performance.now();
  let dongNameMs = 0;
  let tradeTopMs = 0;
  let jeonseTopMs = 0;
  let recentTradeMs = 0;
  let recentJeonseMs = 0;
  let distributionMs = 0;
  const [
    dongNameResult,
    tradeTopResult,
    jeonseTopResult,
    recentTradesResult,
    recentJeonseResult,
    distributionResult,
  ] = await Promise.all([
    sql<{ bjd_name: string | null }>`
      SELECT bjd_name
      FROM bjd_polygon
      WHERE bjd_code = ${bjd}
    `.execute(db).then((result) => {
      dongNameMs = performance.now() - t0;
      return result;
    }),
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
    `.execute(db).then((result) => {
      tradeTopMs = performance.now() - t0;
      return result;
    }),
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
    `.execute(db).then((result) => {
      jeonseTopMs = performance.now() - t0;
      return result;
    }),
    sql<RecentTxRow>`
      SELECT
        complex_name,
        CAST(area_m2 AS DOUBLE PRECISION) AS area_m2,
        price_man AS amount_man,
        floor,
        contract_date::text AS contract_date
      FROM tx_apt_trade
      WHERE bjd_code = ${bjd}
      ORDER BY contract_date DESC
      LIMIT 10
    `.execute(db).then((result) => {
      recentTradeMs = performance.now() - t0;
      return result;
    }),
    sql<RecentTxRow>`
      SELECT
        complex_name,
        CAST(area_m2 AS DOUBLE PRECISION) AS area_m2,
        deposit_man AS amount_man,
        floor,
        contract_date::text AS contract_date
      FROM tx_apt_rent
      WHERE bjd_code = ${bjd}
        AND monthly_man = 0
      ORDER BY contract_date DESC
      LIMIT 10
    `.execute(db).then((result) => {
      recentJeonseMs = performance.now() - t0;
      return result;
    }),
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
    `.execute(db).then((result) => {
      distributionMs = performance.now() - t0;
      return result;
    }),
  ]);
  const dbMs = Math.max(
    dongNameMs,
    tradeTopMs,
    jeonseTopMs,
    recentTradeMs,
    recentJeonseMs,
    distributionMs,
  );

  return {
    bjdName: dongNameResult.rows[0]?.bjd_name ?? null,
    tradeTop: tradeTopResult.rows,
    jeonseTop: jeonseTopResult.rows,
    recentTrades: recentTradesResult.rows,
    recentJeonse: recentJeonseResult.rows,
    distributions: distributionResult.rows,
    timing: {
      dong_name_ms: Number(dongNameMs.toFixed(1)),
      trade_top_ms: Number(tradeTopMs.toFixed(1)),
      jeonse_top_ms: Number(jeonseTopMs.toFixed(1)),
      recent_trade_ms: Number(recentTradeMs.toFixed(1)),
      recent_jeonse_ms: Number(recentJeonseMs.toFixed(1)),
      distribution_ms: Number(distributionMs.toFixed(1)),
      db_ms: Number(dbMs.toFixed(1)),
    },
  };
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

  const tEvalStart = performance.now();
  const data = await fetchComplexesData(bjd);

  if (!data.bjdName) {
    return NextResponse.json(
      { error: 'dong not found', evidence: 'bjd_polygon 매칭 실패' },
      { status: 404 },
    );
  }

  const candidateDates = [
    data.recentTrades[0]?.contract_date,
    data.recentJeonse[0]?.contract_date,
    data.tradeTop[0]?.last_contract_date,
    data.jeonseTop[0]?.last_contract_date,
  ].filter((d): d is string => Boolean(d));
  const lastEvidenceDate =
    candidateDates.length > 0
      ? candidateDates.sort().at(-1)!
      : new Date().toISOString().slice(0, 10);

  const mapRecent = (row: RecentTxRow) => ({
    complex_name: row.complex_name,
    area_m2: Number(row.area_m2),
    amount_man: row.amount_man,
    floor: row.floor,
    contract_date: row.contract_date,
    evidence: `RTMS ${row.contract_date} 신고분`,
  });

  const recentTrades = data.recentTrades.map(mapRecent);
  const recentJeonse = data.recentJeonse.map(mapRecent);
  const evalMs = performance.now() - tEvalStart - data.timing.db_ms;

  return NextResponse.json(
    {
      bjd_code: bjd,
      bjd_name: data.bjdName,
      trade_top5: data.tradeTop.map((row) => ({
        complex_name: row.complex_name,
        median_man: Math.round(Number(row.median_man)),
        tx_count_3m: row.tx_count_3m,
        evidence: buildEvidence(row.tx_count_3m, 1, row.last_contract_date),
      })),
      jeonse_top5: data.jeonseTop.map((row) => ({
        complex_name: row.complex_name,
        median_man: Math.round(Number(row.median_man)),
        tx_count_3m: row.tx_count_3m,
        evidence: buildEvidence(row.tx_count_3m, 1, row.last_contract_date),
      })),
      recent_trades: recentTrades,
      recent_jeonse: recentJeonse,
      distributions: data.distributions.map((row) => ({
        mode: row.mode,
        size_bucket: row.size_bucket,
        p25_man: row.p25_man === null ? null : Math.round(Number(row.p25_man)),
        median_man: row.median_man === null ? null : Math.round(Number(row.median_man)),
        p75_man: row.p75_man === null ? null : Math.round(Number(row.p75_man)),
        tx_count_3m: Number(row.tx_count_3m),
        confidence: row.confidence,
      })),
      generated_at: new Date().toISOString(),
      evidence: buildEvidence(
        recentTrades.length + recentJeonse.length,
        data.tradeTop.length + data.jeonseTop.length,
        lastEvidenceDate,
      ),
      _timing: {
        ...data.timing,
        eval_ms: Number(Math.max(0, evalMs).toFixed(1)),
      },
    },
    {
      headers: {
        'Server-Timing': `dong_name;dur=${data.timing.dong_name_ms}, trade_top;dur=${data.timing.trade_top_ms}, jeonse_top;dur=${data.timing.jeonse_top_ms}, recent_trade;dur=${data.timing.recent_trade_ms}, recent_jeonse;dur=${data.timing.recent_jeonse_ms}, distribution;dur=${data.timing.distribution_ms}`,
      },
    },
  );
}
