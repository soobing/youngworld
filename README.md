# 🏝️ 영월드 (Youngworld)

AI 진로 멘토링 강의를 위한 **실시간 멀티플레이 웹 게임**.
강원도 영월 산골 섬에서 학생 5명 + 선생님 + 게스트가 함께 지내며, 강의자료와 학생 작품을 이 섬에 올린다. 동물의 숲 같은 컨셉으로, 선생님이 만든 틀을 학생들이 AI로 발전시켜 나간다.

## 빠르게 실행하기

```bash
npm install     # 처음 한 번(better-sqlite3 네이티브 모듈 빌드)
npm start       # 서버 시작 → http://localhost:3000
```

브라우저에서 `http://localhost:3000` 접속 → 이름 고르고 입장.

- 학생/선생님 초기 비밀번호: **1234** (숫자). 처음 로그인하면 새 비번을 정한다.
- 게스트: 비밀번호 없이 입장(구경만 가능).
- 초기 아바타: 학생1 · 학생2 · 학생3 · 학생4 · 학생5(학생), soobing(선생님), 게스트.

### 조작
- **이동**: 방향키 또는 WASD
- **학교 입장**: 왼쪽 위 학교(🏫) 문을 밟으면 교실로 들어간다. 교실 아래 문으로 나온다.
- **칠판**: 교실 앞 칠판의 자료 제목을 클릭 → 강의자료가 크게 열림(Esc로 닫기)
- 오른쪽 아래 버튼: 📱 핸드폰(학생) · 🛠️ 관리(선생님) · 🔒 비번변경

## 수업 날 다른 노트북에서 접속하기 (LAN)

모두 **같은 Wi-Fi** 에 있을 때, 선생님 노트북에서 서버를 켜고 학생들이 접속한다.

1. 선생님 노트북에서 `npm start`
2. 선생님 노트북의 IP 확인
   - mac: `ipconfig getifaddr en0`  (예: `192.168.0.12`)
   - Windows: `ipconfig` → IPv4 주소
3. 학생들은 브라우저에 `http://<선생님-IP>:3000` 입력 (예: `http://192.168.0.12:3000`)

> ⚠️ **첫 실행 시 방화벽 허용 창**이 뜨면 반드시 **허용**을 눌러야 다른 기기가 접속할 수 있다.
> 일부 공용 Wi-Fi 는 기기 간 통신을 막으므로(AP isolation) 수업 전에 미리 테스트하자.

포트를 바꾸려면: `PORT=4000 npm start`

## 폴더 구조

```
server/       백엔드 (Node + Express + Socket.io + SQLite)
  index.js      서버 시작점
  db.js         DB 접근 함수 모음
  schema.sql    테이블 정의
  seed.js       초기 아바타/자료 심기
  auth.js       로그인/비밀번호 API
  permissions.js역할별 권한 규칙
  phone.js      핸드폰(문자/투표/설문) 로직
  socket.js     실시간 이벤트 처리(핵심)
public/       프론트엔드 (브라우저에서 그대로 실행, 빌드 없음)
  index.html    화면 + HTML 패널
  style.css     패널 디자인
  js/
    main.js       시작점(로그인→게임)
    net.js        서버 통신
    state.js      공유 상태
    scenes/       Phaser 씬 (Boot / World / Island / Classroom)
    ui/           HTML UI (login / phone / admin / ppt)
  lectures/     칠판에 거는 강의자료(HTML)
docs/         강의계획서, 구상 문서
```

## 학생이 확장하기 좋은 부분

- **지도 바꾸기**: `public/js/scenes/IslandScene.js` 의 구역 함수(`mountain`·`river`·`plaza`·`path` 등)와 `TREES` 좌표를 바꾸면 지형·숲이 바뀐다.
- **아바타 꾸미기**: `public/js/scenes/BootScene.js` 의 아바타 그리는 코드.
- **새 핸드폰 기능**: `server/phone.js` + `public/js/ui/phone.js`.
- **교실 작품 전시**: `gallery_works` 테이블 + `ClassroomScene.drawGallery()` (3회차 미니게임 연계).

## ⚠️ 주의(교육용 단순화)
비밀번호는 **평문·숫자**로 저장된다(친구들끼리 하는 게임이라 일부러 단순화). 실제 서비스에서는 절대 이렇게 하면 안 되고, 비밀번호는 해시(bcrypt 등)로 저장해야 한다.
