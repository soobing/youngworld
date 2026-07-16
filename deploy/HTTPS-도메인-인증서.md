# 🔐 HTTPS · 도메인 · 인증서 — 왜 이렇게 했나 (학습용)

> `youngworld-ai.com`(Cloudflare 구매)에 HTTPS를 붙인 과정과, **"왜 Cloudflare 자체 인증서
> 대신 Caddy(Let's Encrypt) 인증서를 썼는지"** 를 나중에 복습할 수 있게 정리한 문서.
> 실제 결과: **https://youngworld-ai.com** (Let's Encrypt 인증서, 자동 갱신, wss 소켓 정상).

---

## 0. 먼저 개념 3개 (비유로)

- **DNS** = 인터넷 전화번호부. "youngworld-ai.com → 43.202.132.145" 처럼 **도메인 이름을 IP로** 바꿔준다.
- **인증서(SSL/TLS)** = 신분증 + 봉투. 브라우저와 서버가 주고받는 내용을 **암호화(봉투)** 하고,
  "이 서버가 진짜 youngworld-ai.com이다"를 **증명(신분증)** 한다. → 주소창 자물쇠 🔒 = https.
- **인증기관(CA)** = 신분증 발급처. **Let's Encrypt** 는 무료로 인증서를 발급해주는 CA.

**HTTP vs HTTPS**: HTTP는 봉투 없이 엽서로 보내는 것 → 중간에서 비밀번호를 훔쳐볼 수 있다.
HTTPS는 봉투에 넣어 암호화 → 공개 서버엔 **필수**.

---

## 1. 우리가 고른 방식: "Cloudflare는 전화번호부만, 암호화는 Caddy가"

### 경로
```
[브라우저] ──(곧장, 암호화)──▶ [우리 서버: Caddy] ──▶ [Node 앱]
        Cloudflare 는 "주소 안내(DNS)"만 하고 트래픽엔 끼지 않음 (= 회색 구름 / DNS only)
```

### Cloudflare에서 한 설정 (DNS 레코드)
| Type | Name | Content | Proxy status | TTL |
|---|---|---|---|---|
| A | `@` | `43.202.132.145` | **DNS only (회색 구름 ☁️)** | Auto |
| A | `www` | `43.202.132.145` | **DNS only (회색 구름 ☁️)** | Auto |

- **A 레코드** = "이 도메인은 이 IP다" 라는 전화번호부 등록.
- **회색 구름(DNS only)** 이 핵심: 트래픽이 Cloudflare를 거치지 않고 **바로 우리 서버로** 온다.
  → 그래야 서버의 Caddy가 Let's Encrypt 인증서를 정상 발급받는다.
- **주황 구름(Proxied)** 으로 두면 Cloudflare가 트래픽을 가로채 **자체 인증서**를 써버려서,
  우리 Caddy의 발급 과정이 꼬인다. (그래서 지금은 Off = 회색.)

### 서버에서 한 일 (Caddy 한 줄 전환)
```bash
# /etc/caddy/Caddyfile 을 도메인 버전으로 교체
youngworld-ai.com, www.youngworld-ai.com {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
# 적용
sudo systemctl reload caddy
```
이게 전부다. Caddy가 자동으로:
1. Let's Encrypt에 "youngworld-ai.com 인증서 주세요" 요청
2. 도메인 소유 증명(80포트로 자동 확인 = ACME HTTP-01 챌린지)
3. 인증서 발급·설치 → **https 즉시 활성화**
4. 80(http) 접속은 **443(https)로 자동 리다이렉트**(308)
5. **~90일마다 자동 갱신** (사람이 할 일 없음)

> 그래서 방화벽에 **80·443 둘 다** 열어둔 것: 443=실제 https, 80=인증서 발급 확인 + https 리다이렉트.

---

## 2. 핵심 질문: 왜 Cloudflare 자체 인증서(주황 구름)를 안 썼나?

### 주황 구름(Proxied) 방식의 구조
```
[브라우저] ──(암호화A)──▶ [Cloudflare] ──(암호화B)──▶ [우리 서버]
              Cloudflare 인증서            ← 이 구간을 따로 맞춰야 함!
```
Cloudflare가 중간에서 트래픽을 **복호화했다가 재암호화**한다. 그래서 **암호화 구간이 둘로 쪼개진다**:
- **A구간(브라우저↔Cloudflare)**: Cloudflare 인증서 (자동, 편함)
- **B구간(Cloudflare↔우리 서버)**: **여기 암호화를 우리가 별도로 설정해야 함**

이 B구간을 어떻게 두냐(= Cloudflare "SSL/TLS 모드")에 따라 갈린다:
- **Flexible**: B구간을 **HTTP(평문)** 로 둠 → 브라우저엔 자물쇠가 보여도
  **Cloudflare~서버 사이는 암호화 안 됨** = 반쪽 보안(❌ 위험, 하지만 흔한 실수).
- **Full / Full(strict)**: B구간도 HTTPS로 → 이러려면 **우리 서버에도 인증서가 필요**.
  → 결국 **Caddy 인증서를 또 깔아야** 한다.

### 그래서 지금 "Caddy 인증서 단독"을 고른 3가지 이유
1. **가장 단순** — 도메인만 A레코드로 걸면 Caddy가 발급·갱신 자동. 실수 여지 최소.
2. **진짜 종단(End-to-End) 암호화** — 브라우저부터 서버까지 **전 구간이 우리 인증서**로 보호.
   (Flexible 모드의 "반쪽 보안" 위험이 원천적으로 없음.)
3. **WebSocket 친화적** — 이 앱은 실시간 소켓이 핵심인데, 중간 프록시 없이 **직결이 가장 안정적**.
   (실제로 `wss://youngworld-ai.com` 소켓 연결 검증 완료.)

### 그럼 Cloudflare 프록시(주황 구름)는 언제 켜나?
트래픽이 커지거나 **DDoS 방어 · CDN 캐싱 · 봇 차단**이 필요해질 때. 그땐:
- 주황 구름 ON + SSL 모드를 **"Full (strict)"** 로 설정
- 그러면 **A구간=Cloudflare 인증서 + B구간=우리 Caddy 인증서** 둘 다 살려서 안전하게 얹을 수 있다.
- 즉 지금 Caddy 인증서를 써둔 게 **나중에 Cloudflare를 얹는 데 방해가 안 되고 오히려 기반**이 된다.

> **한 줄 요약**: 수업용 규모에선 **Caddy 자동 HTTPS가 제일 간단·안전**하고,
> 방어/캐싱이 필요해지면 그때 Cloudflare 프록시를 **추가**하면 된다. (지금 안 쓴다고 손해 없음)

---

## 3. 검증 방법 (복습용 명령)

```bash
# 1) DNS가 우리 IP를 가리키는지
dig +short A youngworld-ai.com @1.1.1.1        # → 43.202.132.145

# 2) https 응답 200
curl -s -o /dev/null -w '%{http_code}\n' https://youngworld-ai.com/

# 3) 인증서 발급자·유효기간 확인 (Let's Encrypt 인지)
echo | openssl s_client -connect youngworld-ai.com:443 -servername youngworld-ai.com 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates
# issuer=... O=Let's Encrypt ...  notAfter=... (약 90일 뒤)

# 4) http → https 자동 리다이렉트 (308/301)
curl -s -o /dev/null -w '%{http_code}\n' http://youngworld-ai.com/

# 5) 보안 웹소켓(wss) 실연결 — 실시간 게임 핵심
#    (게스트 로그인 → world:init 수신되면 OK)
```

실제 검증 결과: 모든 자산 200 · Let's Encrypt 인증서 · http→https 308 · **wss 소켓 연결 성공**. ✅

---

## 4. 용어 한 줄 정리
- **DNS / A레코드**: 도메인 → IP 매핑(전화번호부).
- **TTL**: DNS 결과 캐시 시간. 초기엔 Auto(짧게)가 수정 반영이 빨라 유리.
- **Proxy status(회색/주황 구름)**: 트래픽이 Cloudflare를 통과하는지(주황) 안 하는지(회색).
- **SSL/TLS 인증서**: 암호화 + 서버 신원 증명. 자물쇠 🔒.
- **Let's Encrypt / ACME**: 무료 인증서 발급기관 / 자동 발급 프로토콜.
- **Caddy**: 도메인만 적으면 인증서를 자동 발급·갱신해주는 웹서버(리버스 프록시).
- **Full(strict) 모드**: Cloudflare 프록시를 쓸 때, CF~서버 구간도 유효 인증서로 검증(가장 안전).
