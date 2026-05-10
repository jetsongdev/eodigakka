---
index: 20
slug: whats-new-first-visit-hint
date: 2026-05-11
phase: "Phase 1.5 — 최초 방문/버전 변경 안내"
git_sha: 7f1ec37
viewport: 1920x1080 + 390x844
---

# 20 — 최초 방문 핵심 기능 힌트 + 버전 변경 안내

로컬스토리지의 마지막 접속 버전이 없으면 최초 방문으로 보고, 지도 우하단에 핵심 기능 힌트를 띄우는 상태를 기록했다. 저장된 버전이 현재 앱 버전과 다를 때는 같은 위치에서 새 버전 안내로 분기한다.

## 보이는 것
- 데스크톱: 컨트롤 패널과 푸터는 기존 위치를 유지하고, 우하단에 `FIRST VISIT` 안내 카드가 뜬다.
- 모바일: 접힌 컨트롤 아래로 화면 하단 안내 카드가 떠서 `시작하기` CTA를 바로 누를 수 있다.
- 안내 문구는 매매/전세·평형 전환, 자금 범위 조절, 동 클릭 후 단지 TOP5/최근 거래 확인으로 좁혀져 있다.
- 카드의 닫기 버튼 또는 `시작하기`를 누르면 현재 앱 버전이 `localStorage`에 저장된다.

## 캡처
- `screenshot.png` (1920×1080) — 최초 방문 힌트 카드가 열린 데스크톱 화면
- `screenshot-mobile.png` (390×844) — 최초 방문 힌트 카드가 열린 모바일 화면

## 캡처 조건
- URL: `http://localhost:3000`
- `web/.env.local`은 같은 프로젝트 worktree의 `web/.env.local`을 가리키는 심링크로 추가
- 캡처 전 `localStorage.removeItem('eodigakka:last-seen-version')` 적용
- `NEXT_PUBLIC_MAPBOX_TOKEN`과 `DATABASE_URL`이 적용된 로컬 환경에서 Mapbox 타일, 폴리곤 467개, affordable API 결과 25개 동이 로드된 상태

## 검증
- 이미지 크기: `screenshot.png` 1920×1080, `screenshot-mobile.png` 390×844
- Playwright로 최초 방문 안내 노출, `시작하기` 클릭 후 `eodigakka:last-seen-version=0.11.1` 저장, 재로딩 후 미노출 확인
- Playwright로 이전 버전 `0.10.0` 저장 시 새 버전 안내 노출 및 닫기 후 현재 버전 저장 확인
