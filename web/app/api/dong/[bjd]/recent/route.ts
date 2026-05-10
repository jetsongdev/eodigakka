import { NextRequest, NextResponse } from 'next/server';
import { cacheLife, cacheTag } from 'next/cache';
import { sql } from 'kysely';

import { db } from '../../../../../lib/db';

interface RecentTxRow {
  complex_name: string;
  area_m2: number;
  amount_man: number;
  floor: number | null;
  contract_date: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_OFFSET = 200;

async function fetchRecent(
  bjd: string,
  mode: 'trade' | 'jeonse',
  offset: number,
  limitPlusOne: number,
): Promise<RecentTxRow[]> {
  'use cache';
  cacheLife({ revalidate: 3600 });
  cacheTag('mv_dong_stats', `recent-${bjd}-${mode}-${offset}-${limitPlusOne}`);

  const result =
    mode === 'trade'
      ? await sql<RecentTxRow>`
          SELECT
            complex_name,
            CAST(area_m2 AS DOUBLE PRECISION) AS area_m2,
            price_man AS amount_man,
            floor,
            contract_date::text AS contract_date
          FROM tx_apt_trade
          WHERE bjd_code = ${bjd}
          ORDER BY contract_date DESC, complex_name ASC, area_m2 ASC
          OFFSET ${offset}
          LIMIT ${limitPlusOne}
        `.execute(db)
      : await sql<RecentTxRow>`
          SELECT
            complex_name,
            CAST(area_m2 AS DOUBLE PRECISION) AS area_m2,
            deposit_man AS amount_man,
            floor,
            contract_date::text AS contract_date
          FROM tx_apt_rent
          WHERE bjd_code = ${bjd}
            AND monthly_man = 0
          ORDER BY contract_date DESC, complex_name ASC, area_m2 ASC
          OFFSET ${offset}
          LIMIT ${limitPlusOne}
        `.execute(db);

  return result.rows;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bjd: string }> },
) {
  const { bjd } = await context.params;

  if (!/^\d{10}$/.test(bjd)) {
    return NextResponse.json(
      { error: 'bjd must be a 10-digit legal dong code', evidence: '법정동코드 형식 오류' },
      { status: 400 },
    );
  }

  const sp = request.nextUrl.searchParams;
  const mode = sp.get('mode');
  if (mode !== 'trade' && mode !== 'jeonse') {
    return NextResponse.json(
      { error: 'mode must be "trade" or "jeonse"', evidence: '쿼리 파라미터 mode 오류' },
      { status: 400 },
    );
  }

  const offsetRaw = Number(sp.get('offset') ?? '0');
  const limitRaw = Number(sp.get('limit') ?? String(DEFAULT_LIMIT));
  if (!Number.isInteger(offsetRaw) || offsetRaw < 0 || offsetRaw > MAX_OFFSET) {
    return NextResponse.json(
      { error: `offset must be 0..${MAX_OFFSET}`, evidence: 'offset 범위 오류' },
      { status: 400 },
    );
  }
  if (!Number.isInteger(limitRaw) || limitRaw <= 0 || limitRaw > MAX_LIMIT) {
    return NextResponse.json(
      { error: `limit must be 1..${MAX_LIMIT}`, evidence: 'limit 범위 오류' },
      { status: 400 },
    );
  }

  const t0 = performance.now();
  const rows = await fetchRecent(bjd, mode, offsetRaw, limitRaw + 1);
  const dbMs = performance.now() - t0;

  const hasMore = rows.length > limitRaw;
  const trimmed = hasMore ? rows.slice(0, limitRaw) : rows;

  const mapped = trimmed.map((row) => ({
    complex_name: row.complex_name,
    area_m2: Number(row.area_m2),
    amount_man: row.amount_man,
    floor: row.floor,
    contract_date: row.contract_date,
    evidence: `RTMS ${row.contract_date} 신고분`,
  }));

  return NextResponse.json(
    {
      bjd_code: bjd,
      mode,
      offset: offsetRaw,
      limit: limitRaw,
      rows: mapped,
      has_more: hasMore,
      generated_at: new Date().toISOString(),
      _timing: {
        db_ms: Number(dbMs.toFixed(1)),
      },
    },
    {
      headers: {
        'Server-Timing': `recent;dur=${dbMs.toFixed(1)}`,
      },
    },
  );
}
