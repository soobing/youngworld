// =====================================================================
// games.js — 작품 게임의 "기록(랭킹)" API
//
// 학생 작품 게임(/works/<이름>/game5.html 등)이 브라우저에서 부르는 API 3개.
// 게임은 같은 서버에서 서빙되므로 fetch('/api/game/...') 로 바로 부를 수 있다.
//
//   POST /api/game/me       내가 누구인지(로그인 여부·닉네임·게스트인지)
//   POST /api/game/score    한 판 끝난 뒤 점수 저장 → 저장 결과 + 랭킹을 돌려준다
//   GET  /api/game/ranking  기록 보기 (로그인 없이 누구나 볼 수 있다)
//
// 게임마다 gameKey 를 하나씩 정해 쓰면 작품별로 랭킹이 따로 쌓인다.
//   예) 'soobing-game5'
// 학생이 자기 게임을 만들 때도 이 API 를 그대로 쓰면 된다(서버 코드 수정 불필요).
// =====================================================================

const express = require('express');
const { Sessions, GameScores } = require('./db');

// gameKey 규칙: 영문 소문자·숫자·하이픈 1~40자.
//   경로나 SQL 에 그대로 쓰지는 않지만, 아무 문자열이나 받으면 오타 하나로
//   랭킹이 둘로 갈라져 "내 기록이 사라졌다"가 되기 때문에 형식을 좁게 정해둔다.
const GAME_KEY_RE = /^[a-z0-9-]{1,40}$/;

const MAX_SCORE = 1000000; // 말도 안 되는 값이 들어와 랭킹을 영원히 차지하는 것 방지
const MAX_NAME = 12; // 이름은 짧게(랭킹 표가 밀리지 않도록)
const MAX_GRADE = 40;
const MAX_DETAIL = 2000;

// 게스트가 입력한 이름 다듬기.
//   - 앞뒤 공백 제거, 줄바꿈·제어문자 제거(랭킹 표가 깨지는 것 방지)
//   - 12자로 자르기
function cleanName(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ') // 줄바꿈·탭 같은 제어문자를 공백으로
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

// 같은 사람이 실수로(혹은 장난으로) 초당 수십 번 저장하는 것을 막는 아주 단순한 제한.
//   IP 하나당 1분에 20번까지. 메모리에만 두므로 서버를 다시 켜면 초기화된다.
const submits = new Map(); // ip -> 최근 저장 시각 배열
const SUBMIT_WINDOW_MS = 60 * 1000;
const SUBMIT_MAX = 20;

function tooManySubmits(ip) {
  const now = Date.now();
  const recent = (submits.get(ip) || []).filter((t) => now - t < SUBMIT_WINDOW_MS);
  recent.push(now);
  submits.set(ip, recent);
  return recent.length > SUBMIT_MAX;
}

function mountGameRoutes(app) {
  const router = express.Router();

  // 내가 누구인지 알려준다. 게임 시작 화면에서 부른다.
  //   - 로그인한 학생/선생님: 이름이 정해져 있으므로 끝날 때 이름을 물어보지 않는다.
  //   - 게스트이거나 로그인 정보가 없으면: 끝난 뒤 이름을 입력받아야 한다.
  //   토큰은 주소창(쿼리)에 남지 않도록 POST 본문으로 받는다.
  router.post('/game/me', (req, res) => {
    const { token } = req.body || {};
    const avatar = token ? Sessions.avatarByToken(token) : null;
    if (!avatar || avatar.role === 'guest') {
      return res.json({ loggedIn: !!avatar, isGuest: true, nickname: null, needsName: true });
    }
    res.json({
      loggedIn: true,
      isGuest: false,
      nickname: avatar.nickname,
      color: avatar.color,
      needsName: false,
    });
  });

  // 한 판이 끝나면 점수를 저장한다.
  //   이름을 정하는 규칙(요구사항):
  //     - 로그인 사용자(게스트 아님) → 서버가 그 사람의 닉네임으로 기록한다(클라이언트가 보낸 이름 무시).
  //     - 게스트 / 비로그인          → 게임에서 입력받은 playerName 으로 기록한다(비어 있으면 거절).
  router.post('/game/score', (req, res) => {
    const { gameKey, token, playerName, score, grade, detail } = req.body || {};

    if (!GAME_KEY_RE.test(String(gameKey || ''))) {
      return res.status(400).json({ code: 'BAD_GAME_KEY', message: '게임 이름(gameKey)이 올바르지 않습니다.' });
    }
    const n = Number(score);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_SCORE) {
      return res.status(400).json({ code: 'BAD_SCORE', message: '점수가 올바르지 않습니다.' });
    }
    if (tooManySubmits(req.ip)) {
      return res.status(429).json({ code: 'TOO_MANY', message: '너무 자주 저장했습니다. 잠시 후 다시 시도하세요.' });
    }

    const avatar = token ? Sessions.avatarByToken(token) : null;
    const isGuest = !avatar || avatar.role === 'guest';

    let name;
    if (isGuest) {
      name = cleanName(playerName);
      if (!name) {
        return res.status(400).json({ code: 'NEED_NAME', message: '이름을 입력해야 기록이 남습니다.' });
      }
    } else {
      name = avatar.nickname; // 로그인 사용자는 본인 이름으로만 남는다(남의 이름 사칭 방지)
    }

    const avatarId = isGuest ? null : avatar.id;
    GameScores.add({
      gameKey,
      avatarId,
      playerName: name,
      score: n,
      grade: String(grade || '').slice(0, MAX_GRADE),
      detail: detail == null ? null : String(detail).slice(0, MAX_DETAIL),
    });

    const { rank, total } = GameScores.rankOf(gameKey, { avatarId, playerName: name });
    res.json({
      ok: true,
      playerName: name,
      isGuest,
      rank,
      total,
      ranking: GameScores.ranking(gameKey, 20),
    });
  });

  // 기록 보기. 로그인 없이 누구나 볼 수 있어야 하므로 토큰을 요구하지 않는다.
  router.get('/game/ranking', (req, res) => {
    const gameKey = String(req.query.gameKey || '');
    if (!GAME_KEY_RE.test(gameKey)) {
      return res.status(400).json({ code: 'BAD_GAME_KEY', message: '게임 이름(gameKey)이 올바르지 않습니다.' });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    res.json({ gameKey, ranking: GameScores.ranking(gameKey, limit) });
  });

  app.use('/api', router);
}

module.exports = { mountGameRoutes, cleanName };
