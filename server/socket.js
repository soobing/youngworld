// =====================================================================
// socket.js — 모든 실시간(Socket.io) 이벤트 처리
// 서버가 "단일 진실원". 클라이언트는 입력을 보내고 화면만 그린다.
// 권한(게스트/선생님)은 여기서 permissions.can() 으로 강제한다.
// =====================================================================

const { Avatars, Sessions, Phone, Materials, Gallery, Guides } = require('./db');
const { can } = require('./permissions');
const phone = require('./phone');

// 씬 이름 → Socket.io Room 이름. 이동/등장/퇴장은 같은 씬 안에서만 방송된다.
const ROOM = (scene) => `scene:${scene}`;
const SCENES = ['island', 'classroom'];

// 칠판/책장 문서 URL 안전성 검사.
//   같은 서버의 /lectures/ 또는 /guides/ 아래 .html 만 허용(외부·javascript:·경로탈출 차단).
//   iframe 으로 임의 HTML 을 로드하지 못하게 해 XSS 를 막는다.
function isSafeDocUrl(url) {
  return typeof url === 'string'
    && /^\/(lectures|guides)\/[A-Za-z0-9._-]+\.html$/.test(url)
    && !url.includes('..');
}

// 재알람 주기(ms). 미확인 핸드폰 메시지가 있으면 이 주기로 계속 알린다.
// 테스트 시 ALARM_MS 환경변수로 짧게 바꿀 수 있다.
const ALARM_INTERVAL_MS = Number(process.env.ALARM_MS) || 30 * 1000;

// 현재 접속중인 플레이어들의 메모리 상태.  avatarId -> playerState
// (이동은 매 틱 DB 에 쓰지 않고 여기 메모리에만 둔다)
const online = new Map();

// 클라이언트에 보낼 플레이어 공개 정보.
function publicPlayer(p) {
  return { id: p.id, nickname: p.nickname, color: p.color, role: p.role, x: p.x, y: p.y, dir: p.dir, scene: p.scene };
}

// 같은 씬에 있는 "다른" 플레이어들.
function othersInScene(scene, exceptId) {
  const list = [];
  for (const p of online.values()) {
    if (p.scene === scene && p.id !== exceptId) list.push(publicPlayer(p));
  }
  return list;
}

function setup(io) {
  // 방금 만들어진 배달들을 "온라인" 수신자에게 즉시 푸시한다.
  // (오프라인이면 다음 접속 시 unreadFor 로 받는다)
  function pushDeliveries(deliveries) {
    for (const d of deliveries) {
      const targetPlayer = online.get(d.recipientId);
      if (!targetPlayer) continue;
      const item = {
        deliveryId: d.deliveryId,
        messageId: d.messageId,
        type: d.type,
        title: d.title,
        payload: d.payload,
        senderId: d.senderId,
        senderNickname: d.senderNickname,
      };
      // 미션이면 마감일·임박도·완료여부를 함께(우편함/맵 표시용).
      if (d.type === 'mission') {
        item.due = (d.payload && d.payload.due) || null;
        item.urgency = phone.missionUrgency(item.due);
        item.done = false;
      }
      io.to(targetPlayer.socketId).emit('phone:new', item);
      io.to(targetPlayer.socketId).emit('phone:alarm', { unreadCount: Phone.unreadCount(d.recipientId) });
    }
  }

  // --- 연결 시 토큰 → 아바타 해석 (미들웨어) ---
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const avatar = Sessions.avatarByToken(token);
    if (!avatar) return next(new Error('NO_SESSION'));
    socket.data.avatar = avatar; // { id, nickname, role, color, last_x, ... }
    next();
  });

  io.on('connection', (socket) => {
    const avatar = socket.data.avatar;
    const role = avatar.role;

    // 같은 아바타가 이미 접속중이면(이중 로그인/재접속) 기존 소켓을 정리.
    const existing = online.get(avatar.id);
    if (existing && existing.socketId && existing.socketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(existing.socketId);
      if (oldSocket) oldSocket.disconnect(true);
    }

    // 메모리 플레이어 상태 생성(마지막 위치/씬 복원).
    const scene = SCENES.includes(avatar.last_scene) ? avatar.last_scene : 'island';
    const player = {
      id: avatar.id,
      nickname: avatar.nickname,
      color: avatar.color,
      role,
      x: avatar.last_x,
      y: avatar.last_y,
      dir: 'down',
      scene,
      socketId: socket.id,
    };
    online.set(avatar.id, player);
    socket.join(ROOM(scene));

    // --- 최초 1회: 이 클라이언트에게 월드 상태 전송 ---
    socket.emit('world:init', {
      me: publicPlayer(player),
      players: othersInScene(scene, avatar.id),
      scene,
      blackboard: Materials.all(),
      guides: Guides.all(),
      gallery: Gallery.structured(),
      // 게스트를 뺀 모두(학생·선생님)가 쪽지 수신함을 갖는다.
      inbox: role !== 'guest' ? phone.inboxFor(avatar.id) : [],
    });

    // 같은 씬의 다른 사람들에게 "새 플레이어 등장" 방송.
    socket.to(ROOM(scene)).emit('player:joined', publicPlayer(player));

    // 미완료 미션 중 마감이 임박/지난 것을 골라 리마인더로 보낸다(완료할 때까지 계속).
    function sendMissionReminders() {
      const pend = phone.pendingMissionsFor(avatar.id);
      const urgent = pend.filter((p) => ['soon', 'today', 'overdue'].includes(p.urgency));
      // 항상 전체 미완료 개수/최고 긴급도를 알려 맵/우편함이 표시하게 하고,
      // 임박한 것들은 리마인더 토스트용으로 함께 보낸다.
      socket.emit('mission:remind', { pending: pend, urgent });
    }

    // --- 학생·선생님: 안읽은 쪽지 알람 + 미션 리마인더 + 주기 재알람(게스트 제외) ---
    let alarmTimer = null;
    if (role !== 'guest') {
      for (const item of phone.unreadFor(avatar.id)) socket.emit('phone:new', item);
      sendMissionReminders();
      alarmTimer = setInterval(() => {
        const n = Phone.unreadCount(avatar.id);
        if (n > 0) socket.emit('phone:alarm', { unreadCount: n });
        sendMissionReminders(); // 마감 임박 미션을 주기적으로 다시 알림
      }, ALARM_INTERVAL_MS);
    }

    // 권한 없는 액션 거부 헬퍼.
    function deny(action) {
      if (can(role, action)) return false;
      socket.emit('error', { code: 'FORBIDDEN', message: '권한이 없습니다.', action });
      return true;
    }

    // -----------------------------------------------------------------
    // 이동: 메모리 갱신 후 같은 씬에 방송(발신자 제외). DB 저장 안 함.
    // -----------------------------------------------------------------
    socket.on('player:move', ({ x, y, dir }) => {
      if (deny('player:move')) return;
      player.x = x;
      player.y = y;
      player.dir = dir || player.dir;
      socket.to(ROOM(player.scene)).emit('player:moved', { id: player.id, x, y, dir: player.dir });
    });

    // -----------------------------------------------------------------
    // 씬 이동(야외 ↔ 교실): Room 을 바꾸고 등장/퇴장 방송.
    // -----------------------------------------------------------------
    socket.on('scene:enter', ({ scene: next, x, y }) => {
      if (deny('scene:enter')) return;
      if (!SCENES.includes(next)) return;
      const prev = player.scene;
      if (prev === next) return;

      // 이전 씬에서 퇴장 알림
      socket.to(ROOM(prev)).emit('player:left', { id: player.id });
      socket.leave(ROOM(prev));

      // 상태 갱신 + 다음 씬 입장
      player.scene = next;
      if (typeof x === 'number') player.x = x;
      if (typeof y === 'number') player.y = y;
      socket.join(ROOM(next));
      Avatars.savePosition(player.id, player.x, player.y, next); // 씬 전환은 DB 에 저장

      // 새 씬의 기존 플레이어 목록을 나에게, 나를 새 씬에 방송
      socket.emit('scene:ready', { scene: next, players: othersInScene(next, player.id), x: player.x, y: player.y });
      socket.to(ROOM(next)).emit('player:joined', publicPlayer(player));
    });

    // -----------------------------------------------------------------
    // 핸드폰: 읽음 처리 / 응답 (학생만)
    // -----------------------------------------------------------------
    socket.on('phone:markRead', ({ deliveryId }) => {
      if (deny('phone:markRead')) return;
      const owner = Phone.deliveryOwner(deliveryId);
      if (!owner || owner.recipient_id !== avatar.id) return; // 남의 메시지 조작 방지
      Phone.markRead(deliveryId);
      socket.emit('phone:alarm', { unreadCount: Phone.unreadCount(avatar.id) });
    });

    socket.on('phone:respond', ({ deliveryId, answer }) => {
      if (deny('phone:respond')) return;
      const owner = Phone.deliveryOwner(deliveryId);
      if (!owner || owner.recipient_id !== avatar.id) return;
      Phone.saveResponse(deliveryId, answer);
      socket.emit('phone:answered', { deliveryId });
      socket.emit('phone:alarm', { unreadCount: Phone.unreadCount(avatar.id) });
      // 설문 응답이면, 변경 사실만 모두에게 알린다(각자 자기 관점으로 현황 새로고침).
      // (역할별 권한이 다르므로 결과를 브로드캐스트하지 않고 각자 survey:mine 으로 재요청)
      const origin = Phone.messageSenderOfDelivery(deliveryId);
      if (origin && origin.type === 'survey') {
        io.emit('survey:changed', { messageId: origin.messageId });
      }
    });

    // 설문 현황 탭: 내가 볼 수 있는 설문/투표(전체공개·내가 만든·내가 대상)의 집계.
    socket.on('survey:mine', () => {
      if (deny('survey:view')) return;
      socket.emit('survey:mine', { surveys: phone.visibleSurveys(avatar.id) });
    });

    // 이미 만든 설문의 공개/비공개를 생성자가 바꾼다.
    socket.on('survey:setPublic', ({ messageId, public: isPublic }) => {
      if (deny('peer:survey')) return;
      const m = Phone.messageById(messageId);
      if (!m || m.type !== 'survey' || m.senderId !== avatar.id) return; // 생성자만
      if (!Phone.setSurveyPublic(messageId, isPublic === true)) return;
      // 공개 여부가 바뀌었음을 모두에게 알림 → 각자 자기 관점으로 현황 새로고침.
      io.emit('survey:changed', { messageId });
    });

    // 이미 만든 설문의 "응답 결과 공유하기"(통계 공유)를 생성자가 바꾼다.
    socket.on('survey:setShareResults', ({ messageId, share }) => {
      if (deny('peer:survey')) return;
      const m = Phone.messageById(messageId);
      if (!m || m.type !== 'survey' || m.senderId !== avatar.id) return; // 생성자만
      if (!Phone.setSurveyShareResults(messageId, share === true)) return;
      io.emit('survey:changed', { messageId });
    });

    // -----------------------------------------------------------------
    // 미션(선생님이 내는 TODO). 생성=선생님, 완료체크=학생.
    // -----------------------------------------------------------------

    // 미션 생성(선생님만). 대상=전체(게스트 제외) 또는 개인.
    socket.on('mission:create', ({ target, recipientNickname, title, task, due }) => {
      if (deny('mission:create')) return;
      const t = String(task || '').trim();
      if (!t) { socket.emit('error', { code: 'BAD_MISSION', message: '해야 할 일을 적어주세요.' }); return; }
      const deliveries = phone.sendMessage({
        senderId: avatar.id,
        type: 'mission',
        title: title && String(title).trim() ? String(title).trim() : `${avatar.nickname} 선생님의 미션`,
        payload: { task: t, due: due ? String(due) : null },
        target: target === 'individual' ? 'individual' : 'all',
        recipientNickname,
      });
      pushDeliveries(deliveries); // 온라인 대상에게 즉시 알림(phone:new)
      socket.emit('peer:sent', { kind: 'mission', count: deliveries.length });
    });

    // 미션 완료 체크(학생). 완료 처리 = 응답 저장(is_read=1, answered_at 세팅).
    socket.on('mission:complete', ({ deliveryId }) => {
      if (deny('mission:complete')) return;
      const owner = Phone.deliveryOwner(deliveryId);
      if (!owner || owner.recipient_id !== avatar.id) return; // 내 미션이 아니면 무시
      const origin = Phone.messageSenderOfDelivery(deliveryId);
      if (!origin || origin.type !== 'mission') return;
      Phone.saveResponse(deliveryId, { done: true });
      socket.emit('phone:answered', { deliveryId });
      socket.emit('phone:alarm', { unreadCount: Phone.unreadCount(avatar.id) });
      // 생성자(선생님)가 접속중이면 현황 갱신 신호.
      if (origin.senderId) {
        const creator = online.get(origin.senderId);
        if (creator) io.to(creator.socketId).emit('mission:changed', { messageId: origin.messageId });
      }
    });

    // 미션 현황(선생님): 내가 낸 미션 + 완료자/진행률.
    socket.on('mission:mine', () => {
      if (deny('mission:create')) return; // 미션을 낼 수 있는 사람(선생님)만 현황 열람
      socket.emit('mission:mine', { missions: phone.myMissions(avatar.id) });
    });

    // 미션 결과(학생): 내가 받은 미션 + 내 완료 여부만(남의 완료율·명단은 안 줌).
    socket.on('mission:received', () => {
      if (deny('mission:view')) return;
      socket.emit('mission:received', { missions: phone.receivedMissions(avatar.id) });
    });

    // -----------------------------------------------------------------
    // 자기 설정 / 친구끼리 쪽지·투표·답장 (게스트 제외, 서버가 권한 강제)
    // -----------------------------------------------------------------

    // 닉네임 변경. UNIQUE 라 중복이면 실패. 성공하면 모두에게 라벨 갱신 방송.
    socket.on('me:setNickname', ({ nickname }) => {
      if (deny('me:setNickname')) return;
      const name = String(nickname || '').trim();
      // 1~12자, 공백만은 불가. (특수문자는 허용 — 애들 게임이라 유연하게)
      if (name.length < 1 || name.length > 12) {
        socket.emit('error', { code: 'BAD_NICK', message: '닉네임은 1~12자로 정해주세요.' });
        return;
      }
      if (name === avatar.nickname) {
        socket.emit('me:updated', { nickname: name });
        return;
      }
      const ok = Avatars.setNickname(avatar.id, name);
      if (!ok) {
        socket.emit('error', { code: 'DUP_NICK', message: '이미 쓰는 이름이에요.' });
        return;
      }
      avatar.nickname = name;
      player.nickname = name;
      socket.emit('me:updated', { nickname: name });
      // 접속중인 모두에게 이름표 갱신(같은 씬이 아니어도 목록/전송대상 갱신).
      io.emit('player:renamed', { id: avatar.id, nickname: name });
    });

    // 자기 아바타 색상 변경(#rrggbb 형식만 허용).
    socket.on('me:setColor', ({ color }) => {
      if (deny('me:setColor')) return;
      const hex = String(color || '').trim().toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(hex)) {
        socket.emit('error', { code: 'BAD_COLOR', message: '색상 형식이 올바르지 않아요.' });
        return;
      }
      Avatars.setColor(avatar.id, hex);
      avatar.color = hex;
      player.color = hex;
      socket.emit('me:updated', { color: hex });
      // 접속중인 모두에게 아바타 색 갱신(미니미 틴트).
      io.emit('player:recolored', { id: avatar.id, color: hex });
    });

    // 쪽지(sms) 보내기 — 개인 또는 전체(게스트 제외).
    socket.on('peer:send', ({ recipientNickname, body, target }) => {
      if (deny('peer:send')) return;
      const text = String(body || '').trim();
      const toAll = target === 'all';
      if (!text || (!toAll && !recipientNickname)) return;
      const deliveries = phone.sendMessage({
        senderId: avatar.id,
        type: 'sms',
        title: `${avatar.nickname} 님의 쪽지`,
        payload: { body: text },
        target: toAll ? 'all' : 'individual',
        recipientNickname,
      });
      pushDeliveries(deliveries);
      socket.emit('peer:sent', { kind: 'sms', count: deliveries.length });
    });

    // 설문(survey) 올리기. 질문 여러 개(각 객관식). 전체 또는 개인.
    socket.on('peer:survey', ({ target, recipientNickname, title, questions, public: isPublic }) => {
      if (deny('peer:survey')) return;
      // 질문 정규화/검증: 질문문 필수. 객관식은 보기 2개 이상, 주관식은 보기 0개(자유 서술).
      const clean = (Array.isArray(questions) ? questions : [])
        .map((it) => ({
          q: String((it && it.q) || '').trim(),
          options: (Array.isArray(it && it.options) ? it.options : [])
            .map((s) => String(s).trim()).filter(Boolean),
        }))
        .filter((it) => it.q && (it.options.length === 0 || it.options.length >= 2));
      if (clean.length === 0) {
        socket.emit('error', { code: 'BAD_SURVEY', message: '질문을 하나 이상 적어주세요(객관식은 보기 2개 이상).' });
        return;
      }
      const deliveries = phone.sendMessage({
        senderId: avatar.id,
        type: 'survey',
        title: title && String(title).trim() ? String(title).trim() : `${avatar.nickname} 님의 설문`,
        // public: 공개(설문 현황에 노출) 여부. 기본 공개.
        payload: { questions: clean, public: isPublic !== false },
        target: target === 'individual' ? 'individual' : 'all',
        recipientNickname,
      });
      pushDeliveries(deliveries);
      socket.emit('peer:sent', { kind: 'survey', count: deliveries.length });
    });

    // 받은 쪽지에 답장(원본을 보낸 사람에게 sms 로).
    socket.on('phone:reply', ({ deliveryId, body }) => {
      if (deny('phone:reply')) return;
      const owner = Phone.deliveryOwner(deliveryId);
      if (!owner || owner.recipient_id !== avatar.id) return; // 내 쪽지가 아니면 무시
      const text = String(body || '').trim();
      if (!text) return;
      const origin = Phone.messageSenderOfDelivery(deliveryId);
      if (!origin || !origin.senderId || origin.senderId === avatar.id) return; // 보낸사람 없음/나 자신이면 무시
      // 원본은 읽음 처리.
      Phone.markRead(deliveryId);
      const deliveries = phone.sendMessage({
        senderId: avatar.id,
        type: 'sms',
        title: `RE: ${origin.title || '쪽지'}`,
        payload: { body: text },
        target: 'individual',
        recipientId: origin.senderId,
      });
      pushDeliveries(deliveries);
      socket.emit('peer:sent', { kind: 'reply', count: deliveries.length });
      socket.emit('phone:alarm', { unreadCount: Phone.unreadCount(avatar.id) });
    });

    // -----------------------------------------------------------------
    // 선생님(admin) 전용 액션들
    // -----------------------------------------------------------------
    socket.on('admin:addAvatar', ({ nickname, role: newRole, color, password }) => {
      if (deny('admin:addAvatar')) return;
      if (!nickname || !['student', 'guest'].includes(newRole)) return;
      if (Avatars.byNickname(nickname)) {
        socket.emit('error', { code: 'DUP_NICK', message: '이미 있는 이름입니다.' });
        return;
      }
      // 선생님이 지정한 초기 비번(예: 생년월일). 비우면 undefined → DB 가 기본 '1234' 사용.
      const pw = typeof password === 'string' && password.trim() ? password.trim() : undefined;
      Avatars.create({ nickname, role: newRole, color, password: pw });
      socket.emit('admin:done', { action: 'addAvatar', nickname });
    });

    socket.on('admin:deleteAvatar', ({ nickname }) => {
      if (deny('admin:deleteAvatar')) return;
      const target = Avatars.byNickname(nickname);
      if (!target || target.role === 'admin') {
        socket.emit('error', { code: 'CANT_DELETE', message: '삭제할 수 없는 아바타입니다.' });
        return;
      }
      try {
        // 접속 중이면 먼저 끊고 화면/온라인 목록에서 정리.
        const onlineP = online.get(target.id);
        if (onlineP) {
          const sk = io.sockets.sockets.get(onlineP.socketId);
          if (sk) sk.disconnect(true);
          io.to(ROOM(onlineP.scene)).emit('player:left', { id: target.id });
          online.delete(target.id);
        }
        Avatars.deleteByNickname(nickname);
        io.emit('gallery:update', { gallery: Gallery.structured() }); // 학생 삭제 시 갤러리 갱신
        socket.emit('admin:done', { action: 'deleteAvatar', nickname });
      } catch (e) {
        // 예전엔 여기서 조용히 실패해 "삭제가 안 된다"로 보였다. 이제 에러를 알린다.
        console.error('[admin:deleteAvatar] 실패:', e);
        socket.emit('error', { code: 'DELETE_FAILED', message: '아바타 삭제 중 오류가 발생했어요.' });
      }
    });

    socket.on('admin:postMaterial', ({ title, url, sessionNo, slot }) => {
      if (deny('admin:postMaterial')) return;
      if (!title || !url) return;
      if (!isSafeDocUrl(url)) {
        socket.emit('error', { code: 'BAD_URL', message: '자료 주소는 /lectures/파일.html 형식만 됩니다.' });
        return;
      }
      Materials.create({ title, url, sessionNo, slot });
      io.emit('blackboard:update', { materials: Materials.all() }); // 전원에게 칠판 갱신
      socket.emit('admin:done', { action: 'postMaterial', title });
    });

    socket.on('admin:addWork', ({ authorId, title, url, thumbnail, slot }) => {
      if (deny('admin:addWork')) return;
      if (!title) return;
      Gallery.create({ authorId, title, url, thumbnail, slot });
      io.emit('gallery:update', { gallery: Gallery.structured() });
      socket.emit('admin:done', { action: 'addWork', title });
    });

    // 교실 책장 문서(How-to) 추가/삭제 — 선생님만. 전원에게 책장 갱신.
    socket.on('admin:addGuide', ({ title, url, slot }) => {
      if (deny('admin:addGuide')) return;
      if (!title || !url) return;
      if (!isSafeDocUrl(url)) {
        socket.emit('error', { code: 'BAD_URL', message: '문서 주소는 /guides/파일.html 형식만 됩니다.' });
        return;
      }
      Guides.create({ title, url, slot });
      io.emit('guides:update', { guides: Guides.all() });
      socket.emit('admin:done', { action: 'addGuide', title });
    });

    socket.on('admin:deleteGuide', ({ id }) => {
      if (deny('admin:deleteGuide')) return;
      if (!id) return;
      Guides.deleteById(id);
      io.emit('guides:update', { guides: Guides.all() });
      socket.emit('admin:done', { action: 'deleteGuide' });
    });

    // -----------------------------------------------------------------
    // 연결 종료: 위치 저장, 온라인 목록/타이머 정리, 퇴장 방송
    // -----------------------------------------------------------------
    socket.on('disconnect', () => {
      if (alarmTimer) clearInterval(alarmTimer);
      // 최신 소켓만 정리(재접속으로 교체된 경우 덮어쓰지 않도록)
      const current = online.get(avatar.id);
      if (current && current.socketId === socket.id) {
        Avatars.savePosition(player.id, player.x, player.y, player.scene);
        online.delete(avatar.id);
        socket.to(ROOM(player.scene)).emit('player:left', { id: player.id });
      }
    });
  });
}

module.exports = { setup };
