---
title: "솔로 프로젝트 GHA workflow에 임의 코드 실행 취약점이 있었다"
date: 2026-05-05
status: draft
tags: [github-actions, security, devops, ci-cd]
---

> 결론부터 — `${{ github.event.pull_request.title }}`를 bash 안에 직접 substitute하면 안 됩니다. 이건 GitHub 공식 docs가 가장 흔한 Actions 취약 패턴 1번으로 분류해놓은 케이스입니다. 솔로 dev 프로젝트라도, private repo라도 마찬가지입니다.

## 시작은 단순한 자동화 욕구였다

부동산 매매 후보 색칠지도 사이드 프로젝트 하나를 굴리고 있다. PR 머지할 때마다 손으로 `npm version patch` 치는 게 귀찮아서, "PR title 보고 알아서 bump하는 GHA workflow 짜자" 정도로 시작했다.

설계는 흔한 Conventional Commits 패턴 그대로다:

| PR title | bump |
|---|---|
| `feat: ...` | minor |
| `fix:`, `chore:`, `docs:`, `ci:` 등 | patch |
| PR body에 `BREAKING CHANGE` | major |

PR title을 읽어서 grep으로 매칭하면 끝. workflow 한 시간이면 짤 줄 알았다.

## 무심코 짠 첫 버전

PR이 머지되면 메타데이터를 한 번 jq로 정리하는 step이 필요했다. event payload에서 title, body, number 셋을 뽑아 JSON으로 묶어 다음 step들에 전달하는 게 깔끔하다 싶어 이렇게 적었다:

```yaml
- name: PR 메타
  env:
    GH_TOKEN: ${{ secrets.RELEASE_PAT }}
  run: |
    PR_NUM="${{ github.event.pull_request.number }}"
    JSON=$(jq -n \
      --arg t "${{ github.event.pull_request.title }}" \
      --arg b "${{ github.event.pull_request.body }}" \
      --arg n "$PR_NUM" \
      '{title:$t, body:$b, number:($n|tonumber)}')
    # ... 이후 GITHUB_OUTPUT 출력
```

YAML, jq, shell이 한 라인에 다 있어 살짝 정신 사납지만 동작은 한다. lint도 통과한다. 근데 advisor한테 한 번 봐달라 했더니 — 즉시 차단 의견이 돌아왔다.

> 이 PR은 머지 전에 멈춰야 합니다. PR title이 attacker-controlled인데 bash 라인에 직접 substitute하고 있습니다. `RELEASE_PAT`까지 노출됩니다.

머리에 한 박자 늦게 들어왔다. "솔로 프로젝트인데 누가 악의적인 PR을 ... 아."

## 진짜로 위험한 건 무엇인가 — 단계별 추적

advisor가 짚은 시뮬레이션을 따라가 봤다. PR title이 다음과 같다고 치자:

```
evil"; rm -rf $RUNNER_WORKSPACE; "
```

GHA가 이 workflow를 실행하는 단계는 다음과 같다:

| 단계 | 내용 | 결과 텍스트 |
|---|---|---|
| 1. YAML 로드 | `${{ ... }}` 발견 | (그대로) |
| 2. **GHA expression 평가** | title을 그대로 substitute | shell script 텍스트에 박힘 |
| 3. shell script 라인 완성 | bash가 받는 텍스트 | `--arg t "evil"; rm -rf $RUNNER_WORKSPACE; ""` |
| 4. bash 파싱 | `"`로 끊고 `;` 으로 명령 분리 | `--arg t "evil"` + `rm -rf $RUNNER_WORKSPACE` + 빈 `""` |
| 5. 실행 | runner에서 `rm -rf` 실행 | 끝 |

핵심은 **GHA expression evaluation이 bash 파싱 전에 일어난다**는 것이다. `${{ }}` 결과는 텍스트 그대로 shell line에 박혀 들어간다. 마치 내가 직접 손으로 PR title을 거기다 베껴 쓴 것과 다를 게 없다.

이 시점에서 env에는 `GH_TOKEN`(=`RELEASE_PAT`)가 set돼 있으니, 임의 코드 실행이 되는 순간 그 시크릿도 같이 새는 게 가능하다. 공격자가 이걸로 main에 직접 push할 수 있게 된다 — branch protection이 있어도 PAT가 admin이면 우회된다.

private repo라 외부에서 PR을 못 열고, 솔로 dev라 누가 악성 PR을 보내겠나? 맞다. 지금 당장은. 근데:

- fork에서 PR을 받게 되는 순간 노출
- 미래에 협업자가 들어오면 그가 알아서 회피해야 함
- 무엇보다 GHA workflow는 한 번 짜면 거의 안 들여다본다 — 잠재 취약점은 그대로 박힌다

## 수정 — env hoist 한 단계

advisor가 권한 fix는 한 단계 우회였다. user-controlled 값은 모두 `env:` 블록으로 hoist하고, bash 안에서는 `"$VAR"` 로만 참조한다:

```yaml
- name: PR 메타
  env:
    GH_TOKEN: ${{ secrets.RELEASE_PAT }}
    PR_TITLE: ${{ github.event.pull_request.title }}
    PR_BODY:  ${{ github.event.pull_request.body }}
    PR_NUM:   ${{ github.event.pull_request.number }}
  run: |
    JSON=$(jq -n --arg t "$PR_TITLE" --arg b "$PR_BODY" --arg n "$PR_NUM" \
      '{title:$t, body:$b, number:($n|tonumber)}')
```

왜 이게 fix가 되느냐 — **bash는 `"$VAR"` 결과를 재파싱하지 않는다**. 즉 PR_TITLE이 `evil"; rm -rf /; "` 라도 bash 입장에선 그게 그냥 한 줄짜리 문자열의 일부일 뿐, 거기에 들어 있는 `;`, `"`, `$()` 등은 전부 literal 문자다.

같은 이유로 다른 step의 `git commit -m "PR #$PR_NUM: $PR_TITLE"` 처럼 변수 보간하는 형태도 안전하다. user input이 어떤 메타문자를 가지고 있어도 그 변수의 값은 한 단어 안에 머문다.

## 곁가지 1 — actionlint

이번 사건 후 `brew install actionlint`로 정적 분석을 추가했다. workflow 파일을 인자로 주면:

```bash
$ actionlint .github/workflows/version-bump.yml
```

shellcheck까지 같이 돌려서 SC2086 같은 word splitting 경고도 잡아준다. 솔로 dev 프로젝트일수록 GHA는 한 번 짜고 잘 안 본다 — 이런 도구를 한 번 박아두면 미래의 자기가 도와준다.

## 곁가지 2 — manual workflow input도 user-controlled다

`workflow_dispatch:` 로 받는 input(예: 복구용 PR 번호)도 같은 함정에 빠질 수 있다. 보통은 본인이 손으로 입력하니 안전해 보이지만, 자동화 스크립트가 거기에 값을 던지게 되는 시점부터 attacker surface가 생긴다. 본 프로젝트의 fix:

```yaml
- name: PR 메타
  env:
    PR_NUM_INPUT: ${{ inputs.pr_number }}
  run: |
    if ! [[ "$PR_NUM_INPUT" =~ ^[0-9]+$ ]]; then
      echo "::error::pr_number must be numeric"
      exit 1
    fi
    PR_NUM="$PR_NUM_INPUT"
```

env hoist + 형식 검증 1줄. 이걸 빠뜨리면 `gh pr view "$PR_NUM"` 호출에서 `PR_NUM`이 `--repo malicious/repo` 같은 flag로 해석돼 다른 repo를 fetch하게 만들 수도 있다. 같은 패밀리의 함정이다.

## 교훈 — 한 줄로 박아두면

> **"user-controlled" 값(PR title/body, issue title/comment, branch name, commit message, workflow input...)은 절대 `${{ }}` 로 bash line에 직접 박지 말 것. env로 hoist하고 `"$VAR"` 로만 참조하라.**

이게 GHA security hardening 1번 룰이다. 솔로 dev든 사내 시스템이든, private이든 public이든 동일하게 적용. 한 줄짜리 우회로 canonical 취약 패턴 하나가 통째로 사라진다.

부수 효과로, 이런 fix를 한 번 박은 PR은 다음 협업자한테도 좋은 패턴 reference가 된다. "왜 굳이 env로 빼놨지?" 라는 의문에 PR commit message 또는 본 글 같은 문서로 답할 수 있게.

---

**참고**:
- GitHub 공식 docs: [Security hardening for GitHub Actions — Using an intermediate environment variable](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-an-intermediate-environment-variable)
- 도입한 워크플로: `.github/workflows/version-bump.yml` (PR #4)
- 정적 분석: [`actionlint`](https://github.com/rhysd/actionlint) (`brew install actionlint`)
