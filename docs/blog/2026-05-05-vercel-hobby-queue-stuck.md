---
title: "Vercel Preview 빌드가 19분째 Queued였다 — Hobby plan account 큐의 진단법"
date: 2026-05-05
status: draft
tags: [vercel, devops, debugging, hobby-plan]
---

## 한 줄

Vercel preview 빌드가 19분째 Queued. 단일 프로젝트 Deployments 뷰엔 다른 in-progress 빌드가 안 보이는데도. **All Projects 뷰**로 큐 전체를 가시화하고, 가장 오래된 phantom suspect를 cancel하면 dispatcher가 깨어난다.

## 시작

PR을 push했다. Vercel preview 빌드가 30s 안에 시작되어야 정상. 그런데 5분이 지나도 GitHub PR status에 Vercel deployment record가 없다. dashboard를 열어보니 빌드가 `Queued` 상태로 멈춰 있다.

```
8eMmyydG1  eodigakka  Preview  Queued  6m ago   Redeploy of 94WpCGhio
94WpCGhio  eodigakka  Preview  Queued  19m ago  chore/client-token-rotation-skill
5uweBhhpG  eodigakka  Production  Ready 34s  39m ago  ← 마지막 정상 빌드
```

19분째 시작도 안 함. redeploy를 시도했지만 같이 Queued로 합류했다. 빌드 실패가 아니라 시작 자체를 못 한다.

## 1차 진단 — Vercel platform

가장 먼저 의심한 건 글로벌 장애:

```bash
$ curl -s https://www.vercel-status.com/api/v2/status.json
{"status": {"indicator": "none", "description": "All Systems Operational"}}

$ curl -s https://www.vercel-status.com/api/v2/incidents/unresolved.json
{"incidents": []}
```

operational. account scope 문제로 좁혀진다.

## 2차 진단 — All Projects 뷰

여기서 단서를 놓치기 쉽다. 단일 프로젝트(eodigakka) Deployments 뷰엔 visible한 in-progress 빌드가 없다. 그런데 Vercel Hobby plan은 **account-wide 동시 빌드 1개 한도**다 — eodigakka뿐 아니라 같은 account의 다른 프로젝트도 같은 큐를 공유한다.

`vercel.com/<team>/~/deployments`로 All Projects 뷰를 켜면 큐 전체가 드러난다:

```
H6YpA7HoQ  junggu-trash-map  Preview     Queued     5m ago
En8WjTWFa  junggu-trash-map  Production  Queued     8m ago
Fi7kPNgNL  junggu-trash-map  Production  Ready 56s  11m ago  ← 마지막 정상
8eMmyydG1  eodigakka         Preview     Queued     12m ago
94WpCGhio  eodigakka         Preview     Queued     19m ago
8fNK5YFSh  junggu-trash-map  Preview     Queued     20m ago  ← 첫 stuck
2K6xhfBM6  junggu-trash-map  Preview     Ready 45s  23m ago
```

20분 전 `8fNK5YFSh`(junggu-trash-map preview) 시점부터 dispatcher가 worker 할당을 멈췄다. 그 이후 enqueue된 모든 빌드(eodigakka 포함)가 Queued로 누적. visible한 Building 표시는 없는데 dispatcher가 phantom hold 상태.

Vercel UI에 친절히 적혀 있다:

> The build will start once your other Deployments have finished. Pro teams can use On-Demand Concurrent Builds to avoid the queue.

다만 "your other Deployments"가 단일 프로젝트가 아니라 **account 전체** 범위라는 게 함정.

## 3차 진단 — phantom suspect cancel

`8fNK5YFSh`가 가장 오래된 stuck. 이게 dispatcher에서 phantom worker로 잡혀 있는 게 의심된다. cancel 시도:

dashboard → `8fNK5YFSh` 행 → `⋯` → Cancel.

1~2분 관찰. `En8WjTWFa Production Building 22s`로 전환 — dispatcher 깨어남. 큐가 FIFO로 정상 처리되며 우리 PR 빌드도 차례대로 통과 → `Vercel pass` → squash merge.

cancel만으로 dispatcher가 깨어난 게 핵심. 빈 commit push로 fresh 큐 entry를 만들어도 dispatcher가 stuck이면 새 entry도 같이 stuck. 깨우는 것은 cancel이 한다.

## 일반화한 복구 절차

1. **Vercel platform status 먼저** — `curl https://www.vercel-status.com/api/v2/status.json`. operational이면 글로벌 후보 제거.
2. **All Projects 뷰로 큐 전체 가시화** — `vercel.com/<team>/~/deployments`. 단일 프로젝트 뷰는 충분치 않다.
3. **가장 오래된 stuck Queued 1개 cancel** — 그게 phantom suspect. 30분 wait보다 빠르다.
4. **1~2분 관찰** — 다음 큐가 Building으로 전환되면 dispatcher 정상화. 전환 안 되면 다음 phantom suspect cancel.
5. **GitHub PR status에 Vercel record 없을 때**는 빌드가 아직 enqueue 단계라는 뜻 — Vercel은 빌드 시작 시점에야 GitHub Deployments API로 push. PR check만 보면 진단 안 된다.

## 본질적 해결

Hobby plan에서 여러 프로젝트를 동시 운영하면 큐 충돌이 빈번하다. solo dev라도 활성 프로젝트가 2개 이상이면 **Pro plan의 On-Demand Concurrent Builds**가 가치 검토 대상이다 — 빌드 시간이 충돌로 잠깐씩 막히는 비용 vs Pro plan 비용 trade-off.

또는 활성 프로젝트를 별도 account로 분리하는 패턴도 가능. 다만 OAuth·env·domain 관리가 분산되어 운영 비용이 늘어남.

## 참고

- TIL: [`docs/til/2026-05-05-vercel-hobby-queue-stuck.md`](../til/2026-05-05-vercel-hobby-queue-stuck.md)
- 같은 라운드의 Mapbox 토큰 분리 함정: [Mapbox 토큰을 'http://localhost:*'로 잠그려다 만난 wildcard 금지의 벽](./2026-05-05-mapbox-token-url-restriction.md)
