---
captured: 2026-05-11
topic: Vercel preview deploy quota는 자정 리셋이 아니라 rolling 24h
series-candidate: 정글 실험실
project: eodigakka
---

# Vercel preview deploy quota는 자정 리셋이 아니라 rolling 24h

## 현장 메모

`snapshot + preview + pr` 흐름으로 PR #33을 만들면서 Vercel preview URL을 생성하려고 했다. Git push와 draft PR 생성은 성공했지만 `vercel deploy --yes`는 다음 에러로 실패했다.

```text
Resource is limited - try again in 24 hours (more than 100, code: "api-deployments-free-per-day")
```

처음엔 “몇 시에 초기화되나?”를 물었는데, Vercel 공식 limits 문서와 community 답변을 확인해보니 고정된 UTC/KST 자정 리셋이 아니라 `100 deployments / 86400 seconds` 방식이었다. 즉 마지막으로 quota를 채운 deployment들부터 24시간이 지나며 슬롯이 순차적으로 돌아오는 구조로 봐야 한다.

이 케이스에서 중요한 포인트는 preview deployment도 카운트된다는 것. 작은 PR을 많이 만들거나 v0/agent가 commit을 여러 번 push하면 preview가 계속 생성되고, Hobby plan에서는 금방 100개에 닿는다. PR 본문에는 preview blocker를 명시했고, 실제 preview URL은 다음 날 quota가 풀린 뒤 다시 생성하기로 했다.

관련 작업 맥락:
- 브랜치: `feat/a11y-mobile-sheet-polish`
- PR: `https://github.com/jetsongdev/eodigakka/pull/33`
- 직접 deploy 실패: `api-deployments-free-per-day`
- GitHub integration deployment 목록에도 해당 branch/commit deployment 없음
- 예상 branch alias도 접근 불가: `https://eodigakka-git-feat-a11y-mobile-sheet-polish-jetsongdev.vercel.app/`

## 다음 단계

- [ ] jetsong-dev 아이디어 등록됨: `docs/content-ideas/3-lab/2026-05-11-vercel-preview-deploy-quota-rolling-24h.md`
- [ ] 초안 작성 시 이 파일 참고
