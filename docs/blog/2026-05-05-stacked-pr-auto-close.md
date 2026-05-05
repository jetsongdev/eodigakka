---
title: "Stacked PR이 base 브랜치 squash merge로 자동 close되던 날"
date: 2026-05-05
status: draft
tags: [github, git, workflow, devops]
---

> 결론부터 — **PR을 stack(쌓기)한 다음 base 브랜치를 squash merge + delete하면 stacked PR은 자동 close된다.** `gh pr edit --base main`으로 base를 바꾸려 해도 closed PR엔 안 먹는다. 깨끗한 복구는 head 브랜치 rebase + 새 PR 생성.

## 시작은 신중한 PR 분리였다

솔로 사이드 프로젝트에서 한 세션에 연관된 두 작업이 동시에 떨어졌다:

1. **PR #3** — 모바일 hover tooltip 회귀 fix (작은 fix, 명확한 scope)
2. **PR #5** — 버전 bump 자동화 워크플로 + CHANGELOG retrofit (인프라 변경, 같은 세션 advisor 검토 부산물)

두 변경이 한 PR로 들어가면 review가 산만해진다. PR #3은 모바일 검증이 따로 필요하고, PR #5는 인프라라 검증 절차가 다르다. 그래서 **stacked PR**을 골랐다 — PR #5의 base를 PR #3의 head 브랜치(`fix/mobile-hover-tooltip`)로 두는 패턴이다.

```
main
 └─ fix/mobile-hover-tooltip       (PR #3)
     └─ chore/version-automation   (PR #5, base = fix/mobile-hover-tooltip)
```

GitHub UI에서 base 브랜치를 dropdown으로 고를 수 있고 `gh pr create --base fix/mobile-hover-tooltip ...` 한 줄로 끝난다. 이론상 PR #3 머지 후 GitHub이 PR #5의 base를 자동으로 main으로 옮겨준다고 알려져 있다.

## 머지 시점에서 일어난 일

PR #3 검증 끝나고 머지 명령을 쳤다:

```bash
gh pr merge 3 --squash --delete-branch
```

`--squash --delete-branch`은 솔로 dev 표준 옵션이다. squash로 history를 한 commit으로 정리하고, 머지된 feature 브랜치는 즉시 삭제한다.

직후 PR #5 상태를 확인해 보니:

```bash
$ gh pr view 5 --json state,baseRefName,mergeable
{
  "state": "CLOSED",
  "baseRefName": "fix/mobile-hover-tooltip",
  "mergeable": "CONFLICTING"
}
```

**자동 close**. PR #5가 사라졌다.

이유는 단순하다 — PR #5의 base 브랜치(`fix/mobile-hover-tooltip`)가 `--delete-branch`로 삭제됐다. base가 없는 PR은 GitHub이 자동으로 close해버린다.

이론상 GitHub이 base를 main으로 자동 변경해 준다는 글을 본 적 있는데, 실제로는 그러지 않았다. 검색해 보면 GitHub의 동작이 케이스별로 일관적이지 않다는 이슈가 여럿 있다. **stacked PR을 안전하게 보존하려면 PR 머지 흐름의 어딘가에서 명시적으로 base를 옮겨주는 단계가 필요하다.**

## 복구 시도 — gh CLI는 막힌다

가장 자연스러운 복구는 PR #5의 base를 main으로 변경하고 reopen하는 것이다:

```bash
$ gh pr edit 5 --base main
GraphQL: Cannot change the base branch of a closed pull request. (updatePullRequest)

$ gh pr reopen 5
API call failed: GraphQL: Could not open the pull request. (reopenPullRequest)
```

두 줄 다 막혔다. GraphQL API 레벨에서 closed PR의 base 변경을 거부한다. reopen도 base 브랜치가 존재하지 않아 실패한다. 닭이냐 달걀이냐 같은 상태.

이론상 base를 다른 살아있는 브랜치(예: 새로 만든 dummy 브랜치)로 먼저 바꾸면 reopen할 여지가 있을 수도 있다. 하지만 closed 상태라 base 변경 자체가 안 되니 출구가 없다.

## 깨끗한 복구는 새 PR

결국 가장 단순한 길로 갔다:

```bash
# 1. 로컬 head 브랜치를 새 main 위에 rebase
git checkout main
git pull --ff-only origin main
git checkout chore/version-automation
git rebase main
# → 'previously applied commit' (PR #3 squash 결과를 인지) 자동 skip

# 2. force push (lease 안전망)
git push --force-with-lease origin chore/version-automation

# 3. 새 PR 생성
gh pr create --base main --title "..." --body "..."
```

rebase에서 GitHub squash가 합쳐넣은 commit은 자동으로 skip돼 깔끔히 main 위에 chore/version-automation만 남는다. force-with-lease는 동시 push가 있을 때 덮어쓰기를 막아준다. PR 본문은 이전 PR(#4)에서 그대로 복사해 다시 올렸다.

소요 시간 5분. 하지만 PR 번호가 #4 → #5로 건너뛰고, 동일 내용 PR이 둘 생긴다.

## 일반화 — 솔로 dev에서 stacked PR 안전하게 쓰기

다음 번에 또 만날 함정이다. 정리하자면:

| 상황 | 권장 |
|---|---|
| PR을 stack한다면 | base PR 머지 직전에 stacked PR의 base를 main으로 미리 옮겨라 (`gh pr edit <num> --base main`) |
| 또는 | base PR 머지 시 `--delete-branch` 빼고 머지 → stacked PR이 살아남음. 머지 후 따로 브랜치 삭제 |
| 자동 close된 후엔 | base 변경/reopen 안 됨. rebase + 새 PR이 가장 깨끗 |
| force push 시엔 | 항상 `--force-with-lease`. 단순 `--force`는 동시 push를 silently 덮어쓴다 |

권장 순서로는 **base 미리 옮기기 > delete-branch 빼기 > 새 PR**. 첫 번째가 가장 깨끗하지만 까먹기 쉽다. 솔로 dev라면 사실 stacked PR을 굳이 쓸 이유가 그리 많지 않다 — fix와 follow-up이 너무 빠르게 일어나서 분리할 가치가 없는 경우가 더 많다.

## 곁가지 — Vercel 알림에서도 보인다

Vercel은 모든 PR의 head commit에 Preview deploy를 발사한다. PR이 close되면 그 head에 대한 Preview는 자동으로 archive된다. Telegram의 🚀 Preview 토픽 알림 흐름을 보고 있으면, 자동 close 직후에 한 번 더 deploy 알림이 뜬다 — 새 PR이 같은 head를 다시 가리켰기 때문이다.

이 더블 알림은 처음 봤을 때 살짝 헷갈리지만, 사실은 정상 동작이다. 같은 commit에 대한 두 PR이 잠깐 공존하는 시점이 있어서다.

---

**참고**:
- 도입한 워크플로: `.github/workflows/version-bump.yml` (PR #5)
- GitHub docs: [About branch deletion](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-request-merges)
- 비슷한 케이스 다룬 GitHub community 토론: stacked PR 자동 close는 GitHub이 base 브랜치 삭제를 받았을 때의 의도된 동작이다. 사용자가 명시적으로 base를 옮기지 않으면 자동 reparent 안 함.
