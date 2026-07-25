# public/works — 작품 갤러리 파일

교실 **작품 갤러리**에 전시되는 학생·선생님의 작품(HTML)을 두는 폴더입니다.
여기 있는 파일은 서버가 `public/`을 그대로 정적 서빙하므로, 각각 아래 형태의 **공개 주소**로 바로 열립니다.

```
/works/<사람슬러그>/<카테고리>.html
예) /works/soobing/intro.html
```

## 폴더 규칙

- **사람별 폴더 1단계** — 폴더 이름은 ASCII 슬러그(영문 소문자/숫자/-)만 사용합니다.
  - 한글 닉네임 학생은 슬러그를 부여합니다. 예: `최승찬 → choi`, `박효진 → park` (겹치면 `park2`).
  - 선생님(soobing)은 `soobing`.
- **파일 이름 = 카테고리 키** (`server/db.js`의 `WORK_CATEGORIES` 순서와 일치)

  | slot | 키          | 파일명           | 갤러리 라벨        |
  |------|-------------|------------------|--------------------|
  | 0    | `intro`     | `intro.html`     | 자기소개           |
  | 1    | `dream`     | `dream.html`     | 나의 꿈은?         |
  | 2    | `game5`     | `game5.html`     | 5년 뒤 나의 미래(게임) |
  | 3    | `webtoon10` | `webtoon10.html` | 10년 뒤 나의 미래(웹툰) |

## 「나의 꿈은」(slot 1) — 영상 작품

`dream.html` 은 **영상 재생기**이고, 영상 자체는 `ffmpeg` 로 따로 빌드합니다.

```
public/works/<슬러그>/
  dream.html              ← 갤러리에 등록되는 페이지 (재생기)
  dream/
    frames/01~05.png      ← AI로 만든 그림 5장          [git 무시]
    bgm.mp3               ← 배경음악                     [git 무시]
    captions.txt          ← 컷당 자막 한 줄
    credits.txt           ← 음악 출처·라이선스 기록
    dream.mp4 · poster.jpg← 빌드 결과물
```

> 원본 그림(~11MB)과 음악(~5MB)은 용량 때문에 **커밋하지 않습니다**(`.gitignore`).
> 저장소에는 결과물인 `dream.mp4` 만 들어갑니다. 다시 빌드해야 하면 음악은
> `credits.txt` 의 URL 로 받고, 그림은 프롬프트로 다시 생성하세요.

```bash
./tools/dream-film/build.sh <슬러그>     # 26초 mp4 생성
```

- 스토리보드와 이미지 생성 프롬프트가 필요하면 Claude 에게
  **"dream-film 으로 &lt;슬러그&gt; 꺼 만들어줘"** 라고 하세요(`.claude/agents/dream-film.md`).
- `dream.mp4` 가 생긴 뒤 서버를 재시작하면 갤러리 칸이 **자동으로 켜집니다**
  (`server/seed.js` 가 파일 존재를 확인합니다).
- 자세한 내용: [`tools/dream-film/README.md`](../../tools/dream-film/README.md)

## DB 연결

작품 파일을 만든 뒤, 그 사람의 갤러리 칸(slot)에 URL을 연결해야 화면에 뜹니다.

- 코드로 고정(권장, 배포에도 유지): `server/seed.js`에서 `Gallery.setWork({ authorId, slot, url, title })`를 멱등하게 호출.
- 즉석: 관리자 소켓 `admin:addWork` (URL은 `isSafeDocUrl` 검증을 통과해야 함 — 위 형태만 허용).

## 주의

- URL은 `server/socket.js`의 `isSafeDocUrl()`이 `^/works/<slug>/<file>.html$` 패턴만 허용합니다. 하위 폴더는 1단계까지.
- 이미지 등 자산이 필요하면 같은 사람 폴더에 두고 상대경로로 참조하세요(예: `/works/soobing/img/photo.png`). 단, 작품 HTML 자체의 등록 URL은 위 규칙을 지켜야 합니다.
