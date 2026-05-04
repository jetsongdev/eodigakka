'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

import type { DongColor, QueryMode, SizeBucket } from '../lib/filter';

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

type SizeOption = SizeBucket | 'all';

interface AffordableQueryState {
  mode: QueryMode;
  cashMin: number;
  cashMax: number;
  size: SizeOption;
}

const DEFAULT_QUERY: AffordableQueryState = {
  mode: 'trade',
  cashMin: 40000,
  cashMax: 80000,
  size: 'M',
};

const CASH_STOPS = [20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 120000];

function buildAffordableUrl(q: AffordableQueryState): string {
  const params = new URLSearchParams({
    mode: q.mode,
    cash_min: String(q.cashMin),
    cash_max: String(q.cashMax),
    size: q.size,
  });
  return `/api/affordable?${params}`;
}

function manToEok(man: number): string {
  return `${(man / 10000).toFixed(0)}억`;
}

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polygonCount, setPolygonCount] = useState<number | null>(null);
  const [affordable, setAffordable] = useState<AffordableResponse | null>(null);
  const [query, setQuery] = useState<AffordableQueryState>(DEFAULT_QUERY);
  const [loading, setLoading] = useState(false);

  // 1) 지도 + 폴리곤 source/layer 1회 초기화
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
        const res = await fetch('/api/polygons');
        if (!res.ok) throw new Error(`/api/polygons HTTP ${res.status}`);
        const fc = await res.json();

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

  // 2) 쿼리가 바뀔 때마다 /api/affordable 재호출 + feature-state 갱신
  useEffect(() => {
    let cancelled = false;
    const map = mapRef.current;
    if (!map) return;

    async function applyQuery() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(buildAffordableUrl(query));
        if (!res.ok) throw new Error(`/api/affordable HTTP ${res.status}`);
        const af: AffordableResponse = await res.json();
        if (cancelled) return;

        // map이 load 끝났는지 확인 — addSource 이전에 setFeatureState하면 noop
        const tryApply = () => {
          if (!map || cancelled) return;
          if (!map.getSource(POLYGONS_SOURCE_ID)) {
            map.once('idle', tryApply);
            return;
          }
          // 이전 색칠 초기화 (현재 map에 담긴 모든 feature-state 리셋)
          map.removeFeatureState({ source: POLYGONS_SOURCE_ID });
          for (const dong of af.dongs) {
            map.setFeatureState(
              { source: POLYGONS_SOURCE_ID, id: dong.bjd_code },
              { color: dong.color, matched: true },
            );
          }
        };
        tryApply();
        setAffordable(af);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    applyQuery();
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <ControlPanel
        query={query}
        onQueryChange={setQuery}
        affordable={affordable}
        polygonCount={polygonCount}
        loading={loading}
      />

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

function ControlPanel({
  query,
  onQueryChange,
  affordable,
  polygonCount,
  loading,
}: {
  query: AffordableQueryState;
  onQueryChange: (next: AffordableQueryState) => void;
  affordable: AffordableResponse | null;
  polygonCount: number | null;
  loading: boolean;
}) {
  const sizeLabel: Record<SizeOption, string> = {
    S: 'S (60㎡미만)',
    M: 'M (60~85)',
    L: 'L (85+)',
    all: '전체',
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        padding: '12px 14px',
        background: 'rgba(255,255,255,0.96)',
        borderRadius: 8,
        fontSize: 13,
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
        zIndex: 2,
        width: 320,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        eodigakka — 임장 후보 색칠지도
      </div>

      {/* 모드 토글 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['trade', 'jeonse'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onQueryChange({ ...query, mode: m })}
            style={{
              flex: 1,
              padding: '6px 0',
              fontSize: 12,
              border: '1px solid #aaa',
              borderRadius: 4,
              background: query.mode === m ? '#2d8a4f' : '#fff',
              color: query.mode === m ? '#fff' : '#333',
              cursor: 'pointer',
              fontWeight: query.mode === m ? 600 : 400,
            }}
          >
            {m === 'trade' ? '매매' : '전세'}
          </button>
        ))}
      </div>

      {/* cash 슬라이더 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>
          자금 범위: <strong>{manToEok(query.cashMin)} ~ {manToEok(query.cashMax)}</strong>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={query.cashMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              onQueryChange({ ...query, cashMin: v, cashMax: Math.max(query.cashMax, v) });
            }}
            style={{ flex: 1, fontSize: 12, padding: 4 }}
          >
            {CASH_STOPS.map((s) => (
              <option key={s} value={s}>{manToEok(s)}</option>
            ))}
          </select>
          <span style={{ alignSelf: 'center', color: '#888' }}>~</span>
          <select
            value={query.cashMax}
            onChange={(e) => {
              const v = Number(e.target.value);
              onQueryChange({ ...query, cashMax: v, cashMin: Math.min(query.cashMin, v) });
            }}
            style={{ flex: 1, fontSize: 12, padding: 4 }}
          >
            {CASH_STOPS.map((s) => (
              <option key={s} value={s}>{manToEok(s)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* size 토글 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>평형</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['S', 'M', 'L', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onQueryChange({ ...query, size: s })}
              style={{
                flex: 1,
                padding: '5px 0',
                fontSize: 11,
                border: '1px solid #aaa',
                borderRadius: 4,
                background: query.size === s ? '#444' : '#fff',
                color: query.size === s ? '#fff' : '#333',
                cursor: 'pointer',
              }}
            >
              {sizeLabel[s]}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 카드 */}
      <div
        style={{
          padding: '6px 8px',
          background: '#f4f6f4',
          borderLeft: '3px solid #2d8a4f',
          fontSize: 12,
          color: '#222',
          minHeight: 32,
        }}
      >
        {loading
          ? '쿼리 중...'
          : affordable
            ? affordable.evidence
            : '준비 중...'}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#888' }}>
        폴리곤 {polygonCount ?? '?'}개 · {affordable?.data_freshness ?? ''}
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  const items: Array<{ color: string; label: string; opacity?: number }> = [
    { color: COLOR_MAP.deep_green, label: '조건 통과 (high)' },
    { color: COLOR_MAP.deep_green_low, label: 'low confidence', opacity: 0.5 },
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
              opacity: it.opacity ?? 1,
            }}
          />
          <span style={{ color: '#444' }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
