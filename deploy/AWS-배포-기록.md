# 📘 AWS Lightsail 공개 서버 배포 — 처음부터 끝까지 (학습용 기록)

> 이 문서는 영월드를 **AWS Lightsail 한 대 + Caddy(HTTP 프록시)** 로 공개 배포한 실제 과정을,
> 실행한 명령·입력값·**"왜 이렇게 했는지"** 까지 그대로 남긴 복습용 기록이다.
> (실제 배포 결과: **http://43.202.132.145/** , 인스턴스 `youngworld`, 서울 리전)

---

## 0. 큰 그림 — 왜 이 구조인가

이 앱은 **Node 서버 한 대**가 세 가지를 동시에 한다:
1. 프론트엔드 정적 파일(`public/`) 서빙
2. 로그인 API(`/api/...`)
3. **실시간 통신(Socket.io / WebSocket)**

프론트는 `io()`(같은 출처 자동 연결), `fetch('/api/...')`(상대경로), `/socket.io/socket.io.js`(백엔드가 제공)에
**모두 same-origin**으로 묶여 있다. 그래서 프론트(Vercel)/백(Lightsail)을 나누면 CORS·URL 주입·백엔드 HTTPS가
전부 필요해져 오히려 복잡하다. → **"한 대에 전부 + 앞단 리버스 프록시"** 가 가장 단순·안정적.

```
[브라우저] ──http(80)──▶ [Caddy] ──http(127.0.0.1:3000)──▶ [Node(영월드)]
                          └ 리버스 프록시, WebSocket 자동 통과
                          └ (도메인 붙이면 Let's Encrypt로 자동 HTTPS)
```

- **Caddy**: 아파치/Nginx 같은 웹서버. 설정이 짧고, 도메인만 있으면 **HTTPS 인증서를 자동 발급/갱신**해준다.
- **리버스 프록시**: 바깥(80/443) 요청을 받아 내부 앱(3000)으로 넘겨주는 중계자. 앱을 인터넷에 직접 노출하지 않는다.
- Node는 `127.0.0.1:3000`에만 열려서 **오직 Caddy만** 접근 → 보안상 안전.

---

## 1. 사전 준비 (내 노트북)

### 1-1. AWS CLI 설치
```bash
brew install awscli
aws --version    # aws-cli/2.x 확인
```
> `aws` CLI = 터미널에서 AWS를 조작하는 도구. 웹 콘솔로 클릭하는 걸 명령어로 자동화한다.

### 1-2. IAM 자격증명 설정
AWS 콘솔 → **IAM → 사용자 → 보안 자격 증명 → 액세스 키 만들기(CLI 용도)** 로
`Access Key ID` + `Secret Access Key`를 발급(시크릿은 **한 번만** 보여줌).

그다음 **일반 터미널**(Terminal.app)에서 — Claude Code의 `!`는 대화형 입력을 못 받아 EOF 에러가 남:
```bash
aws configure
# AWS Access Key ID     : (발급받은 값)
# AWS Secret Access Key : (발급받은 값)
# Default region name   : ap-northeast-2      ← 서울(한국에서 지연 최소)
# Default output format : json
```
> ⚠️ 액세스 키는 **비밀번호와 같다.** 코드/깃/채팅에 절대 올리지 말 것. 노출되면 즉시 비활성화.

### 1-3. 자격증명·권한 확인
```bash
aws sts get-caller-identity          # 계정 ID/ARN 확인 (키는 안 보임)
aws lightsail get-bundles            # ← 여기서 AccessDenied 나면 권한 부족!
```
처음엔 IAM 사용자에 Lightsail 권한이 없어 `AccessDeniedException`이 났다.
→ IAM 콘솔에서 사용자에게 권한 부여:
- 간단: **`AdministratorAccess`** 정책 연결 (개인 계정)
- 최소권한: 인라인 정책 `{ "Effect":"Allow", "Action":"lightsail:*", "Resource":"*" }`

> **IAM**(Identity and Access Management) = "누가 무엇을 할 수 있나"를 정하는 AWS 권한 시스템.
> 최소권한 원칙: 필요한 것(`lightsail:*`)만 허용하는 게 사고 시 피해가 작다.

---

## 2. 요금제(Bundle) 고르기

```bash
# 활성 Linux 요금제만 보기 좋게
aws lightsail get-bundles \
  --query 'bundles[?isActive==`true`].{Plan:bundleId, USD_month:price, RAM_GB:ramSizeInGb, vCPU:cpuCount, Disk_GB:diskSizeInGb}' \
  --output table
```

| 플랜 ID | RAM | vCPU | 디스크 | 월 요금 | 비고 |
|---|---|---|---|---|---|
| `micro_3_0` | 1GB | 2 | 40GB | $7 | 빌드 시 메모리 빠듯 |
| **`small_3_0`** ⭐ | **2GB** | 2 | 60GB | **$12** | **선택** |
| `medium_3_0` | 4GB | 2 | 80GB | $24 | |

> **왜 2GB?** 이 앱은 `better-sqlite3`라는 **네이티브 모듈**을 쓴다. 설치(`npm install`) 때
> C++ 코드를 **직접 컴파일**하는데, 1GB에선 메모리가 모자라 실패하기도 한다. 2GB면 안전.
> (Lightsail은 보통 특정 플랜을 **첫 3개월 무료**로 준다.)

---

## 3. 부팅 자동설치 스크립트 (user-data)

인스턴스가 **처음 켜질 때 딱 한 번** 실행되는 스크립트(`user-data`)로,
Node 설치 → 코드 clone → 의존성 설치 → 서비스 등록 → Caddy 설정까지 **전부 자동화**했다.
(파일: `deploy/` 폴더의 내용과 동일. 실제 배포엔 아래 스크립트를 넘겼다.)

```bash
#!/bin/bash
set -e
exec > /var/log/youngworld-setup.log 2>&1   # 설치 로그를 파일로 남김(문제 시 확인용)

export DEBIAN_FRONTEND=noninteractive
apt-get update -y

# 1) Node 20 + 빌드툴(better-sqlite3 컴파일용)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs build-essential python3 git

# 2) 코드 배포 (ubuntu 사용자 홈)
cd /home/ubuntu
sudo -u ubuntu git clone https://github.com/soobing/youngworld.git
cd youngworld
sudo -u ubuntu npm install --no-audit --no-fund

# 3) systemd 서비스 등록 (죽으면 자동 재시작, 재부팅 시 자동 실행)
cp deploy/youngworld.service /etc/systemd/system/youngworld.service
systemctl daemon-reload
systemctl enable --now youngworld

# 4) Caddy 설치
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y && apt-get install -y caddy

# 5) 도메인이 없어 우선 HTTP(:80) 프록시. (도메인 붙이면 :80 → 도메인 으로 바꾸면 자동 HTTPS)
cat > /etc/caddy/Caddyfile <<'CADDY'
:80 {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
CADDY
systemctl reload caddy || systemctl restart caddy
```

> **systemd** = 리눅스의 "프로그램 관리자". `youngworld.service`로 등록해두면
> 서버가 죽어도 자동 재시작하고, 재부팅해도 알아서 다시 켜진다.
> 서비스 유닛은 `Environment=HOST=127.0.0.1 PORT=3000` 이라 앱이 외부에 직접 안 열리고 Caddy만 접근.

---

## 4. 인스턴스 생성 (핵심 명령)

```bash
# 사용 가능한 Ubuntu 이미지(blueprint) 확인
aws lightsail get-blueprints \
  --query "blueprints[?contains(blueprintId,'ubuntu') && isActive].{id:blueprintId,version:version}" \
  --output table
# → ubuntu_22_04, ubuntu_24_04

# 인스턴스 생성 (요금 발생 시작!)
aws lightsail create-instances \
  --instance-names youngworld \
  --availability-zone ap-northeast-2a \
  --blueprint-id ubuntu_22_04 \
  --bundle-id small_3_0 \
  --user-data "$(cat launch.sh)"      # ← 위 부팅 스크립트를 통째로 전달
```
- `--availability-zone ap-northeast-2a`: 서울 리전의 a 데이터센터.
- `--blueprint-id`: OS 이미지. `--bundle-id`: 요금제(하드웨어 사양).
- `--user-data`: 부팅 시 실행할 스크립트.

### 상태·IP 확인
```bash
aws lightsail get-instance --instance-name youngworld \
  --query 'instance.{state:state.name, publicIp:publicIpAddress}' --output table
# state: running, publicIp: (동적 IP)
```

---

## 5. 방화벽 열기 + 고정 IP

### 5-1. 포트 열기
```bash
aws lightsail put-instance-public-ports --instance-name youngworld --port-infos \
  '[{"fromPort":80,"toPort":80,"protocol":"tcp"},
    {"fromPort":443,"toPort":443,"protocol":"tcp"},
    {"fromPort":22,"toPort":22,"protocol":"tcp"}]'
```
- **80**: HTTP(지금 접속). **443**: HTTPS(나중 도메인용). **22**: SSH(관리 접속).
- ⚠️ **3000은 안 연다** — 앱은 내부(127.0.0.1)에서만 돌고 Caddy만 접근하므로 외부에 노출할 필요가 없다(공격 표면 축소).

### 5-2. 고정 IP (Static IP)
```bash
aws lightsail allocate-static-ip --static-ip-name youngworld-ip
aws lightsail attach-static-ip   --static-ip-name youngworld-ip --instance-name youngworld
aws lightsail get-static-ip      --static-ip-name youngworld-ip --query 'staticIp.ipAddress' --output text
# → 43.202.132.145
```
> 기본 공인 IP는 인스턴스를 껐다 켜면 **바뀔 수 있다.** 고정 IP를 붙이면 **항상 같은 주소**라
> 도메인 연결·북마크가 안정적이다. (Lightsail 고정 IP는 인스턴스에 붙여두면 무료.)

---

## 6. 배포 검증

```bash
IP=43.202.132.145
# 정적/API/소켓 라이브러리 응답 확인 (전부 200이어야 함)
for u in / /style.css /js/main.js /socket.io/socket.io.js; do
  echo "$u -> $(curl -s -o /dev/null -w '%{http_code}' http://$IP$u)"
done
curl -s http://$IP/api/avatars | head -c 200     # 로그인용 아바타 목록(가명 학생1~5)
```
브라우저(또는 JS)로 **게스트 로그인 → 소켓 `world:init` 수신**까지 확인 → 실시간 통신 OK.

결과: 모든 자산 200, API 정상, **소켓 연결 성공**. ✅

---

## 7. 배포 후 꼭 할 일 🔐

1. **`soobing` 초기 비밀번호(1234) 변경**: 접속 → soobing 로그인 → ⚙️ 설정 → 내 정보.
2. **HTTPS 붙이기(중요)**: 지금은 HTTP라 비밀번호가 **평문 전송**된다. 실제 공유 전 도메인+HTTPS 권장.
   - 도메인 DNS **A레코드**를 `43.202.132.145`로 지정
   - 서버 SSH 접속 후 `/etc/caddy/Caddyfile` 의 `:80` → `내도메인.com` 으로 변경 → `sudo systemctl reload caddy`
   - → Caddy가 **Let's Encrypt 인증서를 자동 발급**해 `https://내도메인` 이 열림.
3. **기존 `yw-ai-mentoring` 리포 삭제**: 실명 히스토리가 남아 있으므로 정리.

---

## 8. 운영 커맨드 모음 (SSH 접속 후)

```bash
ssh ubuntu@43.202.132.145      # (Lightsail 콘솔에서 SSH 키 다운로드 필요)

# 상태/로그
sudo systemctl status youngworld
journalctl -u youngworld -f
cat /var/log/youngworld-setup.log     # 부팅 설치 로그

# 코드 업데이트 배포
cd /home/ubuntu/youngworld
git pull
npm install            # 의존성 바뀌었을 때만
sudo systemctl restart youngworld

# 데이터 백업 (사용자·설문·미션이 이 파일 하나에)
sqlite3 youngworld.db ".backup '/home/ubuntu/backup-$(date +%F).db'"
```

---

## 9. 비용 정지 (그만 쓸 때)

```bash
# 인스턴스 삭제
aws lightsail delete-instance --instance-name youngworld
# 고정 IP 분리·해제 (안 하면 미사용 고정 IP에 소액 과금)
aws lightsail detach-static-ip  --static-ip-name youngworld-ip
aws lightsail release-static-ip --static-ip-name youngworld-ip
```
> 인스턴스를 **삭제해야** 청구가 멈춘다(단순 정지는 계속 과금될 수 있음). 삭제 전 **데이터 백업**을 먼저!

---

## 10. 용어 한 줄 정리
- **Lightsail**: AWS의 초보자용 간편 VPS(가상 서버). EC2보다 요금·설정이 단순.
- **인스턴스**: 실제로 돌아가는 가상 서버 한 대.
- **Blueprint**: OS/앱 이미지(예: Ubuntu 22.04).
- **Bundle**: 요금제(=CPU·RAM·디스크·전송량 묶음).
- **user-data**: 첫 부팅 때 1회 실행되는 설치 스크립트.
- **Static IP**: 안 바뀌는 고정 공인 IP.
- **리버스 프록시(Caddy)**: 외부 요청을 내부 앱으로 넘겨주는 중계 + HTTPS 자동화.
- **systemd**: 프로그램을 서비스로 등록해 자동 실행/재시작.
- **IAM**: AWS 권한 관리(누가 무엇을 할 수 있나).
