'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

import type { DongColor } from '../lib/filter';

const SEOUL_CENTER: [number, number] = [126.978, 37.5665];
const DEFAULT_ZOOM = 11;

const POLYGONS_SOURCE_ID = 'bjd-polygons';
const POLYGONS_FILL_LAYER = 'bjd-polygons-fill';
const POLYGONS_LINE_LAYER = 'bjd-polygons-line';

const COLOR_MAP: Record<DongColor, string> = {
  deep_green: '#2d8a4f',
  light_green: '#7ab582',
  deep_green_low: '#5fa86f',
  yellow: '#e8b73a',
  red: '#d04545',
  grey: '#cccccc',
};

interface AffordableDongResponse {
  bjd_code: string;
  bjd_name: string;
  median_man: number;
  tx_count_3m: number;
  unique_complex_3m: number;
  confidence: 'high' | 'low' | 'insufficient';
  jeonse_ratio: number | null;
  color: DongColor;
  evidence: string;
  median_build_year: number | null;
  build_year_stddev: number | null;
}

interface AffordableResponse {
  dongs: AffordableDongResponse[];
  generated_at: string;
  data_freshness: string;
  evidence: string;
}

const DEFAULT_QUERY = {
  mode: 'trade' as const,
  cash_min: 40000,
  cash_max: 80000,
  size: 'M' as const,
};

function buildAffordableUrl() {
  const params = new URLSearchParams({
    mode: DEFAULT_QUERY.mode,
    cash_min: String(DEFAULT_QUERY.cash_min),
    cash_max: String(DEFAULT_QUERY.cash_max),
    size: DEFAULT_QUERY.size,
  });
  return `/api/affordable?${params}`;
}

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polygonCount, setPolygonCount] = useState<number | null>(null);
  const [affordable, setAffordable] = useState<AffordableResponse | null>(null);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      setError('NEXT_PUBLIC_MAPBOX_TOKEN 미설정 — web/.env.local 확인');
      return;
    }
    if (!containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: SEOUL_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 9,
      maxZoom: 16,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', async () => {
      try {
        const [polyRes, afRes] = await Promise.all([
          fetch('/api/polygons'),
          fetch(buildAffordableUrl()),
        ]);
        if (!polyRes.ok) throw new Error(`/api/polygons HTTP ${polyRes.status}`);
        if (!afRes.ok) throw new Error(`/api/affordable HTTP ${afRes.status}`);

        const fc = await polyRes.json();
        const af: AffordableResponse = await afRes.json();
        setAffordable(af);

        map.addSource(POLYGONS_SOURCE_ID, {
          type: 'geojson',
          data: fc,
          promoteId: 'bjd_code',
        });

        map.addLayer({
          id: POLYGONS_FILL_LAYER,
          type: 'fill',
          source: POLYGONS_SOURCE_ID,
          paint: {
            'fill-color': [
              'match',
              ['feature-state', 'color'],
              'deep_green', COLOR_MAP.deep_green,
              'light_green', COLOR_MAP.light_green,
              'deep_green_low', COLOR_MAP.deep_green_low,
              'yellow', COLOR_MAP.yellow,
              'red', COLOR_MAP.red,
              'grey', COLOR_MAP.grey,
              COLOR_MAP.grey,
            ],
            'fill-opacity': [
              'case',
              ['==', ['feature-state', 'color'], 'deep_green_low'], 0.5,
              ['==', ['feature-state', 'matched'], true], 0.7,
              0.18,
            ],
          },
        });

        map.addLayer({
          id: POLYGONS_LINE_LAYER,
          type: 'line',
          source: POLYGONS_SOURCE_ID,
          paint: {
            'line-color': '#666',
            'line-width': 0.4,
          },
        });

        for (const dong of af.dongs) {
          map.setFeatureState(
            { source: POLYGONS_SOURCE_ID, id: dong.bjd_code },
            { color: dong.color, matched: true },
          );
        }

        setPolygonCount(fc.features?.length ?? 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <header
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          padding: '10px 14px',
          background: 'rgba(255,255,255,0.94)',
          borderRadius: 6,
          fontSize: 13,
          boxShadow: '0 1px 6px rgba(0,0,0,0.18)',
          zIndex: 1,
          maxWidth: 360,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 2 }}>
          eodigakka — 임장 후보 색칠지도
        </div>
        <div style={{ color: '#555', fontSize: 12 }}>
          {DEFAULT_QUERY.mode === 'trade' ? '매매' : '전세'} · 자금{' '}
          {DEFAULT_QUERY.cash_min / 10000}억~{DEFAULT_QUERY.cash_max / 10000}억 · 평형{' '}
          {DEFAULT_QUERY.size === 'M' ? '중형(60~85㎡)' : DEFAULT_QUERY.size}
        </div>
        {affordable && (
          <div style={{ marginTop: 4, fontSize: 12, color: '#333' }}>
            {affordable.evidence}
          </div>
        )}
        {polygonCount !== null && (
          <div style={{ marginTop: 2, fontSize: 11, color: '#888' }}>
            폴리곤 {polygonCount}개 · {affordable?.data_freshness ?? ''}
          </div>
        )}
        <Legend />
      </header>

      {error && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 60,
            padding: '10px 14px',
            background: '#fff5f5',
            border: '1px solid #f5b5b5',
            color: '#922',
            borderRadius: 6,
            zIndex: 1,
            maxWidth: 380,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function Legend() {
  const items: Array<{ color: string; label: string }> = [
    { color: COLOR_MAP.deep_green, label: '조건 통과 (high)' },
    { color: COLOR_MAP.deep_green_low, label: 'low confidence (투명)' },
    { color: COLOR_MAP.light_green, label: 'IQR null' },
    { color: COLOR_MAP.yellow, label: 'IQR 분산 가드' },
    { color: COLOR_MAP.red, label: '전세가율 80%+' },
    { color: COLOR_MAP.grey, label: '미통과/표본 부족' },
  ];
  return (
    <div style={{ marginTop: 8, display: 'grid', gap: 2, fontSize: 11 }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              background: it.color,
              borderRadius: 2,
              opacity: it.label.includes('투명') ? 0.5 : 1,
            }}
          />
          <span style={{ color: '#444' }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
