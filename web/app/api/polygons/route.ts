import { NextResponse } from 'next/server';
import { cacheLife, cacheTag } from 'next/cache';
import { sql } from 'kysely';

import { db } from '../../../lib/db';

interface PolygonRow {
  bjd_code: string;
  bjd_name: string;
  sigungu: string;
  dong: string;
  geometry: string;
}

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    bjd_code: string;
    bjd_name: string;
    sigungu: string;
    dong: string;
  };
  geometry: unknown;
}

interface PolygonsPayload {
  features: GeoJSONFeature[];
  timing: { db_ms: number; serialize_ms: number; parse_ms: number };
}

async function fetchPolygons(): Promise<PolygonsPayload> {
  'use cache';
  cacheLife('max');
  cacheTag('bjd_polygon');

  const t0 = performance.now();
  const rows = await sql<PolygonRow>`
    SELECT
      bjd_code,
      bjd_name,
      sigungu,
      dong,
      ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.00005), 5) AS geometry
    FROM bjd_polygon
    WHERE sido = '서울특별시'
  `.execute(db);
  const dbMs = performance.now() - t0;

  const tSerialize0 = performance.now();
  let parseMs = 0;
  const features: GeoJSONFeature[] = rows.rows.map((row) => {
    const tParse0 = performance.now();
    const geometry = JSON.parse(row.geometry);
    parseMs += performance.now() - tParse0;

    return {
      type: 'Feature',
      properties: {
        bjd_code: row.bjd_code.trim(),
        bjd_name: row.bjd_name,
        sigungu: row.sigungu,
        dong: row.dong,
      },
      geometry,
    };
  });
  const serializeMs = performance.now() - tSerialize0;

  return {
    features,
    timing: {
      db_ms: Number(dbMs.toFixed(1)),
      serialize_ms: Number(serializeMs.toFixed(1)),
      parse_ms: Number(parseMs.toFixed(1)),
    },
  };
}

export async function GET() {
  const { features, timing } = await fetchPolygons();

  return NextResponse.json(
    {
      type: 'FeatureCollection',
      features,
      generated_at: new Date().toISOString(),
      evidence: `법정동 폴리곤 ${features.length}개 (V-World LSMD_ADM_SECT_UMD_11)`,
      _timing: timing,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Server-Timing': `db;dur=${timing.db_ms}, serialize;dur=${timing.serialize_ms}, parse;dur=${timing.parse_ms}`,
      },
    },
  );
}
