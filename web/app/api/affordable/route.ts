import { NextRequest, NextResponse } from 'next/server';
import { cacheLife, cacheTag } from 'next/cache';
import { sql } from 'kysely';

import { db } from '../../../lib/db';
import { evaluateAffordableDong, parseAffordableQuery } from '../../../lib/filter';

interface AffordableRow {
  bjd_code: string;
  bjd_name: string;
  size_bucket: 'S' | 'M' | 'L';
  mode: 'TRADE' | 'JEONSE';
  tx_count_3m: number;
  unique_complex_3m: number;
  median_man: number;
  p25_man: number | null;
  p75_man: number | null;
  last_contract_date: string;
  confidence: 'high' | 'low' | 'insufficient';
  jeonse_ratio: number | null;
  median_build_year: number | null;
  build_year_stddev: number | null;
}

interface AffordableData {
  rows: AffordableRow[];
  lastContractDate: string | null;
  timing: { stats_ms: number; fresh_ms: number; db_ms: number };
}

function toStatsMode(mode: 'trade' | 'jeonse') {
  return mode === 'trade' ? 'TRADE' : 'JEONSE';
}

async function fetchAffordableData(
  statsMode: 'TRADE' | 'JEONSE',
  size: 'S' | 'M' | 'L' | 'all',
): Promise<AffordableData> {
  'use cache: remote';
  cacheLife({ revalidate: 3600 });
  cacheTag('mv_dong_stats');

  const t0 = performance.now();
  let tStats = 0;
  let tFresh = 0;
  const [rows, freshness] = await Promise.all([
    sql<AffordableRow>`
      SELECT
        s.bjd_code,
        p.bjd_name,
        s.size_bucket,
        s.mode,
        s.tx_count_3m,
        s.unique_complex_3m,
        CAST(s.median_man AS DOUBLE PRECISION) AS median_man,
        CAST(s.p25_man AS DOUBLE PRECISION) AS p25_man,
        CAST(s.p75_man AS DOUBLE PRECISION) AS p75_man,
        s.last_contract_date::text AS last_contract_date,
        s.confidence,
        CAST(jr.ratio AS DOUBLE PRECISION) AS jeonse_ratio,
        CAST(s.median_build_year AS DOUBLE PRECISION) AS median_build_year,
        CAST(s.build_year_stddev AS DOUBLE PRECISION) AS build_year_stddev
      FROM mv_dong_stats s
      JOIN bjd_polygon p ON p.bjd_code = s.bjd_code
      LEFT JOIN mv_jeonse_ratio jr
        ON jr.bjd_code = s.bjd_code
       AND jr.size_bucket = s.size_bucket
      WHERE s.mode = ${statsMode}
        ${size === 'all' ? sql`` : sql`AND s.size_bucket = ${size}`}
      ORDER BY s.median_man ASC, s.tx_count_3m DESC
    `.execute(db).then((r) => { tStats = performance.now() - t0; return r; }),
    sql<{ last_contract_date: string | null }>`
      SELECT ${sql.raw(statsMode === 'TRADE' ? 'last_contract_date_trade' : 'last_contract_date_rent')}::text AS last_contract_date
      FROM etl_job_status
      WHERE job_name = 'rtms_phase1'
    `.execute(db).then((r) => { tFresh = performance.now() - t0; return r; }),
  ]);
  const tDb = performance.now() - t0;

  return {
    rows: rows.rows,
    lastContractDate: freshness.rows[0]?.last_contract_date ?? null,
    timing: {
      stats_ms: Number(tStats.toFixed(1)),
      fresh_ms: Number(tFresh.toFixed(1)),
      db_ms: Number(tDb.toFixed(1)),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const query = parseAffordableQuery(request.nextUrl.searchParams);
    const statsMode = toStatsMode(query.mode);

    const tEvalStart = performance.now();
    const { rows, lastContractDate, timing } = await fetchAffordableData(statsMode, query.size);

    const dongs = rows
      .map((row) =>
        evaluateAffordableDong(
          {
            bjdCode: row.bjd_code,
            bjdName: row.bjd_name,
            sizeBucket: row.size_bucket,
            mode: row.mode,
            txCount3m: Number(row.tx_count_3m),
            uniqueComplex3m: Number(row.unique_complex_3m),
            medianMan: Number(row.median_man),
            p25Man: row.p25_man === null ? null : Number(row.p25_man),
            p75Man: row.p75_man === null ? null : Number(row.p75_man),
            lastContractDate: row.last_contract_date,
            confidence: row.confidence,
            jeonseRatio: row.jeonse_ratio === null ? null : Number(row.jeonse_ratio),
            medianBuildYear:
              row.median_build_year === null ? null : Math.round(Number(row.median_build_year)),
            buildYearStddev:
              row.build_year_stddev === null ? null : Number(row.build_year_stddev.toFixed(1)),
          },
          query,
        ),
      )
      .filter((dong): dong is NonNullable<typeof dong> => dong !== null)
      .map((dong) => ({
        bjd_code: dong.bjdCode,
        bjd_name: dong.bjdName,
        median_man: Math.round(dong.medianMan),
        tx_count_3m: dong.txCount3m,
        unique_complex_3m: dong.uniqueComplex3m,
        confidence: dong.confidence,
        jeonse_ratio: dong.jeonseRatio,
        color: dong.color,
        evidence: dong.evidence,
        median_build_year: dong.medianBuildYear,
        build_year_stddev: dong.buildYearStddev,
      }));

    const tEval = performance.now() - tEvalStart - timing.db_ms;

    return NextResponse.json(
      {
        dongs,
        generated_at: new Date().toISOString(),
        data_freshness: lastContractDate
          ? `RTMS ${lastContractDate} 신고분까지`
          : 'RTMS 신고분 없음',
        evidence: `조건 일치 ${dongs.length}개 동, 모드 ${statsMode}, 현금 ${query.cashMin}~${query.cashMax}만원`,
        _timing: {
          stats_ms: timing.stats_ms,
          fresh_ms: timing.fresh_ms,
          db_ms: timing.db_ms,
          eval_ms: Number(Math.max(0, tEval).toFixed(1)),
        },
      },
      {
        headers: {
          'Server-Timing': `stats;dur=${timing.stats_ms}, fresh;dur=${timing.fresh_ms}, db;dur=${timing.db_ms}, eval;dur=${Math.max(0, tEval).toFixed(1)}`,
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message, evidence: '입력 검증 또는 조회 실패' }, { status: 400 });
  }
}
