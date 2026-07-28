-- =====================================================================
-- 영월드 데이터베이스 스키마
-- SQLite. 모든 테이블은 CREATE TABLE IF NOT EXISTS 로 안전하게 생성.
-- 학생이 읽기 쉽도록 각 테이블/컬럼에 한글 주석을 달았습니다.
-- =====================================================================

-- 아바타(=사용자). role 로 권한을 구분한다.
--   admin  = 선생님(soobing). 아바타 추가/강의자료 게시/핸드폰 발송 가능
--   student= 학생. 이동/핸드폰 응답 가능
--   guest  = 게스트. 이동/관람만 가능(핸드폰·생성 불가)
CREATE TABLE IF NOT EXISTS avatars (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname     TEXT    NOT NULL UNIQUE,        -- 예: '학생1', 'soobing', '게스트'
  role         TEXT    NOT NULL,               -- 'admin' | 'student' | 'guest'
  password     TEXT,                           -- 숫자 문자열. guest 는 NULL(비밀번호 없음)
  must_change  INTEGER NOT NULL DEFAULT 1,     -- 1이면 첫 로그인 때 비밀번호 변경 필요
  color        TEXT    NOT NULL DEFAULT '#44aaee', -- 아바타 색(간단한 외형 구분용)
  last_x       INTEGER NOT NULL DEFAULT 464,   -- 마지막 위치 x (재접속 시 복원)
  last_y       INTEGER NOT NULL DEFAULT 656,   -- 마지막 위치 y (섬 아래쪽 흙길 = 시작점)
  last_scene   TEXT    NOT NULL DEFAULT 'island', -- 마지막 씬('island' | 'classroom')
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 로그인 세션 토큰. 브라우저 localStorage 에 저장되어 재접속에 쓰인다.
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,              -- 랜덤 16바이트 hex 문자열
  avatar_id  INTEGER NOT NULL REFERENCES avatars(id),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 선생님이 보낸 핸드폰 메시지 1건(원본). 실제 배달은 phone_deliveries 로 fan-out.
CREATE TABLE IF NOT EXISTS phone_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id   INTEGER NOT NULL REFERENCES avatars(id),
  type        TEXT    NOT NULL,                -- 'sms' | 'poll' | 'survey'
  title       TEXT    NOT NULL,
  payload     TEXT    NOT NULL,               -- JSON 문자열. sms=본문 / poll=선택지 / survey=문항들
  target      TEXT    NOT NULL,               -- 'all' | 'individual'
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 메시지가 각 수신자(학생)에게 배달된 기록 + 읽음/응답 상태.
-- 전체 발송이면 학생 수만큼 여러 행이 생긴다.
CREATE TABLE IF NOT EXISTS phone_deliveries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id   INTEGER NOT NULL REFERENCES phone_messages(id),
  recipient_id INTEGER NOT NULL REFERENCES avatars(id),
  is_read      INTEGER NOT NULL DEFAULT 0,     -- 0=안읽음(알람 계속) / 1=읽음
  answered_at  TEXT,                            -- 설문/투표 응답 완료 시각
  UNIQUE(message_id, recipient_id)
);

-- 투표/설문 응답 저장.
CREATE TABLE IF NOT EXISTS phone_responses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id  INTEGER NOT NULL REFERENCES phone_deliveries(id),
  answer       TEXT    NOT NULL,               -- JSON 문자열(투표: 선택 인덱스 / 설문: 답변 배열)
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 교실 칠판에 붙이는 강의자료(HTML). url 은 /lectures/*.html 경로.
CREATE TABLE IF NOT EXISTS lecture_materials (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  url         TEXT    NOT NULL,                -- 예: '/lectures/session1.html'
  session_no  INTEGER,                          -- 1~4 회차
  slot        INTEGER NOT NULL DEFAULT 0,       -- 칠판에서의 표시 순서
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 교실 책장에 꽂는 "How-to 안내 문서"(가입법 등). 칠판과 달리 아무 때나 열람.
--   url 은 /guides/*.html 또는 외부 링크. slot 은 책장에서의 순서.
CREATE TABLE IF NOT EXISTS guide_docs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  slot        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 학생 작품 게임의 점수 기록(랭킹).
--   게임 하나당 game_key 하나를 쓴다(예: 'soobing-game5'). 작품마다 랭킹이 따로 쌓인다.
--   - 로그인한 학생/선생님: avatar_id 가 채워지고 player_name 은 그때의 닉네임.
--   - 게스트: avatar_id 는 NULL 이고, 게임이 끝난 뒤 직접 입력한 이름이 player_name 에 들어간다.
--   기록 조회는 로그인 없이 누구나 할 수 있다(읽기 전용 API).
CREATE TABLE IF NOT EXISTS game_scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_key    TEXT    NOT NULL,               -- 어떤 게임의 기록인가(작품별로 구분)
  avatar_id   INTEGER REFERENCES avatars(id), -- 로그인 사용자면 아바타 id, 게스트면 NULL
  player_name TEXT    NOT NULL,               -- 화면에 보여줄 이름(닉네임 또는 게스트가 입력한 이름)
  score       INTEGER NOT NULL,               -- 점수(높을수록 위)
  grade       TEXT    NOT NULL DEFAULT '',    -- 등급 이름(예: '두 개를 다 든 사람')
  detail      TEXT,                           -- 게임이 남기고 싶은 부가 정보(JSON 문자열, 선택)
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 랭킹은 "게임별 + 점수 내림차순"으로만 읽으므로 그 순서로 인덱스를 만든다.
CREATE INDEX IF NOT EXISTS idx_game_scores_rank ON game_scores (game_key, score DESC);

-- 교실 뒷벽 전시(학생 작품 갤러리). 3회차 미니게임 등을 여기에 건다.
CREATE TABLE IF NOT EXISTS gallery_works (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id   INTEGER REFERENCES avatars(id),
  title       TEXT    NOT NULL,
  url         TEXT,                             -- 작품 링크(HTML/이미지)
  thumbnail   TEXT,                             -- 썸네일 경로(선택)
  slot        INTEGER NOT NULL DEFAULT 0,       -- 뒷벽에서의 자리
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
