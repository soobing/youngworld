// =====================================================================
// db.js — SQLite 데이터베이스 접근 모듈
// better-sqlite3 는 "동기(synchronous)" 라이브러리라서 async/await 가 없다.
// 모든 쿼리를 아래처럼 "이름있는 함수"로 감싸서 나머지 코드가 SQL 을 몰라도
// 되게 한다. (학생이 새 기능을 추가할 때 여기 함수만 하나 더 만들면 됨)
// =====================================================================

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { hashPassword } = require('./passwords');

// 세션 유효기간(일). 이 기간이 지난 토큰은 만료 처리한다.
const SESSION_TTL_DAYS = 14;

// youngworld.db 파일을 프로젝트 루트에 만든다(없으면 자동 생성).
const DB_PATH = path.join(__dirname, '..', 'youngworld.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // 여러 접속 동시 읽기 성능 향상

// schema.sql 을 읽어 테이블을 생성(이미 있으면 무시).
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ---------------------------------------------------------------------
// 아바타(사용자)
// ---------------------------------------------------------------------
const Avatars = {
  all() {
    return db.prepare('SELECT * FROM avatars ORDER BY id').all();
  },
  byId(id) {
    return db.prepare('SELECT * FROM avatars WHERE id = ?').get(id);
  },
  byNickname(nickname) {
    return db.prepare('SELECT * FROM avatars WHERE nickname = ?').get(nickname);
  },
  // 학생 목록(핸드폰 전체 발송 대상). 게스트/선생님 제외.
  allStudents() {
    return db.prepare("SELECT * FROM avatars WHERE role = 'student' ORDER BY id").all();
  },
  // 쪽지/투표를 주고받을 수 있는 상대들(게스트 제외 + 나 자신 제외).
  //   학생·선생님끼리는 서로에게 보낼 수 있다. 게스트는 정체성이 없어 제외.
  allMessageable(exceptId) {
    return db
      .prepare("SELECT * FROM avatars WHERE role != 'guest' AND id != ? ORDER BY id")
      .all(exceptId);
  },
  create({ nickname, role, password, color }) {
    const info = db
      .prepare(
        `INSERT OR IGNORE INTO avatars (nickname, role, password, must_change, color)
         VALUES (@nickname, @role, @password, @must_change, @color)`
      )
      .run({
        nickname,
        role,
        // 게스트는 비밀번호 없음(NULL). 그 외는 기본 '1234'를 해시해서 저장.
        password: role === 'guest' ? null : hashPassword(password ?? '1234'),
        must_change: role === 'guest' ? 0 : 1,
        color: color ?? '#44aaee',
      });
    return info.lastInsertRowid ? this.byNickname(nickname) : this.byNickname(nickname);
  },
  // 새 비밀번호 설정(해시 저장). must_change 를 0 으로.
  setPassword(id, password) {
    db.prepare('UPDATE avatars SET password = ?, must_change = 0 WHERE id = ?').run(hashPassword(password), id);
  },
  // 구 평문 비밀번호를 해시로 승격(must_change 는 건드리지 않음).
  rehashPassword(id, plain) {
    db.prepare('UPDATE avatars SET password = ? WHERE id = ?').run(hashPassword(plain), id);
  },
  // 아바타 삭제(선생님 제외). 관련 세션·설문 배달/응답도 함께 정리한다.
  //   성공하면 true, 없거나 admin 이면 false.
  deleteByNickname(nickname) {
    const a = this.byNickname(nickname);
    if (!a || a.role === 'admin') return false;
    const tx = db.transaction(() => {
      // 이 사람이 받은 배달의 응답 → 배달 순으로 삭제.
      const delIds = db.prepare('SELECT id FROM phone_deliveries WHERE recipient_id = ?').all(a.id).map((r) => r.id);
      if (delIds.length) {
        const ph = delIds.map(() => '?').join(',');
        db.prepare('DELETE FROM phone_responses WHERE delivery_id IN (' + ph + ')').run(...delIds);
      }
      db.prepare('DELETE FROM phone_deliveries WHERE recipient_id = ?').run(a.id);
      db.prepare('DELETE FROM sessions WHERE avatar_id = ?').run(a.id);
      db.prepare('DELETE FROM avatars WHERE id = ?').run(a.id);
    });
    tx();
    return true;
  },
  // 닉네임 변경. nickname 은 UNIQUE 라 이미 쓰는 이름이면 실패한다.
  //   성공하면 true, 중복이면 false 를 돌려준다(예외를 삼켜 호출부를 단순화).
  setNickname(id, nickname) {
    try {
      const info = db.prepare('UPDATE avatars SET nickname = ? WHERE id = ?').run(nickname, id);
      return info.changes > 0;
    } catch (e) {
      // UNIQUE 제약 위반(이미 있는 이름) → false
      return false;
    }
  },
  // 아바타 색상 변경(#rrggbb).
  setColor(id, color) {
    db.prepare('UPDATE avatars SET color = ? WHERE id = ?').run(color, id);
  },
  // 마지막 위치/씬 저장(접속 종료·씬 전환 시에만 호출. 매 이동마다 저장하지 않음)
  savePosition(id, x, y, scene) {
    db.prepare('UPDATE avatars SET last_x = ?, last_y = ?, last_scene = ? WHERE id = ?').run(
      Math.round(x),
      Math.round(y),
      scene,
      id
    );
  },
};

// ---------------------------------------------------------------------
// 세션 토큰
// ---------------------------------------------------------------------
const Sessions = {
  create(token, avatarId) {
    db.prepare('INSERT INTO sessions (token, avatar_id) VALUES (?, ?)').run(token, avatarId);
  },
  // 토큰으로 아바타를 찾는다(조인). 없거나 만료(TTL 초과)면 undefined.
  avatarByToken(token) {
    if (!token) return undefined;
    return db
      .prepare(
        `SELECT a.* FROM sessions s JOIN avatars a ON a.id = s.avatar_id
         WHERE s.token = ? AND s.created_at > datetime('now', ?)`
      )
      .get(token, `-${SESSION_TTL_DAYS} days`);
  },
  // 만료된 세션 정리(서버 시작 시 1회 호출).
  purgeExpired() {
    db.prepare(`DELETE FROM sessions WHERE created_at <= datetime('now', ?)`).run(`-${SESSION_TTL_DAYS} days`);
  },
};

// ---------------------------------------------------------------------
// 핸드폰 메시지 / 배달 / 응답
// ---------------------------------------------------------------------
const Phone = {
  createMessage({ senderId, type, title, payload, target }) {
    const info = db
      .prepare(
        `INSERT INTO phone_messages (sender_id, type, title, payload, target)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(senderId, type, title, JSON.stringify(payload), target);
    return info.lastInsertRowid;
  },
  createDelivery(messageId, recipientId) {
    const info = db
      .prepare(
        `INSERT OR IGNORE INTO phone_deliveries (message_id, recipient_id) VALUES (?, ?)`
      )
      .run(messageId, recipientId);
    return info.lastInsertRowid;
  },
  // 특정 사용자의 "안읽은" 배달들(접속 시 알람에 사용). 메시지 원문 + 보낸사람 조인.
  unreadDeliveries(recipientId) {
    return db
      .prepare(
        `SELECT d.id AS deliveryId, d.is_read, m.id AS messageId, m.type, m.title, m.payload,
                m.sender_id AS senderId, s.nickname AS senderNickname
         FROM phone_deliveries d
         JOIN phone_messages m ON m.id = d.message_id
         LEFT JOIN avatars s ON s.id = m.sender_id
         WHERE d.recipient_id = ? AND d.is_read = 0
         ORDER BY d.id`
      )
      .all(recipientId);
  },
  // 특정 사용자의 전체 수신함(읽음 포함). 내가 이미 응답했다면 그 답(myAnswer)도 함께.
  inbox(recipientId) {
    return db
      .prepare(
        `SELECT d.id AS deliveryId, d.is_read, d.answered_at, m.id AS messageId,
                m.type, m.title, m.payload, m.created_at,
                m.sender_id AS senderId, s.nickname AS senderNickname,
                (SELECT r.answer FROM phone_responses r WHERE r.delivery_id = d.id
                 ORDER BY r.id DESC LIMIT 1) AS myAnswer
         FROM phone_deliveries d
         JOIN phone_messages m ON m.id = d.message_id
         LEFT JOIN avatars s ON s.id = m.sender_id
         WHERE d.recipient_id = ?
         ORDER BY d.id DESC`
      )
      .all(recipientId);
  },
  // 배달 → 원본 메시지 정보(답장 대상·투표 집계 알림용).
  messageSenderOfDelivery(deliveryId) {
    return db
      .prepare(
        `SELECT m.id AS messageId, m.sender_id AS senderId, m.title AS title, m.type AS type
         FROM phone_deliveries d JOIN phone_messages m ON m.id = d.message_id
         WHERE d.id = ?`
      )
      .get(deliveryId);
  },

  // 메시지 1건(투표 결과 계산에 사용). 만든이 닉네임·대상도 함께.
  messageById(id) {
    return db
      .prepare(
        `SELECT m.id AS messageId, m.sender_id AS senderId, s.nickname AS senderNickname,
                m.type, m.title, m.payload, m.target, m.created_at
         FROM phone_messages m LEFT JOIN avatars s ON s.id = m.sender_id
         WHERE m.id = ?`
      )
      .get(id);
  },

  // 설문 payload 의 특정 플래그(public / shareResults)를 나중에 바꾼다. 성공 시 true.
  setSurveyFlag(messageId, key, value) {
    if (key !== 'public' && key !== 'shareResults') return false;
    const row = db.prepare("SELECT payload, type FROM phone_messages WHERE id = ?").get(messageId);
    if (!row || row.type !== 'survey') return false;
    let payload;
    try { payload = JSON.parse(row.payload); } catch (e) { return false; }
    payload[key] = !!value;
    db.prepare('UPDATE phone_messages SET payload = ? WHERE id = ?').run(JSON.stringify(payload), messageId);
    return true;
  },
  setSurveyPublic(messageId, isPublic) {
    return this.setSurveyFlag(messageId, 'public', isPublic);
  },
  setSurveyShareResults(messageId, share) {
    return this.setSurveyFlag(messageId, 'shareResults', share);
  },

  // 모든 설문(최신순). 공개/내가만든 필터는 payload 를 봐야 하므로 phone.js 에서 처리.
  allSurveys() {
    return db
      .prepare("SELECT id AS messageId FROM phone_messages WHERE type = 'survey' ORDER BY id DESC")
      .all();
  },

  // 내가 만든 미션들(최신순).
  missionsBySender(senderId) {
    return db
      .prepare("SELECT id AS messageId FROM phone_messages WHERE sender_id = ? AND type = 'mission' ORDER BY id DESC")
      .all(senderId);
  },

  // 한 미션의 대상자별 완료 여부(완료 = answered_at 채워짐). 이름 순.
  missionProgress(messageId) {
    return db
      .prepare(
        `SELECT a.nickname AS nickname, (d.answered_at IS NOT NULL) AS done, d.answered_at AS answeredAt
         FROM phone_deliveries d JOIN avatars a ON a.id = d.recipient_id
         WHERE d.message_id = ?
         ORDER BY a.id`
      )
      .all(messageId);
  },

  // 내가 "받은" 미션 전체(완료 포함). 학생이 자기 미션 결과를 볼 때 사용(자기 것만).
  receivedMissions(recipientId) {
    return db
      .prepare(
        `SELECT d.answered_at AS answeredAt, m.id AS messageId, m.title, m.payload,
                s.nickname AS senderNickname
         FROM phone_deliveries d
         JOIN phone_messages m ON m.id = d.message_id
         LEFT JOIN avatars s ON s.id = m.sender_id
         WHERE d.recipient_id = ? AND m.type = 'mission'
         ORDER BY m.id DESC`
      )
      .all(recipientId);
  },

  // 접속 중인 사용자의 "미완료 미션" 배달들(로그인/주기 알람에서 마감 임박 판단).
  incompleteMissions(recipientId) {
    return db
      .prepare(
        `SELECT d.id AS deliveryId, m.id AS messageId, m.title, m.payload,
                m.sender_id AS senderId, s.nickname AS senderNickname
         FROM phone_deliveries d
         JOIN phone_messages m ON m.id = d.message_id
         LEFT JOIN avatars s ON s.id = m.sender_id
         WHERE d.recipient_id = ? AND m.type = 'mission' AND d.answered_at IS NULL
         ORDER BY d.id`
      )
      .all(recipientId);
  },

  // 한 설문의 개별 응답(누가 무엇을 답했는지). 응답자 닉네임 + answer JSON.
  responsesDetailed(messageId) {
    return db
      .prepare(
        `SELECT a.nickname AS nickname, r.answer AS answer
         FROM phone_responses r
         JOIN phone_deliveries d ON d.id = r.delivery_id
         JOIN avatars a ON a.id = d.recipient_id
         WHERE d.message_id = ?
         ORDER BY r.id`
      )
      .all(messageId);
  },

  // 내가 이 메시지(투표)에 낸 답(선택 인덱스가 담긴 answer JSON). 없으면 undefined.
  myAnswerForMessage(recipientId, messageId) {
    const row = db
      .prepare(
        `SELECT r.answer AS answer FROM phone_responses r
         JOIN phone_deliveries d ON d.id = r.delivery_id
         WHERE d.message_id = ? AND d.recipient_id = ?
         ORDER BY r.id DESC LIMIT 1`
      )
      .get(messageId, recipientId);
    return row ? row.answer : undefined;
  },

  // 내가 이 메시지의 대상(수신자)인가?
  isRecipient(recipientId, messageId) {
    return !!db
      .prepare('SELECT 1 FROM phone_deliveries WHERE message_id = ? AND recipient_id = ? LIMIT 1')
      .get(messageId, recipientId);
  },

  // 투표 집계 원재료: 배달 수(=대상 인원) + 응답들(선택 인덱스가 담긴 answer JSON).
  pollTally(messageId) {
    const delivered = db
      .prepare('SELECT COUNT(*) AS n FROM phone_deliveries WHERE message_id = ?')
      .get(messageId).n;
    const answers = db
      .prepare(
        `SELECT r.answer AS answer FROM phone_responses r
         JOIN phone_deliveries d ON d.id = r.delivery_id
         WHERE d.message_id = ?`
      )
      .all(messageId)
      .map((r) => r.answer);
    return { delivered, answers };
  },
  unreadCount(recipientId) {
    return db
      .prepare('SELECT COUNT(*) AS n FROM phone_deliveries WHERE recipient_id = ? AND is_read = 0')
      .get(recipientId).n;
  },
  // 배달이 이 수신자 것인지 확인(권한 체크용).
  deliveryOwner(deliveryId) {
    return db.prepare('SELECT recipient_id FROM phone_deliveries WHERE id = ?').get(deliveryId);
  },
  markRead(deliveryId) {
    db.prepare('UPDATE phone_deliveries SET is_read = 1 WHERE id = ?').run(deliveryId);
  },
  saveResponse(deliveryId, answer) {
    db.prepare('INSERT INTO phone_responses (delivery_id, answer) VALUES (?, ?)').run(
      deliveryId,
      JSON.stringify(answer)
    );
    db.prepare(
      "UPDATE phone_deliveries SET is_read = 1, answered_at = datetime('now') WHERE id = ?"
    ).run(deliveryId);
  },
};

// ---------------------------------------------------------------------
// 칠판 강의자료 / 뒷벽 갤러리
// ---------------------------------------------------------------------
const Materials = {
  all() {
    return db.prepare('SELECT * FROM lecture_materials ORDER BY slot, id').all();
  },
  create({ title, url, sessionNo, slot }) {
    const info = db
      .prepare(
        `INSERT INTO lecture_materials (title, url, session_no, slot) VALUES (?, ?, ?, ?)`
      )
      .run(title, url, sessionNo ?? null, slot ?? 0);
    return db.prepare('SELECT * FROM lecture_materials WHERE id = ?').get(info.lastInsertRowid);
  },
};

// 작품 전시 카테고리 4종(고정 순서 = slot 인덱스). 학생마다 이 4칸을 채운다.
const WORK_CATEGORIES = [
  { key: 'intro', label: '자기소개', sub: '', icon: '👋' },
  { key: 'dream', label: '나의 꿈은?', sub: '', icon: '⭐' },
  { key: 'game5', label: '5년 뒤 나의 미래', sub: '(게임)', icon: '🎮' },
  { key: 'webtoon10', label: '10년 뒤 나의 미래', sub: '(웹툰)', icon: '📚' },
];

// 교실 책장의 How-to 안내 문서.
const Guides = {
  all() {
    return db.prepare('SELECT * FROM guide_docs ORDER BY slot, id').all();
  },
  create({ title, url, slot }) {
    const info = db
      .prepare('INSERT INTO guide_docs (title, url, slot) VALUES (?, ?, ?)')
      .run(title, url, slot ?? 0);
    return db.prepare('SELECT * FROM guide_docs WHERE id = ?').get(info.lastInsertRowid);
  },
  deleteById(id) {
    db.prepare('DELETE FROM guide_docs WHERE id = ?').run(id);
  },
};

const Gallery = {
  all() {
    return db.prepare('SELECT * FROM gallery_works ORDER BY slot, id').all();
  },
  create({ authorId, title, url, thumbnail, slot }) {
    const info = db
      .prepare(
        `INSERT INTO gallery_works (author_id, title, url, thumbnail, slot)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(authorId ?? null, title, url ?? null, thumbnail ?? null, slot ?? 0);
    return db.prepare('SELECT * FROM gallery_works WHERE id = ?').get(info.lastInsertRowid);
  },
  // 학생 한 명이 특정 카테고리(slot) 작품을 올리거나 교체한다(있으면 갱신, 없으면 생성).
  setWork({ authorId, slot, url, thumbnail, title }) {
    const existing = db
      .prepare('SELECT id FROM gallery_works WHERE author_id = ? AND slot = ?')
      .get(authorId, slot);
    if (existing) {
      db.prepare('UPDATE gallery_works SET url = ?, thumbnail = ?, title = ? WHERE id = ?')
        .run(url ?? null, thumbnail ?? null, title ?? '', existing.id);
      return existing.id;
    }
    const info = db
      .prepare('INSERT INTO gallery_works (author_id, title, url, thumbnail, slot) VALUES (?,?,?,?,?)')
      .run(authorId, title ?? '', url ?? null, thumbnail ?? null, slot);
    return info.lastInsertRowid;
  },
  // 갤러리 화면용 구조화 데이터: 카테고리 4종 + 학생별 4칸(작품 없으면 null).
  //   { categories:[{key,label,sub,icon}], students:[{id,nickname,color,works:{<key>:{url,thumbnail}|null}}] }
  structured() {
    const students = db
      .prepare("SELECT id, nickname, color FROM avatars WHERE role = 'student' ORDER BY id")
      .all();
    const rows = db.prepare('SELECT author_id, slot, url, thumbnail FROM gallery_works').all();
    const byKey = {};
    for (const w of rows) byKey[w.author_id + ':' + w.slot] = { url: w.url, thumbnail: w.thumbnail };
    return {
      categories: WORK_CATEGORIES,
      students: students.map((s) => ({
        id: s.id,
        nickname: s.nickname,
        color: s.color,
        works: Object.fromEntries(
          WORK_CATEGORIES.map((c, i) => [c.key, byKey[s.id + ':' + i] || null])
        ),
      })),
    };
  },
};

module.exports = { db, Avatars, Sessions, Phone, Materials, Gallery, Guides };
