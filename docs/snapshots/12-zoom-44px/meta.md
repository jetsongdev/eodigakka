---
index: 12
slug: zoom-44px
date: 2026-05-09
phase: "Phase 1 — UX 마무리"
git_sha: 5c38bd1 (clean)
viewport: 1920x1080 (PC) + 390x844 (mobile)
---

# 12 — Mapbox zoom 버튼 30×30 → 44×44 (touch target)

PR #12 commit `16ca2e4`로 적용된 zoom 버튼 사이즈 키우기. mapbox-gl 기본 30×30이 모바일 터치 타겟 권장(44×44) 미만이라 정확도 저하 → globals.css override로 44×44 + 아이콘 background-size 26×26. 모든 viewport 공통 — 데스크톱도 hit area 확대로 사용성 ↑.

## 보이는 것

### 데스크톱 (1920×1080)

- `screenshot-desktop-44px-top-right.png` — 우상단 zoom +/- 두 버튼이 44×44로 명확히 큼. 스냅샷 09(`09-zoom-and-selected-affordance/screenshot-desktop-selected.png`)의 30×30과 비교하면 약 1.5배 사이즈.

### 모바일 viewport (390×844)

- `screenshot-mobile-44px-bottom-left.png` — Playwright는 device emulation 없어 `(hover: hover) and (pointer: fine)`이 true로 매칭 → `useIsHoverCapable=true` → zoom 컨트롤이 우상단에 표시(좌하단 분기 발동 안 됨). 이 한계로 모바일 좌하단 44×44 시각 캡처는 실제 디바이스에서만 가능. CSS override 자체는 모든 viewport에 동일하게 적용됨(우상단 - 박스 사이즈로 확인).

## 무엇이 끝났나

- `web/app/globals.css` — `.mapboxgl-ctrl button.mapboxgl-ctrl-zoom-in/out` width/height 44 + 아이콘 background-size 26×26 override
- e2e 16/16 통과
- DOM 측정으로 데스크톱 1920에서 zoom-in 44×44 확인

## 다음 것

- Mr. Song 실제 모바일/iPad 디바이스에서 좌하단 44×44 시각 확인 (Playwright 한계로 자동 캡처 불가)
- Phase 1 마무리 후 다음 라운드 결정 (A 잔여 햅틱·범례 / H latency 진단·개선 / G 피드백 채널 등)
