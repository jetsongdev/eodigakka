---
captured: 2026-05-10
topic: Server-Timing 비대칭 패턴으로 prod 인덱스 부재 진단하기
series-candidate: 정글 분석 (2-analysis)
project: eodigakka
---

# Server-Timing 비대칭 패턴으로 prod 인덱스 부재 진단하기

## 현장 메모

Stage 1 PR(#17, v0.8.2) 머지 후 Mr. Song이 production Network 캡처 + 응답 body의 `_timing` 객체를 회수해줌.
6개 sub-query별 분리 측정한 결과가 결정적이었음 — 비교만으로 인덱스 부재 가설이 거의 확정 수준으로 좁혀짐.

### 실측값 (production cold, 2026-05-10)

`/api/dong/[bjd]/complexes` 응답 body `_timing`:

```
dong_name=213    trade_top=223       ← 빠름
recent_trade=1583  recent_jeonse=1481  ← 느림
jeonse_top=1582   distribution=1538   ← 느림
db=1583(=max)
```

`/api/affordable` 응답 body `_timing`:

```
stats=1781  fresh=1604  db=1781(=max)  eval=0.5
```

### 비대칭 1 — 같은 형태, 다른 테이블

- `trade_top` (TOP5 단지, `tx_apt_trade` 테이블, 5,748 rows): **223ms**
- `jeonse_top` (TOP5 단지, `tx_apt_rent` 테이블, 15,295 rows): **1,582ms**

쿼리 형태가 동일한데 7배 차이. row 수 3배 차이만으로 7배 latency 비대칭은 안 나옴. → **두 raw 테이블의 인덱스 정의가 다르다** 강력 시그널.

### 비대칭 2 — 같은 테이블, 다른 쿼리 형태

- `trade_top` (GROUP BY 집계): **223ms**
- `recent_trade` (`WHERE bjd_code=? ORDER BY contract_date DESC LIMIT 10`): **1,583ms**

같은 `tx_apt_trade` 테이블인데 GROUP BY 집계가 7배 빠름. 보통 GROUP BY가 더 무거운데 역전. → ORDER BY 쪽 인덱스 액세스 못 하는 중. `(bjd_code, contract_date DESC)` 복합 인덱스 부재 또는 leading column 미스매치.

### 풀스캔 vs 인덱스 액세스 비율

7배 latency 차이는 풀스캔 vs B-tree 인덱스 액세스의 전형적 비율. 5,748 rows × Seq Scan ≈ 1,500ms (Neon ap-southeast-1 cold pool 환경 보정), index lookup ≈ 200ms.

이미 H 섹션 E 진단(`MAX(contract_date)` Seq Scan 확정, 2026-05-10 Stage 1)과 일관됨. 같은 인덱스 부재 패턴이 ETL이 만드는 raw 테이블 곳곳에 깔려 있다는 의미.

### 글감으로서의 가치

- **Server-Timing 박는 패턴**: 응답 헤더가 Vercel runtime에 strip되는 케이스 대비 응답 body의 `_timing` fallback. 헤더가 안 보이면 진단 자체가 막힘.
- **sub-query별 분리 측정의 가치**: API 단위 측정만 보면 "1.5초 느리다" 끝. sub-query 분리하면 비대칭이 드러나고, 비대칭이 드러나면 가설 좁아짐.
- **EXPLAIN 없이도 90% 진단되는 케이스**: prod 환경에 직접 EXPLAIN 못 박는 환경(Neon 직결 권한·관측 가능성 제약)에서 응답 body 측정값만으로 후보 좁히기.
- **이걸 알게 된 시점**: H 섹션 D(edge cache) + J 섹션 B(인덱스) 동시 PR을 짜기 직전. cache로 cold latency 가리는 게 아니라 그 밑의 풀스캔도 같이 잡아야 cache miss 시에도 사용자가 안 죽음.

## 다음 단계

- [x] jetsong-dev 아이디어 등록됨: `docs/content-ideas/2-analysis/2026-05-10-server-timing-asymmetry-index-diagnosis.md`
- [ ] EXPLAIN ANALYZE 실측 결과 보강 (Stage 2 진단 후 같은 문서에 검증값 추가)
- [ ] 인덱스 추가 후 latency 변화 before/after 캡처 → narrative 완성
- [ ] 초안 작성 시 이 파일 참고
