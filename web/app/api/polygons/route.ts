import { NextResponse } from 'next/server';
import { sql } from 'kysely';

import { db } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

export async function GET() {
  const rows = await sql<PolygonRow>`
    SELECT
      bjd_code,
      bjd_name,
      sigungu,
      dong,
      ST_AsGeoJSON(geom) AS geometry
    FROM bjd_polygon
    WHERE sido = '서울특별시'
  `.execute(db);

  const features: GeoJSONFeature[] = rows.rows.map((row) => ({
    type: 'Feature',
    properties: {
      bjd_code: row.bjd_code.trim(),
      bjd_name: row.bjd_name,
      sigungu: row.sigungu,
      dong: row.dong,
    },
    geometry: JSON.parse(row.geometry),
  }));

  return NextResponse.json(
    {
      type: 'FeatureCollection',
      features,
      generated_at: new Date().toISOString(),
      evidence: `법정동 폴리곤 ${features.length}개 (V-World LSMD_ADM_SECT_UMD_11)`,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    },
  );
}
