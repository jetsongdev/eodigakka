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

export interface AffordableDongResponse {
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

export interface HoverInfo {
  bjdCode: string;
  bjdName: string;
  x: number;
  y: number;
}

// 폴리곤 geometry에서 [[minLng, minLat], [maxLng, maxLat]] 계산. Polygon/MultiPolygon 지원.
// querySourceFeatures는 viewport 안만 반환해서 전 영역 커버 못함 — 캐시한 GeoJSON에서 직접 계산.
function computePolygonBbox(
  geom: GeoJSON.Geometry,
): [[number, number], [number, number]] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (coord: number[]) => {
    if (coord[0] < minX) minX = coord[0];
    if (coord[0] > maxX) maxX = coord[0];
    if (coord[1] < minY) minY = coord[1];
    if (coord[1] > maxY) maxY = coord[1];
  };
  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) for (const c of ring) visit(c);
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) for (const ring of poly) for (const c of ring) visit(c);
  } else {
    return null;
  }
  if (!Number.isFinite(minX)) return null;
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

type MapViewProps = {
  matched: AffordableDongResponse[];
  selectedBjd: string | null;
  isHoverCapable: boolean;
  isNarrow: boolean;
  onHover: (info: HoverInfo | null) => void;
  onSelectBjd: (code: string) => void;
  onPolygonCount: (n: number) => void;
  onError: (msg: string) => void;
};

export default function MapView({
  matched,
  selectedBjd,
  isHoverCapable,
  isNarrow,
  onHover,
  onSelectBjd,
  onPolygonCount,
  onError,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const navControlRef = useRef<mapboxgl.NavigationControl | null>(null);
  const polygonsGeoJsonRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const originalCameraRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const prevSelectedBjdRef = useRef<string | null>(null);
  const prevMatchedSetRef = useRef<Set<string>>(new Set());

  // 1) 지도 + 폴리곤 source/layer 1회 초기화
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      onError('NEXT_PUBLIC_MAPBOX_TOKEN 미설정 — web/.env.local 확인');
      return;
    }
    if (!containerRef.current || mapRef.current) return;

    // WebGL 사전 체크 — 컨텍스트 생성 자체가 실패하면 mapbox `new Map()`이 throw한다.
    // StrictMode + HMR로 누수가 쌓이거나 GPU 가속이 차단된 환경을 즉시 식별.
    const probeCanvas = document.createElement('canvas');
    const probeGl =
      probeCanvas.getContext('webgl2') ||
      probeCanvas.getContext('webgl') ||
      probeCanvas.getContext('experimental-webgl');
    if (!probeGl) {
      onError(
        'WebGL 초기화 실패 — 브라우저가 WebGL 컨텍스트를 거부했습니다.\n\n' +
          '점검 순서:\n' +
          '(1) chrome://settings/system → "그래픽 가속 사용" ON → Chrome 재시작\n' +
          '(2) chrome://gpu → "WebGL: Hardware accelerated" 확인\n' +
          '(3) chrome://flags/#ignore-gpu-blocklist Enabled, #use-angle = Metal\n' +
          '(4) 또는 Safari/Firefox에서 열어보세요.\n\n' +
          '많은 탭이 누적된 dev 세션이면 Chrome 완전 종료 후 재기동이 즉시 회복법.',
      );
      return;
    }

    mapboxgl.accessToken = token;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: SEOUL_CENTER,
        zoom: DEFAULT_ZOOM,
        minZoom: 9,
        maxZoom: 16,
        // 성능 caveat 시에도 컨텍스트 생성 — Apple Silicon 일부 환경에서 보호
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      onError(
        `Mapbox 초기화 실패: ${err instanceof Error ? err.message : String(err)} — 브라우저 재시작 후 다시 시도해 주세요.`,
      );
      return;
    }
    mapRef.current = map;

    // mapbox 내부에서 WebGL 컨텍스트 손실 시 onError 발생 — 명시적으로 처리
    map.on('error', (e) => {
      const msg = e?.error?.message ?? 'mapbox 알 수 없는 오류';
      if (msg.toLowerCase().includes('webgl')) {
        onError(`WebGL 컨텍스트 손실: ${msg} — 새로고침해 주세요.`);
      }
    });

    map.on('load', async () => {
      try {
        const res = await fetch('/api/polygons');
        if (!res.ok) throw new Error(`/api/polygons HTTP ${res.status}`);
        const fc = (await res.json()) as GeoJSON.FeatureCollection;
        polygonsGeoJsonRef.current = fc;

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
              ['==', ['feature-state', 'selected'], true], 0.85,
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
            'line-color': [
              'case',
              ['==', ['feature-state', 'selected'], true], '#0066ff',
              '#666',
            ],
            'line-width': [
              'case',
              ['==', ['feature-state', 'selected'], true], 3,
              0.4,
            ],
          },
        });

        // hover: 커서 + tooltip
        map.on('mousemove', POLYGONS_FILL_LAYER, (e) => {
          if (!e.features?.length) return;
          map.getCanvas().style.cursor = 'pointer';
          const feat = e.features[0];
          const props = feat.properties as { bjd_code?: string; bjd_name?: string } | null;
          if (!props?.bjd_code) return;
          onHover({
            bjdCode: props.bjd_code,
            bjdName: props.bjd_name ?? '',
            x: e.point.x,
            y: e.point.y,
          });
        });
        map.on('mouseleave', POLYGONS_FILL_LAYER, () => {
          map.getCanvas().style.cursor = '';
          onHover(null);
        });

        // click: 사이드패널 열기
        map.on('click', POLYGONS_FILL_LAYER, (e) => {
          if (!e.features?.length) return;
          const feat = e.features[0];
          const props = feat.properties as { bjd_code?: string } | null;
          if (!props?.bjd_code) return;
          onSelectBjd(props.bjd_code);
        });

        onPolygonCount(fc.features?.length ?? 0);
        setMapLoaded(true);
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      // StrictMode / HMR cleanup이 실패해도 ref를 비워야 다음 mount가 init을 진행한다.
      try {
        map.remove();
      } catch {
        // mapbox 내부 cleanup이 실패해도 useEffect cleanup은 throw하지 않는다
      }
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [onError, onHover, onPolygonCount, onSelectBjd]);

  // NavigationControl 위치 — 터치 디바이스(모바일·iPad Mini 등) 좌하단 / 마우스(데스크톱) 우상단.
  // 사이드패널/시트가 우측을 차지해 우상단 zoom이 가려지는 문제 회피 + 엄지 ergonomics.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const position: 'top-right' | 'bottom-left' = isHoverCapable ? 'top-right' : 'bottom-left';
    if (navControlRef.current) {
      map.removeControl(navControlRef.current);
    }
    const control = new mapboxgl.NavigationControl({ showCompass: false });
    map.addControl(control, position);
    navControlRef.current = control;
  }, [isHoverCapable, mapLoaded]);

  // 선택된 동 polygon affordance — bjd_code promoteId 기반 feature-state 토글
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (!map.getSource(POLYGONS_SOURCE_ID)) return;

    if (prevSelectedBjdRef.current) {
      map.setFeatureState(
        { source: POLYGONS_SOURCE_ID, id: prevSelectedBjdRef.current },
        { selected: false },
      );
    }
    if (selectedBjd) {
      map.setFeatureState(
        { source: POLYGONS_SOURCE_ID, id: selectedBjd },
        { selected: true },
      );
    }
    prevSelectedBjdRef.current = selectedBjd;
  }, [selectedBjd, mapLoaded]);

  // 선택 시 폴리곤으로 fitBounds, 닫을 때 원래 카메라로 복귀
  // padding으로 시트 영역 회피 — 모바일은 하단(시트 max 80vh), 데스크톱은 우측(side panel ~420px)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (selectedBjd) {
      // 첫 선택일 때만 카메라 저장 (연속 선택 시 원래 위치 유지)
      if (!originalCameraRef.current) {
        const c = map.getCenter();
        originalCameraRef.current = { center: [c.lng, c.lat], zoom: map.getZoom() };
      }
      const fc = polygonsGeoJsonRef.current;
      const feature = fc?.features.find((f) => f.properties?.bjd_code === selectedBjd);
      const bbox = feature ? computePolygonBbox(feature.geometry) : null;
      if (!bbox) return;

      const container = map.getContainer();
      const w = container.clientWidth;
      const h = container.clientHeight;
      let padding: { top: number; right: number; bottom: number; left: number };
      if (isNarrow) {
        // 모바일 — 시트 max 80vh 하단 점유
        padding = { top: 80, right: 30, bottom: Math.floor(h * 0.78), left: 30 };
      } else if (w <= 1024) {
        // 좁은 데스크톱(iPad Mini portrait/landscape, iPad Pro 11 portrait)
        padding = { top: 360, right: 440, bottom: 80, left: 80 };
      } else {
        // 표준 데스크톱
        padding = { top: 80, right: 480, bottom: 80, left: 80 };
      }

      map.fitBounds(bbox, { padding, duration: 700, maxZoom: 14 });
    } else if (originalCameraRef.current) {
      const { center, zoom } = originalCameraRef.current;
      map.flyTo({ center, zoom, duration: 700 });
      originalCameraRef.current = null;
    }
  }, [selectedBjd, mapLoaded, isNarrow]);

  // matched 변경 시 map feature-state 갱신
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const newSet = new Set(matched.map((d) => d.bjd_code));
    const prev = prevMatchedSetRef.current;

    const tryApply = () => {
      if (!map.getSource(POLYGONS_SOURCE_ID)) {
        map.once('idle', tryApply);
        return;
      }
      // 차분 적용 — prev에 있고 new에 없는 동의 color/matched만 해제. selected는
      // 자연 보존(전체 wipe 회귀 대신). 슬라이더 drag 시 467개 wipe + N개 재투입을
      // |added|+|removed|개 호출로 축소.
      for (const code of prev) {
        if (newSet.has(code)) continue;
        map.removeFeatureState({ source: POLYGONS_SOURCE_ID, id: code }, 'color');
        map.removeFeatureState({ source: POLYGONS_SOURCE_ID, id: code }, 'matched');
      }
      for (const dong of matched) {
        map.setFeatureState(
          { source: POLYGONS_SOURCE_ID, id: dong.bjd_code },
          { color: dong.color, matched: true },
        );
      }
    };
    tryApply();
    prevMatchedSetRef.current = newSet;
  }, [matched, mapLoaded]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
