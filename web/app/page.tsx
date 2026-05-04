'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

const SEOUL_CENTER: [number, number] = [126.978, 37.5665];
const DEFAULT_ZOOM = 11;

const POLYGONS_SOURCE_ID = 'bjd-polygons';
const POLYGONS_FILL_LAYER = 'bjd-polygons-fill';
const POLYGONS_LINE_LAYER = 'bjd-polygons-line';

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polygonCount, setPolygonCount] = useState<number | null>(null);

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
            'fill-color': '#cccccc',
            'fill-opacity': 0.35,
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

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <header
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.92)',
          borderRadius: 6,
          fontSize: 13,
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          zIndex: 1,
        }}
      >
        <strong>eodigakka</strong> — 임장 후보 색칠지도
        {polygonCount !== null && (
          <span style={{ marginLeft: 8, color: '#555' }}>· 폴리곤 {polygonCount}개</span>
        )}
      </header>

      {error && (
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: 12,
            right: 12,
            padding: '10px 14px',
            background: '#fff5f5',
            border: '1px solid #f5b5b5',
            color: '#922',
            borderRadius: 6,
            zIndex: 1,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
