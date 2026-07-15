#!/bin/bash
# =====================================================================
# deploy.sh — 서버에서 실행되는 배포 스크립트 (GitHub Actions가 SSH로 호출)
# 순서: DB 백업 → 코드 갱신 → 의존성 → 재시작 → 헬스체크(실패 시 이전 커밋으로 롤백)
# 데이터(youngworld.db)는 git 밖의 파일이라 건드리지 않는다. 코드만 갱신된다.
# =====================================================================
set -euo pipefail

APP_DIR="/home/ubuntu/youngworld"
BACKUP_DIR="/home/ubuntu/backups"
HEALTH_URL="http://127.0.0.1:3000/"
KEEP_BACKUPS=14   # 최근 N개만 보관

cd "$APP_DIR"

echo "▶ [1/5] DB 백업"
mkdir -p "$BACKUP_DIR"
if [ -f youngworld.db ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  DEST="$BACKUP_DIR/youngworld-$TS.db"
  if command -v sqlite3 >/dev/null 2>&1; then
    # SQLite .backup: WAL까지 반영된 일관성 있는 스냅샷(단순 cp보다 안전)
    sqlite3 youngworld.db ".backup '$DEST'"
  else
    # sqlite3 CLI 가 없으면 파일 복사로 폴백(안전을 위해 WAL/SHM 도 함께 복사)
    echo "  (sqlite3 CLI 없음 → 파일 복사로 백업)"
    cp youngworld.db "$DEST"
    [ -f youngworld.db-wal ] && cp youngworld.db-wal "$DEST-wal" || true
    [ -f youngworld.db-shm ] && cp youngworld.db-shm "$DEST-shm" || true
  fi
  echo "  백업: $DEST"
  # 오래된 백업 정리
  ls -1t "$BACKUP_DIR"/youngworld-*.db 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
else
  echo "  (youngworld.db 없음 — 첫 배포로 간주, 백업 생략)"
fi

echo "▶ [2/5] 롤백 대비: 현재 커밋 기록"
PREV="$(git rev-parse HEAD)"
echo "  현재 커밋: $PREV"

echo "▶ [3/5] 코드 갱신 (git pull)"
git fetch --quiet origin main
git reset --hard origin/main   # 서버에서 임의 변경이 있어도 원격 기준으로 정확히 맞춤

echo "▶ [4/5] 의존성 설치 (변경 시) + 재시작"
# package-lock 기준 재현 설치. 네이티브 모듈(better-sqlite3)도 안전.
npm ci --no-audit --no-fund
sudo systemctl restart youngworld

echo "▶ [5/5] 헬스체크"
ok=""
for i in $(seq 1 15); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)"
  if [ "$code" = "200" ]; then ok="yes"; echo "  헬스체크 통과(200), ${i}회차"; break; fi
  sleep 2
done

if [ -z "$ok" ]; then
  echo "❌ 헬스체크 실패 → 이전 커밋($PREV)으로 롤백"
  git reset --hard "$PREV"
  npm ci --no-audit --no-fund
  sudo systemctl restart youngworld
  echo "↩ 롤백 완료. 배포 중단."
  exit 1
fi

echo "✅ 배포 완료: $(git rev-parse --short HEAD)"
