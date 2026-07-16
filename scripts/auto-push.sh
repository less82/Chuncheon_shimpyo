#!/usr/bin/env bash
# 쉼표 정류장 — 작업 종료 시 현재 브랜치 자동 커밋+푸시
#
# 협업 규칙(AGENTS.md 참고):
#   - 각자 "자기 브랜치"에만 자동 푸시한다. main/master 는 절대 자동 푸시하지 않는다.
#   - main 병합은 PR 리뷰로만 한다.
#
# 안전 가드 3종:
#   1) main/master/HEAD(detached) 이면 아무것도 하지 않음 (공유 브랜치 보호)
#   2) 변경사항이 없으면 빈 커밋을 만들지 않고 종료
#   3) 푸시 실패해도 로컬 커밋은 남고 훅은 정상 종료(작업 흐름 안 막음)
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# git 저장소가 아니면 조용히 종료
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

# 가드 1: 보호 브랜치에서는 자동 푸시 금지
case "$branch" in
  main|master|HEAD)
    echo "{\"systemMessage\": \"⚠️ ${branch} 브랜치라 자동 푸시를 건너뜁니다. 자기 브랜치에서 작업하세요.\", \"suppressOutput\": true}"
    exit 0
    ;;
esac

# 가드 2: 변경사항 없으면 종료
if [ -z "$(git status --porcelain)" ]; then
  echo '{"suppressOutput": true}'
  exit 0
fi

ts=$(date '+%Y-%m-%d %H:%M')
git add -A >/dev/null 2>&1
git commit -q -m "wip(${branch}): 자동저장 ${ts}" >/dev/null 2>&1 || {
  echo '{"suppressOutput": true}'
  exit 0
}

# 가드 3: 푸시(원격 브랜치 없으면 upstream 자동 설정). 실패해도 커밋은 유지.
if git push -q 2>/dev/null; then
  status="푸시 완료"
elif git push -q -u origin "$branch" 2>/dev/null; then
  status="푸시 완료(새 원격 브랜치 생성)"
else
  status="로컬 커밋만 남김(푸시 실패 - 네트워크/권한 확인)"
fi

echo "{\"systemMessage\": \"🔁 [${branch}] ${status} · ${ts}\", \"suppressOutput\": true}"
exit 0
