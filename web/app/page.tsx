'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import * as Slider from '@radix-ui/react-slider';

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

interface TopComplex {
  complex_name: string;
  median_man: number;
  tx_count_3m: number;
  evidence: string;
}

interface RecentTransaction {
  mode: 'TRADE' | 'JEONSE';
  complex_name: string;
  area_m2: number;
  amount_man: number;
  monthly_man: number;
  floor: number | null;
  contract_date: string;
  evidence: string;
}

interface DongDetailsResponse {
  bjd_code: string;
  bjd_name: string;
  trade_top5: TopComplex[];
  jeonse_top5: TopComplex[];
  recent_transactions: RecentTransaction[];
  generated_at: string;
  evidence: string;
}

interface HoverInfo {
  bjdCode: string;
  bjdName: string;
  x: number;
  y: number;
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

const CASH_MIN = 0;        // 0억
const CASH_MAX = 500000;   // 50억 (강북 14구 매매 p99 26억, max 156억 outlier 1건은 cover하지 않음)
const CASH_STEP = 5000;    // 5천만원 단위

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
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selectedBjd, setSelectedBjd] = useState<string | null>(null);
  const [dongDetails, setDongDetails] = useState<DongDetailsResponse | null>(null);
  const [dongDetailsLoading, setDongDetailsLoading] = useState(false);

  // affordable 응답을 bjd_code로 빠르게 조회하기 위한 ref
  const affordableMapRef = useRef<Map<string, AffordableDongResponse>>(new Map());
  affordableMapRef.current = new Map(
    (affordable?.dongs ?? []).map((d) => [d.bjd_code, d]),
  );

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

        // hover: 커서 + tooltip
        map.on('mousemove', POLYGONS_FILL_LAYER, (e) => {
          if (!e.features?.length) return;
          map.getCanvas().style.cursor = 'pointer';
          const feat = e.features[0];
          const props = feat.properties as { bjd_code?: string; bjd_name?: string } | null;
          if (!props?.bjd_code) return;
          setHover({
            bjdCode: props.bjd_code,
            bjdName: props.bjd_name ?? '',
            x: e.point.x,
            y: e.point.y,
          });
        });
        map.on('mouseleave', POLYGONS_FILL_LAYER, () => {
          map.getCanvas().style.cursor = '';
          setHover(null);
        });

        // click: 사이드패널 열기
        map.on('click', POLYGONS_FILL_LAYER, (e) => {
          if (!e.features?.length) return;
          const feat = e.features[0];
          const props = feat.properties as { bjd_code?: string } | null;
          if (!props?.bjd_code) return;
          setSelectedBjd(props.bjd_code);
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

  // 3) selectedBjd 변경 시 동 상세 fetch
  useEffect(() => {
    if (!selectedBjd) {
      setDongDetails(null);
      return;
    }
    let cancelled = false;
    setDongDetailsLoading(true);
    fetch(`/api/dong/${selectedBjd}/complexes`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`/api/dong/${selectedBjd}/complexes HTTP ${res.status}`);
        return res.json() as Promise<DongDetailsResponse>;
      })
      .then((data) => {
        if (!cancelled) setDongDetails(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setDongDetailsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBjd]);

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

      {hover && (
        <HoverTooltip
          hover={hover}
          dong={affordableMapRef.current.get(hover.bjdCode) ?? null}
        />
      )}

      {selectedBjd && (
        <SidePanel
          bjdCode={selectedBjd}
          dong={affordableMapRef.current.get(selectedBjd) ?? null}
          details={dongDetails}
          loading={dongDetailsLoading}
          mode={query.mode}
          onClose={() => setSelectedBjd(null)}
        />
      )}

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
      <CashRangeSlider
        min={query.cashMin}
        max={query.cashMax}
        onChange={(min, max) => onQueryChange({ ...query, cashMin: min, cashMax: max })}
      />


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

function CashRangeSlider({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  // 슬라이더 드래그 중에는 onChange를 빈번히 부르지 않고 commit 시점에만 부른다.
  const [draft, setDraft] = useState<[number, number]>([min, max]);
  // 부모(query) 변경에 동기화
  useEffect(() => {
    setDraft([min, max]);
  }, [min, max]);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>
        자금 범위: <strong>{manToEok(draft[0])} ~ {manToEok(draft[1])}</strong>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <CashEdgeButton ariaLabel="최소 -10억" edge="min" delta={-100000} draft={draft} setDraft={setDraft} onChange={onChange}>
          ⏮
        </CashEdgeButton>
        <CashEdgeButton ariaLabel="최소 -1억" edge="min" delta={-10000} draft={draft} setDraft={setDraft} onChange={onChange}>
          ⏪
        </CashEdgeButton>
        <CashEdgeButton ariaLabel="최소 -1천만원" edge="min" delta={-1000} draft={draft} setDraft={setDraft} onChange={onChange}>
          ◀
        </CashEdgeButton>
        <Slider.Root
          className="cash-slider"
          value={draft}
          min={CASH_MIN}
          max={CASH_MAX}
          step={CASH_STEP}
          minStepsBetweenThumbs={1}
          onValueChange={(v) => setDraft([v[0], v[1]] as [number, number])}
          onValueCommit={(v) => onChange(v[0], v[1])}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            userSelect: 'none',
            touchAction: 'none',
            flex: 1,
            height: 22,
          }}
        >
          <Slider.Track
            style={{
              backgroundColor: '#e2e2e2',
              position: 'relative',
              flexGrow: 1,
              borderRadius: 9999,
              height: 3,
            }}
          >
            <Slider.Range
              style={{
                position: 'absolute',
                backgroundColor: '#2d8a4f',
                borderRadius: 9999,
                height: '100%',
              }}
            />
          </Slider.Track>
          <Slider.Thumb
            aria-label="자금 최소"
            style={{
              display: 'block',
              width: 14,
              height: 14,
              backgroundColor: '#1a1a1a',
              borderRadius: '50%',
              boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
              cursor: 'pointer',
            }}
          />
          <Slider.Thumb
            aria-label="자금 최대"
            style={{
              display: 'block',
              width: 14,
              height: 14,
              backgroundColor: '#1a1a1a',
              borderRadius: '50%',
              boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
              cursor: 'pointer',
            }}
          />
        </Slider.Root>
        <CashEdgeButton ariaLabel="최대 +1천만원" edge="max" delta={1000} draft={draft} setDraft={setDraft} onChange={onChange}>
          ▶
        </CashEdgeButton>
        <CashEdgeButton ariaLabel="최대 +1억" edge="max" delta={10000} draft={draft} setDraft={setDraft} onChange={onChange}>
          ⏩
        </CashEdgeButton>
        <CashEdgeButton ariaLabel="최대 +10억" edge="max" delta={100000} draft={draft} setDraft={setDraft} onChange={onChange}>
          ⏭
        </CashEdgeButton>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#999', marginTop: 2 }}>
        <span>{manToEok(CASH_MIN)}</span>
        <span>{manToEok(CASH_MAX)}</span>
      </div>
    </div>
  );
}

function CashEdgeButton({
  ariaLabel,
  edge,
  delta,
  draft,
  setDraft,
  onChange,
  children,
}: {
  ariaLabel: string;
  edge: 'min' | 'max';
  delta: number;
  draft: [number, number];
  setDraft: (next: [number, number]) => void;
  onChange: (min: number, max: number) => void;
  children: React.ReactNode;
}) {
  // 한쪽 핸들만 이동. cashMin은 cashMax 이하로, cashMax는 cashMin 이상으로 clamp.
  function shift() {
    let nextMin = draft[0];
    let nextMax = draft[1];
    if (edge === 'min') {
      nextMin = Math.min(draft[1], Math.max(CASH_MIN, draft[0] + delta));
    } else {
      nextMax = Math.max(draft[0], Math.min(CASH_MAX, draft[1] + delta));
    }
    const next: [number, number] = [nextMin, nextMax];
    setDraft(next);
    onChange(nextMin, nextMax);
  }
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={shift}
      style={{
        fontSize: 14,
        lineHeight: 1,
        padding: '4px 6px',
        minWidth: 24,
        border: '1px solid #c4c4c4',
        background: '#f7f7f7',
        borderRadius: 3,
        cursor: 'pointer',
        color: '#222',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

function HoverTooltip({
  hover,
  dong,
}: {
  hover: HoverInfo;
  dong: AffordableDongResponse | null;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: hover.x + 14,
        top: hover.y + 14,
        padding: '6px 10px',
        background: 'rgba(20,20,20,0.92)',
        color: '#fff',
        borderRadius: 4,
        fontSize: 12,
        pointerEvents: 'none',
        zIndex: 3,
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontWeight: 600 }}>{hover.bjdName || hover.bjdCode}</div>
      {dong ? (
        <div style={{ marginTop: 2, color: '#ddd' }}>
          중위 {(dong.median_man / 10000).toFixed(1)}억 · {dong.tx_count_3m}건 · {dong.confidence}
        </div>
      ) : (
        <div style={{ marginTop: 2, color: '#999' }}>현재 필터로 미통과 / 표본 부족</div>
      )}
    </div>
  );
}

function SidePanel({
  bjdCode,
  dong,
  details,
  loading,
  mode,
  onClose,
}: {
  bjdCode: string;
  dong: AffordableDongResponse | null;
  details: DongDetailsResponse | null;
  loading: boolean;
  mode: QueryMode;
  onClose: () => void;
}) {
  const top5 = mode === 'trade' ? details?.trade_top5 : details?.jeonse_top5;
  return (
    <aside
      style={{
        position: 'absolute',
        top: 12,
        right: 60,
        bottom: 12,
        width: 360,
        padding: '14px 16px',
        background: 'rgba(255,255,255,0.97)',
        borderRadius: 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
        zIndex: 2,
        overflowY: 'auto',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {details?.bjd_name ?? bjdCode}
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>{bjdCode}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          style={{
            border: 'none',
            background: 'transparent',
            fontSize: 18,
            cursor: 'pointer',
            color: '#666',
          }}
        >
          ×
        </button>
      </div>

      {dong && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 8px',
            background: '#f4f6f4',
            borderLeft: '3px solid #2d8a4f',
            fontSize: 12,
          }}
        >
          {dong.evidence}
          <div style={{ marginTop: 2, color: '#555' }}>
            중위 {(dong.median_man / 10000).toFixed(1)}억 · {dong.confidence}
            {dong.median_build_year && ` · 중위 ${dong.median_build_year}년식`}
            {dong.build_year_stddev != null && dong.build_year_stddev > 10 && ' ⚠️ 신구축 혼재'}
          </div>
        </div>
      )}

      <h4 style={{ marginTop: 14, marginBottom: 6, fontSize: 13 }}>
        {mode === 'trade' ? '매매' : '전세'} TOP5 단지
      </h4>
      {loading && <div style={{ color: '#888' }}>로드 중...</div>}
      {!loading && top5 && top5.length === 0 && (
        <div style={{ color: '#888', fontSize: 12 }}>최근 3개월 거래 없음</div>
      )}
      {!loading && top5 && top5.length > 0 && (
        <ol style={{ paddingLeft: 18, margin: 0 }}>
          {top5.map((c) => (
            <li key={c.complex_name} style={{ marginBottom: 4 }}>
              <div style={{ fontWeight: 500 }}>{c.complex_name}</div>
              <div style={{ fontSize: 11, color: '#666' }}>
                중위 {(c.median_man / 10000).toFixed(1)}억 · {c.tx_count_3m}건
              </div>
            </li>
          ))}
        </ol>
      )}

      <h4 style={{ marginTop: 14, marginBottom: 6, fontSize: 13 }}>최근 거래 10건</h4>
      {loading && <div style={{ color: '#888' }}>로드 중...</div>}
      {!loading && details && details.recent_transactions.length === 0 && (
        <div style={{ color: '#888', fontSize: 12 }}>최근 거래 없음</div>
      )}
      {!loading && details && details.recent_transactions.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: '4px 2px', fontWeight: 600 }}>모드</th>
              <th style={{ padding: '4px 2px', fontWeight: 600 }}>단지·평형</th>
              <th style={{ padding: '4px 2px', fontWeight: 600, textAlign: 'right' }}>금액</th>
              <th style={{ padding: '4px 2px', fontWeight: 600 }}>일자</th>
            </tr>
          </thead>
          <tbody>
            {details.recent_transactions.map((tx, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f4f4f4' }}>
                <td style={{ padding: '4px 2px', color: tx.mode === 'TRADE' ? '#2d8a4f' : '#777' }}>
                  {tx.mode === 'TRADE' ? '매' : '전'}
                </td>
                <td style={{ padding: '4px 2px' }}>
                  {tx.complex_name}
                  <span style={{ color: '#999' }}> · {tx.area_m2.toFixed(0)}㎡</span>
                </td>
                <td style={{ padding: '4px 2px', textAlign: 'right' }}>
                  {(tx.amount_man / 10000).toFixed(1)}억
                </td>
                <td style={{ padding: '4px 2px', color: '#888' }}>{tx.contract_date.slice(5)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {details && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#888' }}>
          {details.evidence}
        </div>
      )}
    </aside>
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
