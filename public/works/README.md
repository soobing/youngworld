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

## DB 연결

작품 파일을 만든 뒤, 그 사람의 갤러리 칸(slot)에 URL을 연결해야 화면에 뜹니다.

- 코드로 고정(권장, 배포에도 유지): `server/seed.js`에서 `Gallery.setWork({ authorId, slot, url, title })`를 멱등하게 호출.
- 즉석: 관리자 소켓 `admin:addWork` (URL은 `isSafeDocUrl` 검증을 통과해야 함 — 위 형태만 허용).

## 주의

- URL은 `server/socket.js`의 `isSafeDocUrl()`이 `^/works/<slug>/<file>.html$` 패턴만 허용합니다. 하위 폴더는 1단계까지.
- 이미지 등 자산이 필요하면 같은 사람 폴더에 두고 상대경로로 참조하세요(예: `/works/soobing/img/photo.png`). 단, 작품 HTML 자체의 등록 URL은 위 규칙을 지켜야 합니다.
