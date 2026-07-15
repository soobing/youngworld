# 🚀 배포 가이드 — AWS Lightsail 한 대 + Caddy(자동 HTTPS)

이 앱은 **Node 서버 한 대**가 프론트(`public/`)·API(`/api`)·실시간 소켓을 모두 서빙합니다.
그래서 프론트/백을 나누지 않고 **Lightsail 인스턴스 한 대 + 앞단 Caddy**로 배포하는 게 가장 단순·안정적입니다.

```
[사용자] --https(443)--> [Caddy] --http(127.0.0.1:3000)--> [Node(영월드)]
                         └ Let's Encrypt 인증서 자동 발급/갱신, WebSocket 자동 프록시
```

---

## 0. 준비물
- AWS Lightsail 인스턴스 (Ubuntu 22.04, 최소 1GB RAM 권장 — `better-sqlite3` 네이티브 빌드 때문)
- **도메인** 하나 (예: `youngworld.example.com`) — Caddy 자동 HTTPS에 필요
- Lightsail **고정 IP**(Static IP) 발급 후, 도메인 A 레코드를 그 IP로 지정

## 1. Lightsail 방화벽(네트워킹)
인스턴스의 **Networking → IPv4 Firewall**에서 아래만 열기:
- **HTTP 80** (Caddy가 인증서 발급·리다이렉트에 사용)
- **HTTPS 443**
- SSH 22 (관리용)
- ⚠️ **3000 포트는 열지 마세요** — Node는 `127.0.0.1`에만 바인딩되어 Caddy만 접근합니다.

## 2. 서버 접속 & 기본 패키지
```bash
ssh ubuntu@<고정IP>

# Node 20 설치 (nodesource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# better-sqlite3 빌드 도구
sudo apt-get install -y build-essential python3 git
```

## 3. 코드 배포 & 의존성
```bash
cd /home/ubuntu
git clone https://github.com/soobing/youngworld.git
cd youngworld
npm install            # better-sqlite3 네이티브 빌드 포함(몇 분 소요 가능)
```

## 4. systemd 서비스 등록 (자동 실행/재시작)
```bash
sudo cp deploy/youngworld.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now youngworld
sudo systemctl status youngworld      # active (running) 확인
journalctl -u youngworld -f            # 로그 보기
```
> 서비스 유닛은 `HOST=127.0.0.1 PORT=3000`으로 실행하므로 외부에 직접 노출되지 않습니다.

## 5. Caddy 설치 & HTTPS
```bash
# Caddy 공식 저장소
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

# Caddyfile 배치 (도메인 부분을 실제 도메인으로 수정!)
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile        # youngworld.example.com → 내 도메인
sudo systemctl reload caddy
```
도메인 DNS가 이 서버 IP를 가리키고 있으면, Caddy가 **자동으로 인증서를 발급**하고 `https://내도메인` 이 열립니다.

## 6. 배포 직후 필수 조치 🔐
- **선생님 계정 `soobing` 비밀번호 변경** (초기값 1234). 로그인 → ⚙️ 설정 → 내 정보에서 변경.
- 학생 계정 초기 비번(1234)도 안내해 첫 로그인 시 바꾸게 하기.

---

## 업데이트(코드 반영)
```bash
cd /home/ubuntu/youngworld
git pull
npm install            # 의존성 변화 있을 때만
sudo systemctl restart youngworld
```

## 데이터 백업 (중요)
사용자·설문·미션 데이터는 **`youngworld.db`** 파일 하나에 들어 있습니다(git에는 안 올라감).
```bash
# 안전한 백업(WAL 포함 일관성). 정기적으로 받아두세요.
sqlite3 /home/ubuntu/youngworld/youngworld.db ".backup '/home/ubuntu/backup-$(date +%F).db'"
```

## 트러블슈팅
- **502/연결 안 됨**: `systemctl status youngworld` 로 Node가 떠 있는지, `journalctl -u youngworld -f` 로그 확인.
- **인증서 발급 실패**: DNS A레코드가 서버 IP를 정확히 가리키는지, 80/443이 열려 있는지 확인.
- **소켓 끊김**: Caddy는 WebSocket을 자동 프록시하므로 별도 설정 불필요. 그래도 안 되면 Caddy 버전(v2) 확인.
- **`better-sqlite3` 빌드 실패**: `build-essential python3` 설치 여부, Node 20 여부 확인.

## 보안 요약(이미 적용됨)
- 비밀번호 scrypt 해싱 · 세션 14일 만료 · 로그인 8회 실패 시 10분 잠금
- 강의자료/책장 문서 URL은 `/lectures/`·`/guides/`의 `.html`만 허용(임의 HTML iframe 차단)
- Node는 `127.0.0.1`만 바인딩(외부는 Caddy 443으로만)
