# Recent Transaction Ticker — Design Spec

날짜: 2026-05-10
브랜치: `feat/recent-tx-ticker`
관련 ADR: 없음 (read-only 추가, 기존 청사진 9원리와 충돌 없음)

## 1. 의도

footer 바로 위에 **강북 14구 전체에서 가장 최근에 RTMS로 신고된 거래 50건**을 가로 marquee 티커로 표시한다. 매매·전세 통합, 계약일 역순. 사용자가 "오늘(혹은 최근) 어디서 뭐가 거래됐는지"를 한눈에 보면서 시장 활동·신선도를 체감한다.

기존 동 SidePanel의 "최근 10건"은 **한 동 안에서**의 거래만 보여줘 시장 전체 흐름을 알기 어렵다. 이 티커는 그 공백을 메운다.

## 2. 비목표 (YAGNI)

- 자동 임장 추천·매수 권고 등 단정문 — SPEC ① 위배. 사실 표시만.
- 외부 부동산 사이트(네이버·호갱노노 등) 링크 — SPEC ② 위배.
- 실시간 polling — ETL이 1일 1회 cron이라 의미 없음.
- 매매·전세 분리 토글 — UX 단순성 우선, 모드 라벨 칩으로 구분만.
- 자금 필터·평형 필터와의 연동 — 티커는 상단 ControlPanel과 독립. "전체 시장 흐름" 의도 보존.

## 3. 아키텍처

### 3.1 신규 API: `GET /api/recent`

런타임: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` 기본. **Stage 2b Cache Components 패턴**으로 `'use cache'` 함수에 감싸 ETL `/api/revalidate` webhook이 무효화하도록 한다 (기존 `/api/affordable`·`/api/polygons`와 동일 결).

```sql
SELECT
  'TRADE'        AS mode,
  t.contract_date,
  t.bjd_code,
  p.sigungu,
  p.dong,
  t.complex_name,
  t.area_m2,
  t.price_man    AS amount_man,
  t.floor
FROM tx_apt_trade t
JOIN bjd_polygon p USING (bjd_code)
UNION ALL
SELECT
  'JEONSE'       AS mode,
  r.contract_date,
  r.bjd_code,
  p.sigungu,
  p.dong,
  r.complex_name,
  r.area_m2,
  r.deposit_man  AS amount_man,
  r.floor
FROM tx_apt_rent r
JOIN bjd_polygon p USING (bjd_code)
WHERE r.monthly_man = 0       -- 순수 전세만 (월세·반전세 제외, 기존 mv_dong_stats / /api/dong 라우트와 동일 규칙)
ORDER BY contract_date DESC, id DESC
LIMIT 50;
```

응답:
```ts
type RecentTxItem = {
  mode: 'TRADE' | 'JEONSE';
  contract_date: string;       // 'YYYY-MM-DD'
  bjd_code: string;
  sigungu: string;             // '강북구'
  dong: string;                // '미아동'
  complex_name: string;
  area_m2: number;
  amount_man: number;          // 매매=price_man, 전세=deposit_man
  floor: number | null;
};
type RecentResponse = {
  items: RecentTxItem[];
  generated_at: string;        // ISO
  data_freshness: string;      // 기존 footer 포맷과 동일 문자열 재사용
};
```

### 3.2 데이터 흐름

```
mount (MapPageContent)
  ↓
fetch('/api/recent') 1회
  ↓
setRecentItems(items)
  ↓
<RecentTickerBar items onSelectBjd={setSelectedBjd} />
  ↓
사용자 클릭 → setSelectedBjd(bjd_code)
  ↓
기존 SidePanel useEffect → /api/dong/[bjd]/complexes 자동 fetch
  ↓
SidePanel 표시 (지도 폴리곤 클릭과 완전 동일 경로)
```

추가 polling 없음. ETL 갱신 → `/api/revalidate` webhook → 캐시 무효화 → 다음 페이지 로드 시 신선분 반영.

## 4. UI 컴포넌트

### 4.1 마크업 위치

```tsx
// page.tsx — MapPageContent return의 변경 부분
<div column>
  <div flex:1>{지도 + 절대위치 패널들}</div>
  <RecentTickerBar items={recentItems} onSelectBjd={setSelectedBjd} />  {/* 신규 */}
  <Footer dataFreshness={...} />
</div>
```

footer 위 **독립 row**(absolute 아님). 지도 영역과 겹치지 않음. 높이: 데스크톱 36px, 모바일 28px.

### 4.2 한 항목의 시각

```
[매매] 11/08 · 강북·미아동 · 래미안 84㎡ 13.5억
 ↑모드칩 ↑일자  ↑구·동       ↑단지 평형 금액
```

- 모드 칩: 매매 `#2d8a4f`, 전세 `#5577c8` (기존 `MODE_ACCENT` 재사용)
- 일자: `MM/DD` (5자)
- 위치: `${sigungu.replace('구','')}·${dong}` 예: `강북·미아동`
- 금액: `formatMan` 재사용 — 1억 이상 `13.5억`, 미만 `9000만`
- 항목 간 구분: 옅은 dot `·` (간격 16px)

### 4.3 marquee 구현

순수 CSS keyframes. `overflow: hidden` 컨테이너 안에서 `<ul>`을 두 번 렌더(원본 + 복제) → `transform: translateX(0 → -50%)` 무한 루프 = 이음새 없는 스크롤.

```css
@keyframes ticker-scroll {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.ticker-track {
  display: inline-flex;
  animation: ticker-scroll 172s linear infinite;
  /* 50건 × 평균 240px ≈ 12,000px / 172s ≈ 70px/s — 더 천천히 읽기 좋은 속도 */
}
.ticker-bar:hover .ticker-track,
.ticker-bar:focus-within .ticker-track {
  animation-play-state: paused;
}

@media (prefers-reduced-motion: reduce) {
  .ticker-track { animation: none; }
  .ticker-bar { overflow-x: auto; }   /* 수동 스크롤 폴백 */
}
```

방향: 좌→우. 가장 최근 거래가 왼쪽 끝에 등장 → 사용자 시선이 자연스럽게 "최신 → 과거" 순으로 흐름.

### 4.4 접근성

- 컨테이너: `role="region"` `aria-label="강북 14구 최근 거래 50건"`
- 각 항목: `<button>` (시맨틱). tab 이동 가능, focus 시 marquee 정지
- 항목 `aria-label`: `"매매, 11월 8일, 강북구 미아동 래미안, 84제곱미터, 13억5천만원"` (스크린리더 친화)
- `prefers-reduced-motion: reduce` → animation 제거 + overflow-x: auto 폴백
- 터치 디바이스: marquee가 swipe와 충돌 안 하도록 `pointer-events: auto` 한 항목 단위에만, 컨테이너 자체는 `touch-action: pan-x`

### 4.5 빈 상태·로딩

- 첫 mount~fetch 진행 중: 38px(모바일 28px) 자리만 차지, 텍스트 없음 (점멸 방지)
- 응답 0건 또는 fetch 실패: 컴포넌트 자체 unmount → footer가 그 자리를 메움 (빈 row 만들지 않음)

## 5. 에러 처리

| 시나리오 | 동작 |
|---|---|
| `/api/recent` 5xx/timeout | 컴포넌트 unmount, console.warn만. page-level error banner 건드리지 않음 |
| `items.length === 0` | unmount. 사용자는 footer `data_freshness`로 ETL 상태 확인 |
| ETL kill switch on (`ETL_DISABLED=1`) | DB 데이터는 그대로 → 마지막 신선분 표시. false negative 없음 |
| `bjd_polygon` 매칭 실패 행 | INNER JOIN으로 자동 제외 (응답에 없음) |

원칙: **티커 장애는 silent degrade** — 지도·필터의 핵심 경험을 절대 막지 않는다.

## 6. 테스트

### 6.1 API 단위 (`web/__tests__/api/recent.test.ts`)

- SQL이 매매·전세 UNION → contract_date DESC → LIMIT 50을 만족
- 응답 스키마 (`mode, contract_date, bjd_code, sigungu, dong, complex_name, area_m2, amount_man, floor`) 검증
- raw 테이블 비어있을 때 `items: []` 반환
- `tx_apt_rent.monthly_man > 0` 행은 결과에 포함 안 됨 (월세·반전세 제외 가드)

### 6.2 컴포넌트 단위 (`web/__tests__/components/RecentTickerBar.test.tsx`)

- `items=[]` → null 렌더 (DOM 미존재)
- 항목 클릭 → `onSelectBjd(bjd_code)` 호출
- `prefers-reduced-motion: reduce` 환경에서 animation 제거 + `overflow-x: auto` 적용
- focus 시 `animation-play-state: paused`

### 6.3 E2E 수동 (Preview URL)

1. footer 바로 위 36px row에 marquee 흐름
2. 마우스 hover → 정지, 떼면 재개
3. 항목 클릭 → SidePanel 열림 (지도 폴리곤 클릭과 동일 결과)
4. 모바일 viewport(375×667)에서 28px row
5. macOS "Reduce motion" on → animation off + 가로 swipe 가능

## 7. SPEC 9원리 점검

| 원리 | 점검 |
|---|---|
| ① 단정문 금지 | 사실 표시만 ("강북·미아동 래미안 84㎡ 13.5억"). "추천"·"기회"·"호재" 같은 표현 없음 ✓ |
| ② Apply는 사람만 | 클릭은 SidePanel 열기뿐. 외부 부동산 사이트 링크·자동 임장 추천 없음 ✓ |
| ③ Kill switch 우회 금지 | API는 raw SELECT만. ETL kill switch 동작과 무관 ✓ |
| ④ read-only | `/api/recent` 핸들러는 SELECT only ✓ |

## 8. 변경 파일 (예상)

- `web/app/api/recent/route.ts` (신규)
- `web/components/RecentTickerBar.tsx` (신규)
- `web/app/page.tsx` (state 1개 추가, `<RecentTickerBar />` 1줄 삽입)
- `web/app/globals.css` (`@keyframes ticker-scroll` 추가)
- `web/__tests__/api/recent.test.ts` (신규)
- `web/__tests__/components/RecentTickerBar.test.tsx` (신규)
- `CHANGELOG.md` `## [Unreleased] - 강북 14구 최근 거래 50건 marquee 티커 추가` 1줄

## 9. 배포·릴리스

- PR title: `feat(web): footer 위 강북 14구 최근 거래 50건 marquee 티커`
- version-bump 워크플로가 PR title 기반 minor bump 자동 적용
- Preview URL 검증 → main squash merge → Production rebuild
- TIL은 별도 작성 안 함 (삽질 없으면 생략). marquee 폭 계산·`prefers-reduced-motion` 함정 등 헤매면 그때 작성.
