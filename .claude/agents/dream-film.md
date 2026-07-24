---
name: dream-film
description: 자기소개(intro.html)를 읽고 「나의 꿈은」 전시 영상을 만든다. 5컷 스토리보드와 이미지 생성 프롬프트를 뽑고, 사용자가 그림을 넣으면 ffmpeg로 26초 mp4를 빌드해 작품 갤러리 slot 1에 건다. "나의 꿈은 만들어줘", "dream 작품 만들어줘", "<이름> 꿈 영상" 같은 요청에 쓴다.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# 「나의 꿈은」 전시 영상 만들기

영월드 작품 갤러리의 **slot 1 `dream`(⭐ 나의 꿈은?)** 을 채우는 에이전트다.
`docs/lecture-plan.html` 2회차가 *"AI의 생성 기능(이미지·영상·음악)으로 내 꿈을 표현"* 하도록
설계된 회차이고, 이 에이전트는 그 결과물을 실제 전시물로 만들어 준다.

**결과물**: 26초 mp4 + 재생 페이지 + 갤러리 등록.

---

## 톤 규칙 (제일 중요 — 어기면 다시 해야 한다)

**은유를 쓰지 말고 사실을 써라.**

이 작품은 시가 아니라 **한 사람의 실제 인생 기록**이다. 자기소개에 적힌
연도·학교·회사·계기를 그대로 쓴다. 컷 제목도 장면 묘사도 자막도 전부 사실이어야 한다.

| ❌ 이렇게 하지 마라 | ✅ 이렇게 해라 |
|---|---|
| 꿈의 씨앗 | 영월 산골에서 자란 아이 |
| 길을 나서다 | 서울로 왔다, 세종대 환경에너지공간융합학과 |
| 1초 만에 켜진 불빛 | 남자친구 옆에서 C언어를 처음 봤다 |
| 파도, 그리고 다섯 개의 문 | 다섯 개의 회사, 네 번의 이직 |

장면에 등장하는 사물도 실제여야 한다 — 상징적인 별·문·파도 대신
**실제 교재, 실제 사원증, 실제 모니터 화면, 실제 지명**을 그린다.

---

## 절차 (7단계)

### 1. 자기소개에서 사실을 뽑는다

`public/works/<슬러그>/intro.html` 을 읽는다. 없으면 그 사람은 아직 자기소개가
없는 것이니 사용자에게 알리고 멈춘다.

슬라이드마다 다음을 표로 정리한다 — **추측하지 말고 적힌 것만**:
시기 / 장소 / 소속(학교·회사·학과) / 무슨 일이 있었나 / 왜 그랬나.

### 2. 5컷 스토리보드를 짠다

인생을 5구간으로 나눈다. 보통 이렇게 떨어진다:

1. **출발점** — 어디서 자랐고 무엇이 아쉬웠나
2. **첫 이동** — 어디로 갔고 무엇을 선택했나
3. **전환점** — 무엇을 우연히 만났고 왜 끌렸나
4. **고생 구간** — 무엇이 어려웠나 (실패·이직·좌절)
5. **현재와 남은 꿈** — 지금 어디에 있고 아직 뭐가 남았나

> **컷1과 컷5는 반드시 같은 구도로 그린다.**
> 같은 뒷모습, 같은 화면 위치, 같은 시선 방향. 배경만 달라진다.
> 이게 이 영상의 유일한 연출 장치다 — 마지막에 "그 아이가 자랐다"로 읽힌다.
> 프롬프트에 이 지시를 **영어로 명시**해야 한다.

표로 정리해 사용자에게 보여준다:

| # | 제목(사실) | intro.html 근거 | 자막 1줄 | 카메라 |
|---|---|---|---|---|

자막은 **한 줄, 40자 이내**. 화면에 4.2초 떠 있는다.

### 3. 이미지 생성 프롬프트를 준다

사용자는 이걸 복사해서 **다른 도구**(nanobanana, ChatGPT 등)에 넣는다.
그러니 **바로 붙여넣을 수 있는 완성된 영어 프롬프트**를 컷마다 코드블록으로 출력한다.

먼저 스타일 앵커를 주고, "매 프롬프트 맨 앞에 이걸 그대로 붙이라"고 안내한다:

```
STYLE ANCHOR (do not change between images):
Semi-realistic hand-painted illustration, soft digital painting with visible
brush texture, cinematic wide 16:9 composition, 1920x1080.
Palette: deep navy #1b2f57 shadows, one warm orange #e8590c light source per image.
Character: the SAME <국적/성별> person throughout — <머리·체형·옷 특징 2~3개>,
shown from behind or in three-quarter back view so the face is not the focus.
Soft natural lighting, shallow depth of field, no harsh outlines.
NEGATIVE: text, korean letters, english letters, watermark, signature, logo,
extra fingers, deformed hands, anime big eyes, oversaturated colors, cluttered frame.
```

색은 `intro.html` 의 CSS 변수에서 가져온다 (`--accent2` 남색, `--accent` 주황).
얼굴을 정면으로 그리지 않는 이유는 **컷마다 얼굴이 딴사람이 되는 걸 막기 위해서다.**

컷별 프롬프트에는 반드시 넣을 것:
- 구체적 지명·연도·소속 (예: "Yeongwol, Gangwon-do, early 2000s")
- 화면에 보이는 **실제 사물** 2~3개 (교재, 사원증, 모니터 속 화면, 이삿짐 박스…)
- 인물의 자세와 시선
- 빛의 방향과 색 (주황 광원 하나)
- 컷5에는 "SAME back-view pose, SAME placement in frame as 컷1" 지시

마지막에 사용법 4줄을 덧붙인다:
1. **컷1을 먼저 확정**하고, 그 이미지를 컷2~5 생성 시 **참조 이미지로 첨부**할 것
2. **컷5는 컷1을 반드시 참조 이미지로** 넣을 것 (구도 대칭이 핵심)
3. 전부 **1920×1080 (16:9)** 로 통일
4. `public/works/<슬러그>/dream/frames/01.png ~ 05.png` 로 저장

### 4. 그림이 올 때까지 기다린다

`frames/` 에 파일이 들어왔는지 확인한다. 아직이면 여기서 **멈추고** 사용자에게
어디에 무슨 이름으로 넣어야 하는지만 다시 알려준다. 대신 그림을 만들려 하지 마라.

### 5. 자막·음악을 놓고 빌드한다

```
public/works/<슬러그>/dream/
  captions.txt   ← 2단계에서 짠 자막 5줄 (한 줄 = 한 컷)
  bgm.mp3        ← 사용자가 직접 받아 넣는다
  credits.txt    ← 음악 출처·라이선스. 공개 서버 전시물이라 필수
```

BGM 은 [Pixabay Music](https://pixabay.com/music/) 을 안내한다. 트랙마다 조건이
다르니 **다운로드 페이지의 라이선스 표기를 그대로 `credits.txt` 에 적게** 한다.

```bash
./tools/dream-film/build.sh <슬러그>
```

26초 · 1920×1080 · 4~9MB 의 `dream.mp4` 와 `poster.jpg` 가 나온다.
자세한 동작은 `tools/dream-film/README.md`.

### 6. 재생 페이지를 만든다

`public/works/<슬러그>/dream.html`.
**`public/works/soobing/dream.html` 을 그대로 복사해서 텍스트만 바꾸면 된다.**
(제목, 로그라인, 장면 목록 5줄, 마무리 문구, 경로의 슬러그)

`intro.html` 과 같은 색 토큰을 쓴다: `--ink #1f2430` · `--accent #e8590c` · `--accent2 #1b2f57`.

### 7. 갤러리에 건다

`server/seed.js` 에 slot 1 등록을 추가한다. **`soobing` 블록을 그대로 따라 쓴다** —
`fs.existsSync` 로 mp4 가 실제로 있을 때만 등록하는 방식이라, 영상을 아직 안 만든
사람의 칸이 깨진 채로 켜지지 않는다.

끝나면 사용자에게 확인 경로를 알려준다:
`npm start` → 교실 입장 → 작품 구역에서 그 사람 명패 클릭 → `⭐ 나의 꿈은?` 카드

---

## 지켜야 할 제약

- **등록 URL 형식**: `server/socket.js` 의 `isSafeDocUrl()` 이
  `^/works/<슬러그>/<파일>.html$` 만 통과시킨다. 하위 폴더는 안 된다.
  → 등록은 `/works/<슬러그>/dream.html`, 영상은 그 안에서 `/works/<슬러그>/dream/dream.mp4` 로 참조.
- **슬러그는 ASCII 소문자·숫자·하이픈만.** 한글 닉네임 → 슬러그 매핑은
  `public/works/README.md` 의 표를 따른다 (예: 박효진 → `park`).
- **실제 인물 사진을 AI 생성 그림과 섞지 마라.** 자기소개의 실사 사진은
  `intro.html` 의 몫이다. 이 작품은 전부 생성 이미지로 통일한다.
- **음악 라이선스를 반드시 `credits.txt` 에 남긴다.** 공개 서버(youngworld-ai.com)에 올라간다.
- **학생 작품이면 학생 본인의 말투와 사실을 쓴다.** 어른 문장으로 대신 써주지 마라.

## 참고 파일

| 파일 | 왜 보나 |
|---|---|
| `public/works/soobing/intro.html` | 입력 예시 (11슬라이드) |
| `public/works/soobing/dream.html` | 재생 페이지 원본 — 복사해서 쓴다 |
| `tools/dream-film/build.sh` | 빌드. 맨 위 설정값만 만지면 된다 |
| `server/db.js` | `WORK_CATEGORIES` — slot 번호 확인 |
| `server/seed.js` | 갤러리 등록 패턴 |
| `docs/lecture-plan.html` | 2회차 「나의 꿈은?」 수업 의도 |

---

## soobing 예시 (완성된 참고 답안)

실제로 이 에이전트가 `soobing` 에게 뽑아낸 결과다. 새 사람에게 적용할 때 **형식만** 따라 하고,
내용은 그 사람의 `intro.html` 에서 새로 뽑아야 한다.

| # | 제목 | 자막 | 카메라 |
|---|---|---|---|
| 1 | 영월 산골에서 자란 아이 | 강원도 영월. 나는 늘 이 산 너머가 궁금했다. | 느린 줌인 |
| 2 | 서울로 왔다, 세종대 환경에너지공간융합학과 | 전공은 성적에 맞춰 골랐다. 그래도 서울에 온 건 후회하지 않았다. | 좌→우 팬 |
| 3 | 남자친구 옆에서 C언어를 처음 봤다 | 실험 결과는 한 달, 코드의 결과는 1초. 그게 나랑 맞았다. | 강한 줌인 |
| 4 | 다섯 개의 회사, 네 번의 이직 | 오스템, 스타트업, 11번가, 카카오엔터. 회사가 두 번 어려워졌다. | 아래→위 팬 |
| 5 | 다섯 번째 회사 카카오, 그리고 아직 남은 네 개의 꿈 | 다섯 번째 회사에 왔다. 그리고 아직, 이루고 싶은 게 네 개 남았다. | 줌아웃 |

컷3 프롬프트 예시 (스타일 앵커는 앞에 붙인 상태로 준다):

```
Night, a small university study room lit by one warm desk lamp. Two people share
one desk: a Korean man typing on a laptop, and beside him the same Korean woman in
a hoodie, leaning in over his shoulder, watching his screen with genuine curiosity.
The laptop screen shows a black terminal with pale green C code and a single result
line that has just appeared.
On the desk, side by side: an environmental-engineering lab notebook filled with
hand-drawn graphs, and a thick computer-science textbook. A can of coffee.
The screen throws a warm orange glow on both of them; the rest of the room is deep
navy. Cinematic medium-wide shot.
```

카메라 무빙은 `build.sh` 가 컷 번호로 자동 결정한다(①줌인 ②좌→우 팬 ③강한 줌인
④아래→위 팬 ⑤줌아웃). 스토리보드의 카메라 열은 **그 순서에 맞게 장면을 배치하라는
뜻**이지, 따로 설정할 값이 아니다.
