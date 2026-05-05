# TIL: Vercel Hobby plan dispatcher stuck — All Projects 뷰 + cancel로 깨우기

날짜: 2026-05-05

## 현상

PR #6 push 후 Vercel preview 빌드(`94WpCGhio`)가 **19분째 Queued**. 단일 프로젝트(eodigakka) Deployments 뷰엔 다른 in-progress 빌드가 보이지 않는데도 큐가 막힘. 같은 commit 재시도(`8eMmyydG1` redeploy)도 즉시 Queued로 합류. 빌드 실패가 아니라 시작 자체를 못함.

```
8eMmyydG1  eodigakka  Preview  Queued  6m ago   Redeploy of 94WpCGhio
94WpCGhio  eodigakka  Preview  Queued  19m ago  chore/client-token-rotation-skill
5uweBhhpG  eodigakka  Production  Ready 34s  39m ago  ← 마지막 정상 빌드
```

GitHub PR #6 status check도 Vercel deployment record 안 보임 — Vercel은 빌드 시작 시점에야 GitHub Deployments API로 status push.

## 원인

Vercel platform status는 **All Systems Operational** (`vercel-status.com/api/v2/status.json`, incidents 0건) — 글로벌 장애 아님. account scope 문제로 좁혀짐.

`All Projects` 뷰(`vercel.com/<team>/~/deployments`)로 보면 큐 전체가 드러남:

```
H6YpA7HoQ  junggu-trash-map  Preview     Queued     5m ago
En8WjTWFa  junggu-trash-map  Production  Queued     8m ago
Fi7kPNgNL  junggu-trash-map  Production  Ready 56s  11m ago  ← 마지막 정상
8eMmyydG1  eodigakka         Preview     Queued     12m ago
94WpCGhio  eodigakka         Preview     Queued     19m ago
8fNK5YFSh  junggu-trash-map  Preview     Queued     20m ago  ← 첫 stuck
2K6xhfBM6  junggu-trash-map  Preview     Ready 45s  23m ago
```

확인된 사실 둘:

1. **Hobby plan은 account-wide 동시 빌드 1개 한도**. eodigakka뿐 아니라 같은 account의 다른 프로젝트(junggu-trash-map)도 같은 큐를 공유. 어떤 프로젝트의 빌드라도 stuck이면 모든 빌드가 막힘. Vercel UI에 명시: `Pro teams can use On-Demand Concurrent Builds to avoid the queue.`
2. **20분 전 `8fNK5YFSh` 시점부터 dispatcher가 worker 할당을 멈췄다**. 그 이후 enqueue된 모든 빌드가 Queued로 누적. visible한 Building 표시는 없는데 dispatcher 자체가 phantom hold.

## 수정

복구 절차 4단계:

```
1. vercel.com/<team>/~/deployments  ← All Projects 뷰
2. 가장 오래된 stuck Queued 1개 cancel (8fNK5YFSh, 20m ago — phantom suspect)
3. 1~2분 관찰 — 큐 head로 옮겨진 다음 빌드(En8WjTWFa)가 Building으로 전환되면 dispatcher 정상화 확인
4. 중복 redeploy(8eMmyydG1) 등 정리용 cancel
```

`8fNK5YFSh` cancel 직후 `En8WjTWFa Production Building 22s`로 전환 → dispatcher 깨어남 확인. 이후 큐가 FIFO로 정상 처리되며 우리 PR 빌드(`94WpCGhio` → 빈 commit으로 새로 만든 `8rmCVRyvx`)도 차례대로 통과 → `Vercel pass` → squash merge → patch bump v0.5.3.

빈 commit push(`git commit --allow-empty -m "rebuild trigger"`)는 cancel로 dispatcher가 깨어난 뒤엔 불필요했다. cancel만으로 충분.

## 교훈

- **Hobby plan은 account-wide 동시 빌드 1개**. 솔로 dev여도 여러 프로젝트(eodigakka + junggu-trash-map)가 같은 account에 묶여 있으면 큐 충돌이 빈번. Pro plan의 **On-Demand Concurrent Builds**가 본질적 해결 — 활성 프로젝트가 2개 이상이면 가치 검토.
- **Stuck 진단 1단계는 큐 전체 가시화**. 단일 프로젝트 Deployments 뷰에선 visible 빌드가 없어 보여도, `~/deployments` All Projects 뷰에서 다른 프로젝트의 stuck phantom이 큐를 점유 중일 수 있다. 항상 All Projects부터 본다.
- **가장 오래된 phantom suspect 1개 cancel이 dispatcher를 깨운다**. 30분 wait보다 빠르고 확실. cancel 후 1~2분 안에 다음 큐가 Building으로 전환되는지가 정상화 신호. 전환 안 되면 다음 phantom suspect cancel.
- **빈 commit push는 dispatcher가 살아 있을 때만 의미 있다**. dispatcher가 stuck 상태면 새 enqueue도 같이 stuck. 깨우는 것은 cancel이 한다.
- **Vercel platform status는 항상 먼저 확인**. `curl -s https://www.vercel-status.com/api/v2/status.json`이 1줄 진단. Operational이면 글로벌 장애 후보 제거.
- **GitHub PR status에 Vercel deployment 안 보일 때**는 빌드가 아직 enqueue 단계라는 뜻. Vercel은 빌드 시작 시점에야 GitHub Deployments API로 status push. PR check만 보면 진단 안 됨 — Vercel dashboard 직접 본다.
