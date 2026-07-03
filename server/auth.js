// =====================================================================
// auth.js — 로그인/비밀번호 관련 HTTP API
// 소켓 연결 "이전"에 동작해야 하므로 일반 HTTP POST 로 만든다.
// 보안이 목적이 아니라(애들 게임) 아바타 정체성과 역할을 구분하는 용도.
//   - 비밀번호는 "숫자만" 허용, 최소 4자리
//   - 게스트는 비밀번호 없이 입장
//   - 첫 로그인(초기 비번 1234)이면 반드시 새 비번을 설정하게 함
// =====================================================================

const crypto = require('crypto');
const express = require('express');
const { Avatars, Sessions } = require('./db');
const { verifyPassword } = require('./passwords');

// 숫자 4자리 이상인지 검사(비밀번호 규칙 단 하나의 출처).
function isNumericPassword(pw) {
  return typeof pw === 'string' && /^\d{4,}$/.test(pw);
}

// --- 로그인 무차별 대입(brute force) 방어: IP+닉네임별 실패 횟수 제한 ---
const MAX_FAILS = 8;              // 이 횟수 넘게 연속 실패하면
const LOCK_MS = 10 * 60 * 1000;  // 10분 잠금
const fails = new Map();          // key -> { count, until }
function failKey(req, nickname) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  return ip + '|' + String(nickname || '');
}
function isLocked(key) {
  const f = fails.get(key);
  return !!(f && f.until && f.until > Date.now());
}
function noteFail(key) {
  const f = fails.get(key) || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILS) { f.until = Date.now() + LOCK_MS; f.count = 0; }
  fails.set(key, f);
}
function clearFail(key) { fails.delete(key); }

// 랜덤 세션 토큰 발급 후 DB 에 저장.
function issueToken(avatarId) {
  const token = crypto.randomBytes(16).toString('hex');
  Sessions.create(token, avatarId);
  return token;
}

// 클라이언트에 돌려줄 안전한 아바타 정보(비밀번호 제외).
function publicAvatar(a) {
  return {
    id: a.id,
    nickname: a.nickname,
    role: a.role,
    color: a.color,
    mustChange: !!a.must_change,
    lastX: a.last_x,
    lastY: a.last_y,
    lastScene: a.last_scene,
  };
}

function mountAuthRoutes(app) {
  const router = express.Router();

  // 로그인 화면 드롭다운 채우기: 이름/역할/비번필요여부 목록.
  router.get('/avatars', (req, res) => {
    const list = Avatars.all().map((a) => ({
      nickname: a.nickname,
      role: a.role,
      color: a.color, // 로그인 카드 점 색 = 인게임/갤러리 색과 통일(단일 출처)
      needsPassword: a.role !== 'guest',
    }));
    res.json(list);
  });

  // 로그인.
  router.post('/login', (req, res) => {
    const { nickname, password } = req.body || {};
    const key = failKey(req, nickname);
    if (isLocked(key)) {
      return res.status(429).json({ code: 'LOCKED', message: '로그인 시도가 많아 잠시 후 다시 시도하세요.' });
    }
    const avatar = Avatars.byNickname(nickname);
    if (!avatar) return res.status(404).json({ code: 'NO_AVATAR', message: '없는 아바타입니다.' });

    // 게스트: 비밀번호 무시하고 즉시 입장.
    if (avatar.role === 'guest') {
      const token = issueToken(avatar.id);
      return res.json({ token, avatar: publicAvatar(avatar), mustChange: false });
    }

    // 학생/선생님: 해시 비교(구 평문은 통과 시 즉시 해시로 승격).
    const result = verifyPassword(password, avatar.password);
    if (!result) {
      noteFail(key);
      return res.status(401).json({ code: 'BAD_PASSWORD', message: '비밀번호가 틀렸습니다.' });
    }
    if (result === 'legacy') Avatars.rehashPassword(avatar.id, String(password));
    clearFail(key);

    const token = issueToken(avatar.id);
    // 초기 비번(1234)을 아직 안 바꿨다면 비번 설정 화면으로 유도.
    res.json({ token, avatar: publicAvatar(avatar), mustChange: !!avatar.must_change });
  });

  // 첫 로그인 후 새 비밀번호 설정.
  router.post('/set-password', (req, res) => {
    const { token, newPassword } = req.body || {};
    const avatar = Sessions.avatarByToken(token);
    if (!avatar) return res.status(401).json({ code: 'NO_SESSION', message: '다시 로그인하세요.' });
    if (!isNumericPassword(newPassword)) {
      return res.status(400).json({ code: 'NOT_NUMERIC', message: '숫자 4자리 이상으로 설정하세요.' });
    }
    Avatars.setPassword(avatar.id, newPassword);
    res.json({ ok: true });
  });

  // 비밀번호 변경.
  router.post('/change-password', (req, res) => {
    const { token, oldPassword, newPassword } = req.body || {};
    const avatar = Sessions.avatarByToken(token);
    if (!avatar) return res.status(401).json({ code: 'NO_SESSION', message: '다시 로그인하세요.' });
    if (avatar.role === 'guest') {
      return res.status(403).json({ code: 'FORBIDDEN', message: '게스트는 비밀번호가 없습니다.' });
    }
    if (!verifyPassword(oldPassword, avatar.password)) {
      return res.status(401).json({ code: 'BAD_PASSWORD', message: '기존 비밀번호가 틀렸습니다.' });
    }
    if (!isNumericPassword(newPassword)) {
      return res.status(400).json({ code: 'NOT_NUMERIC', message: '숫자 4자리 이상으로 설정하세요.' });
    }
    Avatars.setPassword(avatar.id, newPassword);
    res.json({ ok: true });
  });

  app.use('/api', router);
}

module.exports = { mountAuthRoutes, isNumericPassword, issueToken, publicAvatar };
