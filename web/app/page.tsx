'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as Slider from '@radix-ui/react-slider';

import type { AffordableDongResponse, HoverInfo } from '../components/MapView';
import { parseAffordableQuery } from '../lib/filter';
import type { QueryMode, SizeBucket } from '../lib/filter';

const MapView = dynamic(() => import('../components/MapView'), {
  ssr: false,
  loading: () => null,
});

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
  complex_name: string;
  area_m2: number;
  amount_man: number;
  floor: number | null;
  contract_date: string;
  evidence: string;
}

interface DongDistribution {
  mode: 'TRADE' | 'JEONSE';
  size_bucket: SizeBucket;
  p25_man: number | null;
  median_man: number | null;
  p75_man: number | null;
  tx_count_3m: number;
  confidence: 'high' | 'low' | 'insufficient';
}

interface DongDetailsResponse {
  bjd_code: string;
  bjd_name: string;
  trade_top5: TopComplex[];
  jeonse_top5: TopComplex[];
  recent_trades: RecentTransaction[];
  recent_jeonse: RecentTransaction[];
  distributions: DongDistribution[];
  generated_at: string;
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

const CASH_MIN = 0;        // 0억
const CASH_MAX = 500000;   // 50억 (강북 14구 매매 p99 26억, max 156억 outlier 1건은 cover하지 않음)
const CASH_STEP = 5000;    // 5천만원 단위
const URL_SYNC_DEBOUNCE_MS = 300;

function hasAffordableQueryParams(params: URLSearchParams): boolean {
  return ['mode', 'cash_min', 'cash_max', 'size'].some((key) => params.has(key));
}

function parseAffordableQueryState(params: URLSearchParams): AffordableQueryState {
  if (!hasAffordableQueryParams(params)) {
    return DEFAULT_QUERY;
  }
  try {
    const parsed = parseAffordableQuery(params, {
      mode: DEFAULT_QUERY.mode,
      cashMin: DEFAULT_QUERY.cashMin,
      cashMax: DEFAULT_QUERY.cashMax,
      size: DEFAULT_QUERY.size,
    });
    return {
      mode: parsed.mode,
      cashMin: parsed.cashMin,
      cashMax: parsed.cashMax,
      size: parsed.size,
    };
  } catch {
    return DEFAULT_QUERY;
  }
}

function buildAffordableQueryString(query: AffordableQueryState): string {
  const params = new URLSearchParams();
  params.set('mode', query.mode);
  params.set('cash_min', String(query.cashMin));
  params.set('cash_max', String(query.cashMax));
  params.set('size', query.size);
  return params.toString();
}

function isSameAffordableQuery(a: AffordableQueryState, b: AffordableQueryState): boolean {
  return (
    a.mode === b.mode &&
    a.cashMin === b.cashMin &&
    a.cashMax === b.cashMax &&
    a.size === b.size
  );
}

// 1억(=10000만) 이상은 "4억" / "4.5억", 미만은 "5천만" 또는 "4500만". 0은 그대로 "0".
function formatMan(man: number): string {
  if (man <= 0) return '0';
  if (man < 10000) {
    if (man % 1000 === 0) return `${man / 1000}천만`;
    return `${man.toLocaleString()}만`;
  }
  const eok = man / 10000;
  if (Math.abs(eok - Math.round(eok)) < 0.01) return `${Math.round(eok)}억`;
  return `${eok.toFixed(1)}억`;
}

function useIsHoverCapable() {
  // SSR 시에는 true로 시작 — 데스크톱 가정. 마운트 후 matchMedia로 보정.
  const [capable, setCapable] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setCapable(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCapable(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return capable;
}

function useIsNarrow() {
  // SSR 시에는 false로 시작 — 데스크톱 가정. 마운트 후 matchMedia로 보정.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 640px)');
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

export default function MapPage() {
  return (
    <Suspense fallback={<div style={{ width: '100vw', height: '100vh', background: '#fff' }} />}>
      <MapPageContent />
    </Suspense>
  );
}

function MapPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [polygonCount, setPolygonCount] = useState<number | null>(null);
  const [affordable, setAffordable] = useState<AffordableResponse | null>(null);
  // mode×size별 전체 동 캐시 — cash 필터는 client에서 적용해 슬라이더 latency 0
  const [allDongs, setAllDongs] = useState<AffordableDongResponse[]>([]);
  const [matched, setMatched] = useState<AffordableDongResponse[]>([]);
  const [dataFreshness, setDataFreshness] = useState<string>('');
  const [query, setQuery] = useState<AffordableQueryState>(() =>
    parseAffordableQueryState(new URLSearchParams(searchParams.toString())),
  );
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selectedBjd, setSelectedBjd] = useState<string | null>(null);
  // 터치 디바이스(`hover: none`)에서는 mouseleave가 발사되지 않아 tooltip이 영구 잔류
  const isHoverCapable = useIsHoverCapable();
  // SidePanel이 bottom sheet인지 side panel인지 — fitBounds padding 분기에 사용
  const isNarrow = useIsNarrow();
  const [dongDetails, setDongDetails] = useState<DongDetailsResponse | null>(null);
  const [dongDetailsLoading, setDongDetailsLoading] = useState(false);
  // cash 슬라이더 변경에 의한 추가/제거 동 카운트 — 시각 피드백 칩
  // 다음 cash 변경 또는 mode/size 변경 시까지 유지(자동 fade-out 없음)
  const [cashDelta, setCashDelta] = useState<{ added: number; removed: number } | null>(null);
  const prevMatchedRef = useRef<Set<string>>(new Set());
  const lastFilterCtxRef = useRef<{ mode: QueryMode; size: SizeOption } | null>(null);
  const urlSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevQueryRef = useRef<AffordableQueryState | null>(null);

  const searchParamsText = searchParams.toString();

  // affordable 응답을 bjd_code로 빠르게 조회하기 위한 ref
  const affordableMapRef = useRef<Map<string, AffordableDongResponse>>(new Map());
  affordableMapRef.current = new Map(
    (affordable?.dongs ?? []).map((d) => [d.bjd_code, d]),
  );

  useEffect(() => {
    const nextQuery = parseAffordableQueryState(new URLSearchParams(searchParamsText));
    setQuery((current) => (isSameAffordableQuery(current, nextQuery) ? current : nextQuery));
  }, [searchParamsText]);

  useEffect(() => {
    const nextSearch = buildAffordableQueryString(query);
    if (nextSearch === searchParamsText) {
      prevQueryRef.current = query;
      if (urlSyncTimeoutRef.current !== null) {
        clearTimeout(urlSyncTimeoutRef.current);
        urlSyncTimeoutRef.current = null;
      }
      return;
    }

    const prevQuery = prevQueryRef.current;
    const cashOnlyChanged =
      prevQuery !== null &&
      prevQuery.mode === query.mode &&
      prevQuery.size === query.size &&
      (prevQuery.cashMin !== query.cashMin || prevQuery.cashMax !== query.cashMax);

    const replaceUrl = () => {
      router.replace(`${pathname}?${nextSearch}`);
    };

    if (urlSyncTimeoutRef.current !== null) {
      clearTimeout(urlSyncTimeoutRef.current);
      urlSyncTimeoutRef.current = null;
    }

    if (cashOnlyChanged) {
      urlSyncTimeoutRef.current = setTimeout(() => {
        replaceUrl();
        urlSyncTimeoutRef.current = null;
      }, URL_SYNC_DEBOUNCE_MS);
    } else {
      replaceUrl();
    }

    prevQueryRef.current = query;
  }, [pathname, query, router, searchParamsText]);

  useEffect(() => {
    return () => {
      if (urlSyncTimeoutRef.current !== null) {
        clearTimeout(urlSyncTimeoutRef.current);
      }
    };
  }, []);

  // 2-A) mode/size 변경 시에만 네트워크 호출 — cash 범위는 wide-open으로 받아서 클라에서 필터
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const url = `/api/affordable?mode=${query.mode}&cash_min=${CASH_MIN}&cash_max=${CASH_MAX}&size=${query.size}`;
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`/api/affordable HTTP ${res.status}`);
        return res.json() as Promise<AffordableResponse>;
      })
      .then((af) => {
        if (cancelled) return;
        setAllDongs(af.dongs);
        setDataFreshness(af.data_freshness);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query.mode, query.size]);

  // 2-B) cash 슬라이더 변경 시 클라 사이드 필터
  // network roundtrip 없으므로 onValueChange 매 호출마다 즉시 반영
  useEffect(() => {
    const matched = allDongs.filter(
      (d) => d.median_man >= query.cashMin && d.median_man <= query.cashMax,
    );
    setMatched(matched);

    // delta 계산 — mode/size 동일 컨텍스트일 때만 cash 변경에 의한 +/- 표시
    const newSet = new Set(matched.map((d) => d.bjd_code));
    const prev = prevMatchedRef.current;
    const ctx = lastFilterCtxRef.current;
    const ctxSame = ctx !== null && ctx.mode === query.mode && ctx.size === query.size;
    if (ctxSame) {
      let added = 0;
      let removed = 0;
      for (const code of newSet) if (!prev.has(code)) added++;
      for (const code of prev) if (!newSet.has(code)) removed++;
      if (added > 0 || removed > 0) {
        // 다음 변경이 올 때까지 칩 유지
        setCashDelta({ added, removed });
      }
    } else {
      // mode/size가 바뀐 첫 호출 — delta 비표시, ref만 갱신
      setCashDelta(null);
    }
    prevMatchedRef.current = newSet;
    lastFilterCtxRef.current = { mode: query.mode, size: query.size };

    const modeLabel = query.mode === 'trade' ? '매매' : '전세';
    setAffordable({
      dongs: matched,
      generated_at: new Date().toISOString(),
      data_freshness: dataFreshness,
      evidence: `${matched.length}개 동 통과 · ${modeLabel} · ${formatMan(query.cashMin)}~${formatMan(query.cashMax)}`,
    });
  }, [allDongs, query.cashMin, query.cashMax, query.mode, dataFreshness]);

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
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh' }}>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <MapView
          matched={matched}
          selectedBjd={selectedBjd}
          isHoverCapable={isHoverCapable}
          isNarrow={isNarrow}
          onHover={setHover}
          onSelectBjd={setSelectedBjd}
          onPolygonCount={setPolygonCount}
          onError={setError}
        />

        <ControlPanel
          query={query}
          onQueryChange={setQuery}
          affordable={affordable}
          polygonCount={polygonCount}
          loading={loading}
          cashDelta={cashDelta}
        />

        {(polygonCount === null || affordable === null) && !error && (
          <LoadingOverlay
            polygonCount={polygonCount}
            affordableReady={affordable !== null}
          />
        )}

        {hover && isHoverCapable && !selectedBjd && (
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
            size={query.size}
            onModeChange={(mode) => setQuery((current) => (
              current.mode === mode ? current : { ...current, mode }
            ))}
            onClose={() => setSelectedBjd(null)}
          />
        )}

        {error && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 60,
            padding: '12px 16px',
            background: '#fff5f5',
            border: '1px solid #f5b5b5',
            color: '#922',
            borderRadius: 6,
            zIndex: 1,
            maxWidth: 420,
            whiteSpace: 'pre-line',
            lineHeight: 1.55,
            fontSize: 13,
          }}
        >
          {error}
        </div>
        )}
      </div>

      <Footer dataFreshness={affordable?.data_freshness ?? null} />
    </div>
  );
}

function ControlPanel({
  query,
  onQueryChange,
  affordable,
  polygonCount,
  loading,
  cashDelta,
}: {
  query: AffordableQueryState;
  onQueryChange: (next: AffordableQueryState) => void;
  affordable: AffordableResponse | null;
  polygonCount: number | null;
  loading: boolean;
  cashDelta: { added: number; removed: number } | null;
}) {
  const sizeLabel: Record<SizeOption, string> = {
    S: 'S (60㎡미만)',
    M: 'M (60~85)',
    L: 'L (85+)',
    all: '전체',
  };

  // 모바일에서는 기본 접힘. matchMedia 변경 시 isMobile만 갱신하고 collapsed는 사용자 선택을 존중.
  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const userToggledRef = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const sync = () => {
      setIsMobile(mq.matches);
      // 첫 평가 또는 사용자가 토글하지 않았을 때만 자동 동기화
      if (!userToggledRef.current) setCollapsed(mq.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  function toggleCollapsed() {
    userToggledRef.current = true;
    setCollapsed((c) => !c);
  }

  const summary = loading
    ? '쿼리 중...'
    : affordable
      ? `${affordable.dongs.length}개 동 · ${query.mode === 'trade' ? '매매' : '전세'} · ${formatMan(query.cashMin)}~${formatMan(query.cashMax)} · ${query.size}형`
      : '준비 중...';

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        padding: collapsed ? '8px 12px' : '12px 14px',
        background: 'rgba(255,255,255,0.96)',
        borderRadius: 8,
        fontSize: 13,
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
        zIndex: 2,
        width: isMobile ? 'calc(100vw - 24px)' : 320,
        maxWidth: isMobile ? 360 : 320,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: collapsed ? 0 : 8,
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0 }}>
          {collapsed ? (
            <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, fontSize: 12, color: '#333' }}>
              {summary}
            </span>
          ) : (
            'eodigakka — 임장 후보 색칠지도'
          )}
        </div>
        {isMobile && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? '컨트롤 펼치기' : '컨트롤 접기'}
            aria-expanded={!collapsed}
            style={{
              border: '1px solid #ccc',
              background: '#fff',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 12,
              cursor: 'pointer',
              color: '#333',
              flexShrink: 0,
            }}
          >
            {collapsed ? '펼치기 ▾' : '접기 ▴'}
          </button>
        )}
      </div>

      {collapsed ? null : (
        <ControlPanelBody
          query={query}
          onQueryChange={onQueryChange}
          affordable={affordable}
          polygonCount={polygonCount}
          loading={loading}
          sizeLabel={sizeLabel}
          cashDelta={cashDelta}
        />
      )}
    </div>
  );
}

function ControlPanelBody({
  query,
  onQueryChange,
  affordable,
  polygonCount,
  loading,
  sizeLabel,
  cashDelta,
}: {
  query: AffordableQueryState;
  onQueryChange: (next: AffordableQueryState) => void;
  affordable: AffordableResponse | null;
  polygonCount: number | null;
  loading: boolean;
  sizeLabel: Record<SizeOption, string>;
  cashDelta: { added: number; removed: number } | null;
}) {
  return (
    <>
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
        cashDelta={cashDelta}
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

      {/* 결과 카드 — count는 큰 숫자, 메타 정보는 작게 */}
      <div
        style={{
          padding: '8px 10px',
          background: '#f4f6f4',
          borderLeft: '3px solid #2d8a4f',
          minHeight: 42,
        }}
      >
        {loading ? (
          <div style={{ fontSize: 12, color: '#555' }}>쿼리 중...</div>
        ) : affordable ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#2d8a4f', lineHeight: 1.1 }}>
                {affordable.dongs.length}
              </span>
              <span style={{ fontSize: 12, color: '#444' }}>개 동 통과</span>
            </div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
              {query.mode === 'trade' ? '매매' : '전세'} · {formatMan(query.cashMin)}~{formatMan(query.cashMax)} · {query.size === 'all' ? '전체 평형' : `${query.size}형`}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: '#555' }}>준비 중...</div>
        )}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: '#888' }}>
        폴리곤 {polygonCount ?? '?'}개
      </div>

      <Legend />
    </>
  );
}

function CashRangeSlider({
  min,
  max,
  onChange,
  cashDelta,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
  cashDelta: { added: number; removed: number } | null;
}) {
  // 실시간 색칠 — cash 필터는 클라 사이드라 network latency 0.
  // onValueChange 매 호출마다 즉시 onChange → 부모 query 갱신 → useEffect로 즉시 map feature-state 갱신.
  const [draft, setDraft] = useState<[number, number]>([min, max]);
  // 부모(query) 변경에 동기화
  useEffect(() => {
    setDraft([min, max]);
  }, [min, max]);

  function handleValueChange(v: number[]) {
    const next: [number, number] = [v[0], v[1]];
    setDraft(next);
    onChange(next[0], next[1]);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 11,
          color: '#555',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>
          자금 범위: <strong>{formatMan(draft[0])} ~ {formatMan(draft[1])}</strong>
        </span>
        <CashDeltaChip delta={cashDelta} />
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
          onValueChange={handleValueChange}
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
        <span>{formatMan(CASH_MIN)}</span>
        <span>{formatMan(CASH_MAX)}</span>
      </div>
    </div>
  );
}

function LoadingOverlay({
  polygonCount,
  affordableReady,
}: {
  polygonCount: number | null;
  affordableReady: boolean;
}) {
  // 단계 표시 — 폴리곤 → 거래 데이터 순서로 진행. 어떤 단계에서 막혔는지 사용자가 알 수 있게.
  const stage = polygonCount === null
    ? '서울 467개 법정동 경계 로드 중...'
    : !affordableReady
      ? '동별 거래 데이터 분석 중...'
      : '준비 완료';
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(255, 255, 255, 0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5,
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        pointerEvents: 'none',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          aria-hidden
          style={{
            width: 36,
            height: 36,
            margin: '0 auto',
            border: '3px solid rgba(45, 138, 79, 0.18)',
            borderTopColor: '#2d8a4f',
            borderRadius: '50%',
            animation: 'eodigakka-spin 0.9s linear infinite',
          }}
        />
        <div style={{ fontSize: 13, fontWeight: 600, color: '#2d8a4f', marginTop: 14 }}>
          지도 준비 중
        </div>
        <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{stage}</div>
        <div style={{ fontSize: 10, color: '#999', marginTop: 6 }}>
          {polygonCount === null ? '경계 0/467' : `경계 ${polygonCount}/467`}
          {' · '}
          {affordableReady ? '거래 데이터 ✓' : '거래 데이터 …'}
        </div>
      </div>
    </div>
  );
}

function Footer({
  dataFreshness,
}: {
  dataFreshness: string | null;
}) {
  // 페이지 하단 일반 푸터(non-floating). 면책 한 줄 + 데이터/버전 한 줄.
  // 두 줄 모두 작은 폰트로 가독성 해치지 않게.
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const sha = process.env.NEXT_PUBLIC_GIT_SHA;
  const versionLabel = [version && `v${version}`, sha && `#${sha}`].filter(Boolean).join(' ');
  return (
    <footer
      style={{
        flexShrink: 0,
        padding: '8px 14px',
        background: '#fafafa',
        borderTop: '1px solid #e2e2e2',
        fontSize: 10.5,
        lineHeight: 1.55,
        color: '#444',
      }}
    >
      <div style={{ color: '#777', marginBottom: 2 }}>
        <span style={{ color: '#a13030', fontWeight: 600 }}>면책:</span>{' '}
        이 사이트는 임장 후보를 색칠지도로 제시할 뿐, 매매 권유나 투자 자문이 아닙니다.
        결과는 RTMS 신고분 기준 통계로 단정문이 아닌 후보 제시이며, 실제 거래 판단은 사용자 본인 책임.
      </div>
      <div>
        <span style={{ color: '#777' }}>데이터:</span>{' '}
        <a
          href="https://www.data.go.kr/data/15126474/openapi.do"
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: '#2d6da3', textDecoration: 'none' }}
        >
          국토교통부 RTMS
        </a>
        {' · '}
        <a
          href="https://www.vworld.kr/dtmk/dtmk_ntads_s002.do?dsId=30603"
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: '#2d6da3', textDecoration: 'none' }}
        >
          V-World LSMD 법정동
        </a>
        {' · '}
        <span style={{ color: '#777' }}>지도 © Mapbox/OpenStreetMap</span>
        {dataFreshness && (
          <span
            style={{
              color: '#666',
              marginLeft: 8,
              paddingLeft: 8,
              borderLeft: '1px solid rgba(0,0,0,0.12)',
            }}
            title="데이터 최신 업데이트"
          >
            {dataFreshness}
          </span>
        )}
        {versionLabel && (
          <span
            style={{
              color: '#888',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 9.5,
              marginLeft: 8,
              paddingLeft: 8,
              borderLeft: '1px solid rgba(0,0,0,0.12)',
            }}
            title="앱 버전 / git commit"
          >
            {versionLabel}
          </span>
        )}
      </div>
    </footer>
  );
}

function CashDeltaChip({
  delta,
}: {
  delta: { added: number; removed: number } | null;
}) {
  // delta가 null이면 자리만 차지하지 않도록 빈 fragment.
  // 1.8s 후 부모가 null로 바꿔 자연 fade-out — CSS opacity transition으로 부드럽게.
  const visible = delta !== null && (delta.added > 0 || delta.removed > 0);
  return (
    <span
      aria-live="polite"
      aria-hidden={!visible}
      style={{
        display: 'inline-flex',
        gap: 4,
        opacity: visible ? 1 : 0,
        transition: 'opacity 220ms ease-out',
        pointerEvents: 'none',
      }}
    >
      {delta && delta.added > 0 && (
        <span
          style={{
            background: '#e6f4e8',
            color: '#1f6e3a',
            border: '1px solid #b6dcc1',
            padding: '1px 7px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.4,
          }}
          title={`방금 추가된 동 ${delta.added}개`}
        >
          +{delta.added}
        </span>
      )}
      {delta && delta.removed > 0 && (
        <span
          style={{
            background: '#fbeaea',
            color: '#a13030',
            border: '1px solid #eebebe',
            padding: '1px 7px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.4,
          }}
          title={`방금 빠진 동 ${delta.removed}개`}
        >
          −{delta.removed}
        </span>
      )}
    </span>
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
  size,
  onClose,
}: {
  bjdCode: string;
  dong: AffordableDongResponse | null;
  details: DongDetailsResponse | null;
  loading: boolean;
  mode: QueryMode;
  size: SizeOption;
  onModeChange: (mode: QueryMode) => void;
  onClose: () => void;
}) {
  const top5 = mode === 'trade' ? details?.trade_top5 : details?.jeonse_top5;
  const isNarrow = useIsNarrow();

  const asideStyle: React.CSSProperties = isNarrow
    ? {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '80vh',
        padding: '8px 16px 16px',
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        borderRadius: '16px 16px 0 0',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.18)',
        zIndex: 3,
        overflowY: 'auto',
        fontSize: 13,
      }
    : {
        position: 'absolute',
        top: 12,
        right: 60,
        bottom: 12,
        width: 360,
        padding: '14px 16px',
        background: 'rgba(255,255,255,0.86)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        borderRadius: 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
        zIndex: 2,
        overflowY: 'auto',
        fontSize: 13,
      };

  return (
    <>
      {isNarrow && (
        <button
          type="button"
          onClick={onClose}
          aria-label="동 상세 닫기"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            zIndex: 2,
          }}
        />
      )}
      <aside
        style={asideStyle}
        role="complementary"
        aria-label="동 상세"
      >
        {isNarrow && (
          <div
            aria-hidden
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: '#d0d0d0',
              margin: '4px auto 10px',
            }}
          />
        )}
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
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              color: '#666',
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

      {dong && <EvidenceCard dong={dong} mode={mode} />}

      {details && details.distributions.length > 0 && (
        <DistributionChart distributions={details.distributions} mode={mode} size={size} />
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

      <RecentTxSections
        trades={details?.recent_trades}
        jeonse={details?.recent_jeonse}
        loading={loading}
      />

      {details && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#888' }}>
          {details.evidence}
        </div>
      )}
      </aside>
    </>
  );
}

// 박스플롯: 매매·전세를 같은 가로축으로 비교. size='all'이면 매칭되는 가장 거래수 많은 버킷 사용.
function DistributionChart({
  distributions,
  mode,
  size,
}: {
  distributions: DongDistribution[];
  mode: QueryMode;
  size: SizeOption;
}) {
  function pickFor(m: 'TRADE' | 'JEONSE'): DongDistribution | null {
    const candidates = distributions.filter((d) => d.mode === m);
    if (candidates.length === 0) return null;
    if (size === 'all') {
      // 표본이 가장 많은 버킷 선택
      return candidates.reduce((a, b) => (a.tx_count_3m >= b.tx_count_3m ? a : b));
    }
    return candidates.find((d) => d.size_bucket === size) ?? null;
  }

  const trade = pickFor('TRADE');
  const jeonse = pickFor('JEONSE');
  const series: Array<{ label: string; color: string; row: DongDistribution; primary: boolean }> = [];
  if (trade) series.push({ label: '매매', color: MODE_ACCENT.trade, row: trade, primary: mode === 'trade' });
  if (jeonse) series.push({ label: '전세', color: MODE_ACCENT.jeonse, row: jeonse, primary: mode === 'jeonse' });

  if (series.length === 0) return null;

  const usable = series.filter((s) => s.row.p25_man != null && s.row.p75_man != null);
  if (usable.length === 0) {
    return (
      <div style={{ marginTop: 12, padding: '6px 8px', fontSize: 11, color: '#888', background: '#fafafa', borderRadius: 4 }}>
        분포 차트: 표본 부족 (p25/p75 산출 불가)
      </div>
    );
  }

  // 공통 x축 범위: 모든 시리즈의 p25~p75를 포함, 양쪽 5% 패딩
  const lo = Math.min(...usable.map((s) => s.row.p25_man as number));
  const hi = Math.max(...usable.map((s) => s.row.p75_man as number));
  const span = Math.max(hi - lo, 1);
  const pad = span * 0.05;
  const xMin = lo - pad;
  const xMax = hi + pad;
  const xRange = xMax - xMin;

  const W = 320;
  const H = 28; // per row
  const PAD_L = 36;
  const PAD_R = 8;
  const innerW = W - PAD_L - PAD_R;
  function x(v: number) {
    return PAD_L + ((v - xMin) / xRange) * innerW;
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        가격 분포 (p25 · 중위 · p75)
        <span style={{ fontSize: 10, color: '#888', fontWeight: 400, marginLeft: 6 }}>
          {size === 'all' ? '최대 표본 버킷' : `${size}형`}
        </span>
      </div>
      <svg
        width={W}
        height={H * series.length + 18}
        viewBox={`0 0 ${W} ${H * series.length + 18}`}
        role="img"
        aria-label="가격 분포 박스플롯"
        style={{ display: 'block', maxWidth: '100%' }}
      >
        {series.map((s, i) => {
          const cy = i * H + H / 2;
          const r = s.row;
          if (r.p25_man == null || r.p75_man == null || r.median_man == null) {
            return (
              <g key={s.label}>
                <text x={4} y={cy + 4} fontSize="11" fill={s.color} fontWeight={s.primary ? 700 : 400}>
                  {s.label}
                </text>
                <text x={PAD_L} y={cy + 4} fontSize="10" fill="#999">
                  표본 부족 ({r.tx_count_3m}건)
                </text>
              </g>
            );
          }
          const x25 = x(r.p25_man);
          const x50 = x(r.median_man);
          const x75 = x(r.p75_man);
          return (
            <g key={s.label} opacity={s.primary ? 1 : 0.55}>
              <text x={4} y={cy + 4} fontSize="11" fill={s.color} fontWeight={s.primary ? 700 : 400}>
                {s.label}
              </text>
              {/* IQR box */}
              <rect
                x={x25}
                y={cy - 7}
                width={Math.max(x75 - x25, 1)}
                height={14}
                fill={s.color}
                fillOpacity={0.18}
                stroke={s.color}
                strokeWidth={1}
              />
              {/* median */}
              <line x1={x50} x2={x50} y1={cy - 8} y2={cy + 8} stroke={s.color} strokeWidth={2} />
              {/* p25 / p75 numeric labels */}
              <text x={x25} y={cy - 10} fontSize="9" fill="#666" textAnchor="middle">
                {(r.p25_man / 10000).toFixed(1)}
              </text>
              <text x={x75} y={cy - 10} fontSize="9" fill="#666" textAnchor="middle">
                {(r.p75_man / 10000).toFixed(1)}
              </text>
              <text x={x50} y={cy + 18} fontSize="9" fill={s.color} textAnchor="middle" fontWeight={600}>
                {(r.median_man / 10000).toFixed(1)}억 · {r.tx_count_3m}건
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type ChipTone = 'high' | 'low' | 'insufficient' | 'neutral' | 'warn';

const CHIP_PALETTE: Record<ChipTone, { bg: string; fg: string; border: string }> = {
  high: { bg: '#e6f4e8', fg: '#1f6e3a', border: '#b6dcc1' },
  low: { bg: '#fff4d6', fg: '#7a5a16', border: '#e6cc8a' },
  insufficient: { bg: '#f0f0f0', fg: '#555', border: '#d0d0d0' },
  neutral: { bg: '#eef2f7', fg: '#3a4a5d', border: '#c7d4e2' },
  warn: { bg: '#fbeaea', fg: '#a13030', border: '#eebebe' },
};

const CONFIDENCE_LABEL: Record<'high' | 'low' | 'insufficient', string> = {
  high: '신뢰도 high',
  low: '신뢰도 low',
  insufficient: '표본 부족',
};

function Chip({ label, tone }: { label: string; tone: ChipTone }) {
  const c = CHIP_PALETTE[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: 1.45,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function EvidenceCard({
  dong,
  mode,
}: {
  dong: AffordableDongResponse;
  mode: QueryMode;
}) {
  const eok = dong.median_man / 10000;
  const showStddevWarn = dong.build_year_stddev != null && dong.build_year_stddev > 10;
  return (
    <div
      style={{
        marginTop: 10,
        padding: '10px 12px',
        background: '#f4f6f4',
        borderLeft: '3px solid #2d8a4f',
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: '#555',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        동 중위 ({mode === 'trade' ? '매매' : '전세'})
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: '#1a1a1a',
          lineHeight: 1.1,
          marginTop: 2,
        }}
      >
        {eok.toFixed(1)}억
      </div>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <Chip label={CONFIDENCE_LABEL[dong.confidence]} tone={dong.confidence} />
        {dong.median_build_year != null && (
          <Chip label={`${dong.median_build_year}년식`} tone="neutral" />
        )}
        {showStddevWarn && <Chip label="⚠ 신구축 혼재" tone="warn" />}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: '#666', lineHeight: 1.5 }}>
        {dong.evidence}
      </div>
    </div>
  );
}

const MODE_ACCENT: Record<QueryMode, string> = {
  trade: '#2d8a4f',
  jeonse: '#5577c8',
};

function RecentTxSections({
  trades,
  jeonse,
  loading,
}: {
  trades: RecentTransaction[] | undefined;
  jeonse: RecentTransaction[] | undefined;
  loading: boolean;
}) {
  const sections = [
    { label: '매매 최근 10건', rows: trades ?? [], accent: MODE_ACCENT.trade },
    { label: '전세 최근 10건', rows: jeonse ?? [], accent: MODE_ACCENT.jeonse },
  ];

  return (
    <div style={{ marginTop: 14 }}>
      {sections.map((section, sectionIndex) => (
        <section key={section.label} style={{ marginTop: sectionIndex === 0 ? 0 : 12 }}>
          <h4
            style={{
              marginTop: 0,
              marginBottom: 6,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: section.accent,
                display: 'inline-block',
              }}
            />
            <span>{section.label}</span>
            {!loading && (
              <span style={{ fontSize: 11, fontWeight: 400, color: '#888' }}>
                {section.rows?.length ?? 0}건
              </span>
            )}
          </h4>
          <div
            style={{
              background: 'rgba(255,255,255,0.55)',
              padding: '8px 10px',
              borderRadius: 6,
            }}
          >
            {loading ? (
              <div style={{ color: '#888', fontSize: 12 }}>로드 중...</div>
            ) : section.rows.length === 0 ? (
              <div style={{ color: '#888', fontSize: 12 }}>최근 거래 없음</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e8e8e8', textAlign: 'left' }}>
                    <th style={{ padding: '4px 2px', fontWeight: 600 }}>단지·평형</th>
                    <th style={{ padding: '4px 2px', fontWeight: 600, textAlign: 'right' }}>금액</th>
                    <th style={{ padding: '4px 2px', fontWeight: 600 }}>일자</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((tx, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
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
          </div>
        </section>
      ))}
    </div>
  );
}

function Legend() {
  const items: Array<{ color: string; label: string; opacity?: number }> = [
    { color: '#2d8a4f', label: '조건 통과 (high)' },
    { color: '#5fa86f', label: 'low confidence', opacity: 0.5 },
    { color: '#7ab582', label: 'IQR null' },
    { color: '#e8b73a', label: 'IQR 분산 가드' },
    { color: '#d04545', label: '전세가율 80%+' },
    { color: '#cccccc', label: '미통과/표본 부족' },
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
