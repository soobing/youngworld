# 🛑 Lightsail 인스턴스 잠시 중지하기 + DB 로컬 백업 (2026-11-15 기록)

> 인스턴스 `youngworld`를 잠시 중지하기 전에 "DB가 날아가지 않을까?"를 AWS CLI로 직접 확인하고,
> DB 파일을 맥으로 백업한 과정이다.

---

## 1. 결론

**중지(Stop)만 하면 DB는 그대로 남는다.** 삭제(Delete)만 하지 않으면 된다.

| 항목 | 확인 결과 | 의미 |
|---|---|---|
| 인스턴스 | `youngworld` (Ubuntu 22.04, `small_3_0`, 디스크 60GB) | |
| DB | Lightsail 관리형 DB 없음. SQLite 파일 `/home/ubuntu/youngworld/youngworld.db` | 인스턴스 디스크에 있는 파일이라 중지해도 남는다 |
| 고정 IP | `youngworld-ip` (43.202.132.145) 연결됨 | 다시 켜도 IP가 같아서 도메인/Caddy 설정을 바꿀 필요 없다 |
| 자동 시작 | `systemctl is-enabled youngworld` → `enabled` | 다시 켜면 서버가 자동으로 올라온다 |
| 스냅샷 | 없음 | 인스턴스 밖 백업이 없어서 로컬 백업을 따로 받았다 |

### 알아둘 점
- Lightsail은 **중지 상태에서도 요금이 거의 그대로 나간다.** 비용을 아끼려면 삭제해야 한다(`AWS-배포-기록.md` 9장).
- 스냅샷 요금은 GB당 월 약 $0.05이고, 실제 사용량이 아니라 **디스크 크기(60GB) 기준**으로 잡혀서 월 약 $3이다.
  DB 파일은 100KB 정도라서 스냅샷 대신 DB 파일만 로컬로 받는 쪽을 택했다.

---

## 2. AWS CLI 준비

```bash
brew install awscli
aws configure        # 또는 aws login (브라우저 로그인)
```

- `aws configure`는 입력을 받아야 해서 **일반 터미널 창에서** 실행해야 한다.
- 리전에는 **`ap-northeast-2`** 를 넣는다. `ap-northeast-2a`는 가용 영역(AZ) 이름이라
  `Could not connect to the endpoint URL` 에러가 난다. 잘못 넣었다면:
  ```bash
  aws configure set region ap-northeast-2
  ```

---

## 3. 상태 확인 명령

```bash
# 인스턴스 (상태, 고정 IP 여부, 디스크)
aws lightsail get-instances \
  --query 'instances[].{name:name,state:state.name,ip:publicIpAddress,static:isStaticIp,disk:hardware.disks[0].sizeInGb}' \
  --output table

aws lightsail get-relational-databases   # 관리형 DB 사용 여부 (비어 있으면 안 씀)
aws lightsail get-static-ips             # 고정 IP와 연결된 인스턴스
aws lightsail get-instance-snapshots     # 기존 스냅샷
```

---

## 4. SSH 키 받기

인스턴스는 `LightsailDefaultKeyPair`를 쓴다. CLI로 받을 수 있다.

```bash
(umask 077; aws lightsail download-default-key-pair \
  --query privateKeyBase64 --output text > ~/.ssh/lightsail-youngworld.pem)
chmod 600 ~/.ssh/lightsail-youngworld.pem

ssh -i ~/.ssh/lightsail-youngworld.pem ubuntu@43.202.132.145
```

> 개인 키라서 **리포에 절대 커밋하지 않는다.**

---

## 5. DB 백업을 맥으로 받기

서버에는 `youngworld.db` 외에 `youngworld.db-wal`(최근 변경분)이 있다. 그래서 `cp`로 파일만 복사하면
최근 데이터가 빠질 수 있다. **`sqlite3 .backup`** 으로 WAL까지 합친 사본을 만든 다음 받는다.

```bash
K=~/.ssh/lightsail-youngworld.pem
H=ubuntu@43.202.132.145
TS=$(date +%Y%m%d-%H%M%S)
R=/tmp/youngworld-$TS.db
mkdir -p ~/youngworld-backups

# 1) 서버에서 일관된 사본 생성 + 무결성 검사
ssh -i $K $H "cd ~/youngworld && sqlite3 youngworld.db \".backup '$R'\" && sqlite3 '$R' 'PRAGMA integrity_check;' && sha256sum '$R'"

# 2) 맥으로 받기
scp -i $K $H:$R ~/youngworld-backups/

# 3) 서버 임시 파일 삭제
ssh -i $K $H "rm -f '$R'"

# 4) 맥에서 검증 (서버 해시와 같은지, integrity_check = ok)
shasum -a 256 ~/youngworld-backups/youngworld-$TS.db
sqlite3 ~/youngworld-backups/youngworld-$TS.db "PRAGMA integrity_check;"
```

이번 백업: `~/youngworld-backups/youngworld-20261115-202034.db` (112KB)
- 서버와 로컬의 SHA-256이 같고, `integrity_check` 결과가 `ok`였다.
- 들어 있던 데이터: 아바타 7, 갤러리 작품 18, 게임 점수 39, 회고 피드백 30, 폰 메시지 13 등.

> 백업 이후 중지 전까지 새로 저장된 데이터는 이 파일에 없다. 사용 중이라면 중지 직전에 한 번 더 받는다.

---

## 6. 중지 / 재시작

```bash
aws lightsail stop-instance  --instance-name youngworld
aws lightsail start-instance --instance-name youngworld

# 다시 켠 뒤 확인
ssh -i ~/.ssh/lightsail-youngworld.pem ubuntu@43.202.132.145 'systemctl is-active youngworld'
```

### 복원이 필요할 때
```bash
scp -i ~/.ssh/lightsail-youngworld.pem ~/youngworld-backups/youngworld-<TS>.db ubuntu@43.202.132.145:/tmp/
ssh -i ~/.ssh/lightsail-youngworld.pem ubuntu@43.202.132.145 '
  sudo systemctl stop youngworld &&
  cd ~/youngworld && rm -f youngworld.db-wal youngworld.db-shm &&
  cp /tmp/youngworld-<TS>.db youngworld.db &&
  sudo systemctl start youngworld'
```
