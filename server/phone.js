// =====================================================================
// phone.js — 핸드폰(문자/투표/설문) 비즈니스 로직
// "발송" 은 메시지 1건을 만들고, 수신자 각자에게 배달(delivery)을 fan-out 한다.
// 실제로 온라인 사용자에게 실시간 푸시하는 일은 socket.js 가 담당한다.
// (여기서는 DB 처리만. 그래야 테스트도 쉽고 역할이 분리됨)
// =====================================================================

const { Avatars, Phone } = require('./db');

// 미션 마감 임박도. due 는 'YYYY-MM-DD'(그날 끝까지) 또는 빈 값.
//   later(여유) → soon(3일 이내) → today(하루 이내) → overdue(지남). 없으면 'none'.
function missionUrgency(due) {
  if (!due) return 'none';
  const end = new Date(due + 'T23:59:59');
  if (isNaN(end.getTime())) return 'none';
  const ms = end.getTime() - Date.now();
  if (ms < 0) return 'overdue';
  if (ms <= 24 * 3600 * 1000) return 'today';
  if (ms <= 3 * 24 * 3600 * 1000) return 'soon';
  return 'later';
}

/**
 * 선생님이 핸드폰 메시지를 보낸다.
 * @returns {Array<{recipientId:number, deliveryId:number, type, title, payload}>}
 *          방금 만들어진 배달 목록(온라인 학생에게 푸시할 때 사용).
 */
function sendMessage({ senderId, type, title, payload, target, recipientId, recipientNickname }) {
  // 발신자 정보(수신자에게 "누가 보냈는지" 함께 전달).
  const sender = Avatars.byId(senderId);
  const senderNickname = sender ? sender.nickname : '?';

  // 1) 원본 메시지 저장
  const messageId = Phone.createMessage({ senderId, type, title, payload, target });

  // 2) 수신자 결정 — 게스트는 정체성이 없어 절대 포함하지 않고, 자기 자신도 제외.
  //    학생·선생님은 서로에게 쪽지/투표를 보낼 수 있다.
  let recipients;
  if (target === 'individual') {
    // id 로도, 닉네임으로도 지정할 수 있게 한다(클라이언트는 보통 닉네임만 알고 있음).
    const one = recipientId ? Avatars.byId(recipientId) : Avatars.byNickname(recipientNickname);
    recipients = one && one.role !== 'guest' && one.id !== senderId ? [one] : [];
  } else {
    recipients = Avatars.allMessageable(senderId);
  }

  // 3) 수신자마다 배달 생성 (fan-out)
  const deliveries = [];
  for (const r of recipients) {
    const deliveryId = Phone.createDelivery(messageId, r.id);
    deliveries.push({ recipientId: r.id, deliveryId, messageId, type, title, payload, senderId, senderNickname });
  }
  return deliveries;
}

/**
 * 안읽은 배달을 클라이언트가 바로 쓸 수 있는 형태로 변환.
 */
function unreadFor(recipientId) {
  return Phone.unreadDeliveries(recipientId).map((d) => {
    const payload = JSON.parse(d.payload);
    const item = {
      deliveryId: d.deliveryId,
      messageId: d.messageId,
      type: d.type,
      title: d.title,
      payload,
      senderId: d.senderId,
      senderNickname: d.senderNickname,
    };
    if (d.type === 'mission') {
      item.due = payload.due || null;
      item.urgency = missionUrgency(payload.due);
      item.done = false;
    }
    return item;
  });
}

/**
 * 전체 수신함(읽음 포함).
 */
function inboxFor(recipientId) {
  return Phone.inbox(recipientId).map((d) => {
    const payload = JSON.parse(d.payload);
    const item = {
      deliveryId: d.deliveryId,
      messageId: d.messageId,
      type: d.type,
      title: d.title,
      payload,
      isRead: !!d.is_read,
      answeredAt: d.answered_at,
      createdAt: d.created_at,
      senderId: d.senderId,
      senderNickname: d.senderNickname,
      // 내가 이미 낸 답(투표=선택 인덱스 / 설문=답변들). 없으면 null.
      myAnswer: d.myAnswer ? JSON.parse(d.myAnswer) : null,
    };
    // 미션이면 마감일·임박도·완료 여부를 함께 준다(우편함에서 긴급 표시).
    if (d.type === 'mission') {
      item.due = payload.due || null;
      item.urgency = missionUrgency(payload.due);
      item.done = !!d.answered_at;
    }
    return item;
  });
}

// 설문 payload 를 "질문 배열"로 정규화한다.
//   { questions: [{q,options}] } (객관식) 또는 레거시 [문자열](주관식) → [{q,options}]
function normalizeQuestions(payload) {
  return (payload.questions || []).map((x) =>
    typeof x === 'string' ? { q: x, options: [] } : { q: x.q || '', options: x.options || [] }
  );
}

// 한 응답(answer JSON)을 "질문별 선택 인덱스 배열"로 정규화.  { answers:[i,...] } → [i,...]
function normalizeAnswer(answerJson) {
  try {
    const p = JSON.parse(answerJson);
    return Array.isArray(p.answers) ? p.answers : [];
  } catch (e) {
    return null;
  }
}

/**
 * 설문/투표 1건의 실시간 결과(정규화). viewerId 를 주면 뷰어 관점(내가 만듦/대상/내 답)도 담는다.
 * 반환: { messageId, type, senderNickname, title, isPublic, delivered, total,
 *         questions:[{q,options,counts}], mine, isTarget, myAnswers:[idx|null,...] }
 */
function surveyResults(messageId, viewerId) {
  const m = Phone.messageById(messageId);
  if (!m || m.type !== 'survey') return null;
  const payload = JSON.parse(m.payload);
  const questions = normalizeQuestions(payload);
  const counts = questions.map((qq) => qq.options.map(() => 0)); // 객관식: 보기별 득표
  const texts = questions.map(() => []);                          // 주관식: 자유 서술 답 모음

  let total = 0;
  const { delivered, answers } = Phone.pollTally(messageId);
  for (const a of answers) {
    const arr = normalizeAnswer(a);
    if (!arr) continue;
    total++;
    arr.forEach((ans, qi) => {
      const qq = questions[qi];
      if (!qq) return;
      if (qq.options.length) {
        // 객관식: 선택 인덱스 집계.
        if (Number.isInteger(ans) && ans >= 0 && ans < counts[qi].length) counts[qi][ans]++;
      } else {
        // 주관식: 비어있지 않은 텍스트만 모은다.
        const t = typeof ans === 'string' ? ans.trim() : '';
        if (t) texts[qi].push(t);
      }
    });
  }

  // 뷰어 관점(없으면 집계만).
  let mine = false, isTarget = false, myAnswers = null;
  if (viewerId != null) {
    mine = m.senderId === viewerId;
    isTarget = Phone.isRecipient(viewerId, messageId);
    const my = Phone.myAnswerForMessage(viewerId, messageId);
    if (my) myAnswers = normalizeAnswer(my);
  }

  // 접근 권한:
  //   - 개별 응답(누가 무엇을 답했나): 생성자만.
  //   - 통계(집계): 생성자, 또는 생성자가 "응답 결과 공유하기"를 켠 경우.
  const shareResults = payload.shareResults === true;
  const canSeeStats = mine || shareResults;

  // 개별 응답은 생성자에게만 내려보낸다(정보 유출 방지). 그 외에는 빈 배열.
  const responses = mine
    ? Phone.responsesDetailed(messageId).map((row) => ({
        nickname: row.nickname,
        answers: normalizeAnswer(row.answer) || [],
      }))
    : [];

  return {
    messageId, type: m.type, senderId: m.senderId, senderNickname: m.senderNickname,
    // payload.public 이 명시적으로 false 일 때만 비공개(기능 추가 전 만든 설문은 공개로 간주).
    title: m.title, isPublic: payload.public !== false, createdAt: m.created_at,
    shareResults, canSeeStats,
    delivered, total, responses,
    questions: questions.map((qq, qi) => ({
      q: qq.q,
      kind: qq.options.length ? 'choice' : 'text',
      options: qq.options,
      // 통계 열람 권한이 없으면 집계 수치는 내려보내지 않는다(null).
      counts: canSeeStats ? counts[qi] : null,
      texts: canSeeStats ? texts[qi] : null,
    })),
    mine, isTarget, myAnswers,
  };
}

/** 설문 현황 목록: 공개 설문 + 내가 만든 설문(비공개 포함)만. (비공개는 만든 사람만 결과 열람) */
function visibleSurveys(viewerId) {
  return Phone.allSurveys()
    .map((p) => surveyResults(p.messageId, viewerId))
    .filter(Boolean)
    .filter((r) => r.isPublic || r.mine);
}

/**
 * 미션 1건의 진행 현황. 완료자 이름은 "생성자만" 볼 수 있다(응답자는 자기 것만).
 * 반환: { messageId, senderNickname, task, due, urgency, delivered, completedCount, pct,
 *         completers:[이름] (생성자만), mine, isTarget, myDone }
 */
function missionResults(messageId, viewerId) {
  const m = Phone.messageById(messageId);
  if (!m || m.type !== 'mission') return null;
  const payload = JSON.parse(m.payload);
  const progress = Phone.missionProgress(messageId);
  const delivered = progress.length;
  const completed = progress.filter((p) => p.done);
  const completedCount = completed.length;
  const pct = delivered > 0 ? Math.round((completedCount / delivered) * 100) : 0;

  const mine = viewerId != null && m.senderId === viewerId;
  const isTarget = viewerId != null && Phone.isRecipient(viewerId, messageId);
  let myDone = false;
  if (viewerId != null) {
    const meRow = progress.find((p) => p.nickname === (Avatars.byId(viewerId) || {}).nickname);
    myDone = !!(meRow && meRow.done);
  }

  return {
    messageId, senderId: m.senderId, senderNickname: m.senderNickname,
    task: payload.task || '', due: payload.due || null, urgency: missionUrgency(payload.due),
    createdAt: m.created_at, delivered, completedCount, pct,
    // 완료자 이름은 생성자에게만. (응답자는 자기 것만: myDone)
    completers: mine ? completed.map((p) => p.nickname) : null,
    pending: mine ? progress.filter((p) => !p.done).map((p) => p.nickname) : null,
    mine, isTarget, myDone,
  };
}

/** 내가 만든 미션들의 현황(최신순). 생성자용. */
function myMissions(senderId) {
  return Phone.missionsBySender(senderId).map((p) => missionResults(p.messageId, senderId)).filter(Boolean);
}

/** 학생이 "받은" 미션 목록(자기 것만: task/기한/임박도/내 완료여부). 남의 완료율·명단은 없음. */
function receivedMissions(recipientId) {
  return Phone.receivedMissions(recipientId).map((d) => {
    const payload = JSON.parse(d.payload);
    return {
      messageId: d.messageId,
      title: d.title,
      task: payload.task || '',
      due: payload.due || null,
      urgency: missionUrgency(payload.due),
      senderNickname: d.senderNickname,
      myDone: !!d.answeredAt,
    };
  });
}

/** 특정 사용자의 "미완료 미션" 목록 + 임박도(로그인/주기 알람에서 마감 리마인더에 사용). */
function pendingMissionsFor(recipientId) {
  return Phone.incompleteMissions(recipientId).map((d) => {
    const payload = JSON.parse(d.payload);
    return {
      deliveryId: d.deliveryId,
      messageId: d.messageId,
      title: d.title,
      task: payload.task || '',
      due: payload.due || null,
      urgency: missionUrgency(payload.due),
      senderNickname: d.senderNickname,
    };
  });
}

module.exports = {
  sendMessage, unreadFor, inboxFor, surveyResults, visibleSurveys,
  missionResults, myMissions, receivedMissions, pendingMissionsFor, missionUrgency,
};
