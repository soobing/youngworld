// =====================================================================
// phone.js — 받은 쪽지함 UI (학생·선생님 모두)
// 친구/선생님이 보낸 쪽지(sms)·투표(poll)·설문(survey)을 확인하고 답한다.
// 쪽지에는 "답장"을 보낼 수 있다. 안읽은 게 있으면 배지 숫자 + 맵 알림(💌).
//
// payload(내용) 모양:
//   sms   : { body: "쪽지 내용" }
//   poll  : { question: "질문", options: ["보기1","보기2", ...] }
//   survey: { questions: ["질문1","질문2", ...] }   // 레거시: 자유 서술 답
//         또는 { questions: [{ q:"질문1", options:["보기1","보기2", ...] }, ...] } // 다문항 객관식
// =====================================================================

import { state, isGuest } from '../state.js';
import { onNet, send } from '../net.js';

let inited = false;

export function initPhone() {
  if (inited) return;
  inited = true;

  const btn = document.getElementById('phone-button');
  // 게스트는 쪽지함이 없다.
  if (isGuest()) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'flex';
  btn.addEventListener('click', togglePanel);
  document.getElementById('phone-close').addEventListener('click', closePanel);

  renderInbox();
  updateBadge();

  // 새 쪽지 도착.
  onNet('phone:new', (item) => {
    if (!state.inbox.some((m) => m.deliveryId === item.deliveryId)) {
      state.inbox.unshift({ ...item, isRead: false });
    }
    renderInbox();
    updateBadge();
    beep();
    flash();
  });

  // 주기 알람(미확인 개수).
  onNet('phone:alarm', ({ unreadCount }) => {
    setBadge(unreadCount);
    if (unreadCount > 0) flash();
  });

  // 응답/읽음 완료 처리.
  onNet('phone:answered', ({ deliveryId }) => {
    const m = state.inbox.find((x) => x.deliveryId === deliveryId);
    if (m) { m.isRead = true; m.answered = true; if (m.type === 'mission') m.done = true; }
    renderInbox();
    updateBadge();
  });

  // 미션 마감 리마인더: 미완료 미션의 임박도를 갱신하고, 임박한 건 계속 알린다.
  onNet('mission:remind', ({ pending, urgent }) => {
    const byId = {};
    (pending || []).forEach((p) => { byId[p.deliveryId] = p; });
    let changed = false;
    for (const m of state.inbox) {
      if (m.type !== 'mission') continue;
      const p = byId[m.deliveryId];
      if (p) { if (m.urgency !== p.urgency) changed = true; m.urgency = p.urgency; m.done = false; }
    }
    if (changed) renderInbox();
    // 마감 임박(오늘/지남)한 미완료 미션은 토스트로 계속 상기시킨다.
    const hot = (urgent || []).filter((u) => u.urgency === 'today' || u.urgency === 'overdue');
    if (hot.length) {
      flash();
      const t = hot[0];
      const when = t.urgency === 'overdue' ? '기한이 지났어요' : '오늘까지예요';
      toast(`⏰ 미션 "${t.task}" ${when}! 아직 완료 전이에요`);
    }
  });
}

// 화면 왼쪽 위 토스트(여러 개 쌓임).
function toast(text) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const item = document.createElement('div');
  item.className = 'toast-item';
  item.textContent = text;
  stack.appendChild(item);
  setTimeout(() => { item.classList.add('out'); setTimeout(() => item.remove(), 300); }, 2600);
}

// 맵의 💌 알림에서 호출: 쪽지함을 연다.
export function openMailbox() {
  const p = document.getElementById('phone-panel');
  p.classList.remove('hidden');
  state.uiOpen = true;
  renderInbox();
}

function togglePanel() {
  const p = document.getElementById('phone-panel');
  const willOpen = p.classList.contains('hidden');
  p.classList.toggle('hidden');
  state.uiOpen = willOpen;
  if (willOpen) renderInbox();
}
function closePanel() {
  document.getElementById('phone-panel').classList.add('hidden');
  state.uiOpen = false;
}

function unreadCount() {
  return state.inbox.filter((m) => !m.isRead).length;
}
function updateBadge() {
  setBadge(unreadCount());
}
function setBadge(n) {
  const b = document.getElementById('phone-badge');
  if (n > 0) {
    b.textContent = n;
    b.classList.remove('hidden');
  } else {
    b.classList.add('hidden');
  }
}

// 쪽지함 버튼 흔들기(주의 끌기).
function flash() {
  const btn = document.getElementById('phone-button');
  btn.classList.remove('shake');
  void btn.offsetWidth; // 애니메이션 재시작 트릭
  btn.classList.add('shake');
}

// 짧은 "삐" 소리(WebAudio, 파일 없이).
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.05;
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 150);
  } catch (e) { /* 소리 실패는 무시 */ }
}

// 수신함 목록을 그린다.
function renderInbox() {
  const list = document.getElementById('phone-list');
  list.innerHTML = '';
  if (state.inbox.length === 0) {
    list.innerHTML = '<p class="phone-empty">아직 받은 쪽지가 없어요.</p>';
    return;
  }
  for (const m of state.inbox) {
    list.appendChild(renderItem(m));
  }
}

function renderItem(m) {
  const wrap = document.createElement('div');
  wrap.className = 'phone-item' + (m.isRead ? ' read' : '');

  const typeLabel = { sms: '쪽지', survey: '설문', mission: '미션' }[m.type] || m.type;
  const head = document.createElement('div');
  head.className = 'phone-item-head';
  const from = m.senderNickname ? `<span class="phone-from">✉ ${escapeHtml(m.senderNickname)}</span> ` : '';
  head.innerHTML = `<span class="phone-type ${m.type}">${typeLabel}</span> ${from}<b>${escapeHtml(m.title)}</b>`;
  wrap.appendChild(head);

  const body = document.createElement('div');
  body.className = 'phone-item-body';

  if (m.type === 'mission') {
    body.appendChild(el('p', m.payload.task || '', 'phone-q'));
    // 기한 + 임박도 배지.
    const meta = document.createElement('div');
    meta.className = 'mission-meta';
    const u = { overdue: '⏰ 기한 지남', today: '⏰ 오늘까지', soon: '⏳ 곧 마감' }[m.urgency];
    meta.innerHTML = (m.due ? `📅 기한: ${escapeHtml(m.due)}` : '기한 없음')
      + (u ? ` <span class="mission-urg ${m.urgency}">${u}</span>` : '');
    body.appendChild(meta);
    if (m.answered || m.done) {
      body.appendChild(el('span', '✅ 완료했어요', 'phone-done'));
    } else {
      body.appendChild(button('✔ 완료 체크', () => {
        m.answered = true; m.isRead = true; m.done = true;
        send('mission:complete', { deliveryId: m.deliveryId });
        renderInbox(); updateBadge();
      }));
    }
  } else if (m.type === 'sms') {
    body.innerHTML = `<p>${escapeHtml(m.payload.body || '')}</p>`;
    if (m.answered) {
      body.appendChild(el('span', '↩ 답장을 보냈어요', 'phone-done'));
    } else {
      // 확인(읽음) + 답장.
      const row = document.createElement('div');
      row.className = 'phone-btnrow';
      if (!m.isRead) {
        row.appendChild(button('확인', () => {
          send('phone:markRead', { deliveryId: m.deliveryId });
          m.isRead = true; renderInbox(); updateBadge();
        }));
      }
      // 나에게 보낸 사람이 있으면 답장 가능.
      if (m.senderId) row.appendChild(button('↩ 답장', () => openReply(wrap, m)));
      body.appendChild(row);
    }
  } else if (m.type === 'survey') {
    const qs = m.payload.questions || [];
    // 객관식 다문항 설문(questions가 {q, options} 객체 배열)인지 판별.
    const objQs = Array.isArray(qs) && qs.length > 0 && typeof qs[0] === 'object';
    if (objQs) {
      if (m.answered) {
        // 이미 응답함 → 문항별로 내 답(객관식=보기 / 주관식=서술)을 표시.
        const my = m.myAnswer && Array.isArray(m.myAnswer.answers) ? m.myAnswer.answers : [];
        const box = document.createElement('div');
        box.className = 'phone-myanswer';
        if (my.length) {
          qs.forEach((q, i) => {
            const ans = my[i];
            const hasOpts = Array.isArray(q.options) && q.options.length > 0;
            const shown = hasOpts
              ? (Number.isInteger(ans) ? (q.options[ans] || '') : '')
              : (typeof ans === 'string' ? ans : '');
            const line = document.createElement('div');
            line.className = 'phone-ans';
            line.innerHTML = `<strong>${escapeHtml(q.q || '')}</strong><br>ㄴ <b>${escapeHtml(shown)}</b>`;
            box.appendChild(line);
          });
        } else {
          box.textContent = '✅ 응답 완료';
        }
        body.appendChild(box);
      } else {
        // 아직 응답 안 함 → 질문마다 객관식(라디오)/주관식(텍스트)로 렌더.
        const controls = [];
        qs.forEach((q, qi) => {
          body.appendChild(el('p', q.q || '', 'phone-q'));
          const hasOpts = Array.isArray(q.options) && q.options.length > 0;
          if (hasOpts) {
            const name = `svy-${m.deliveryId}-${qi}`;
            q.options.forEach((opt, oi) => {
              const lab = document.createElement('label');
              lab.className = 'phone-opt';
              lab.innerHTML = `<input type="radio" name="${name}" value="${oi}"> ${escapeHtml(opt)}`;
              body.appendChild(lab);
            });
            controls.push({ kind: 'choice', name });
          } else {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'phone-answer';
            inp.placeholder = '자유롭게 적어주세요';
            body.appendChild(inp);
            controls.push({ kind: 'text', input: inp });
          }
        });
        body.appendChild(button('제출', () => {
          const answers = [];
          for (const c of controls) {
            if (c.kind === 'choice') {
              const sel = body.querySelector(`input[name="${c.name}"]:checked`);
              if (!sel) return; // 객관식은 반드시 선택해야 제출
              answers.push(Number(sel.value));
            } else {
              answers.push(c.input.value.trim()); // 주관식(빈칸 허용)
            }
          }
          m.myAnswer = { answers }; // 로컬에도 즉시 반영
          send('phone:respond', { deliveryId: m.deliveryId, answer: { answers } });
        }));
      }
    } else if (m.answered) {
      // 레거시 주관식 설문 → 이미 응답함: 내가 적은 답을 문항과 함께 표시.
      const my = m.myAnswer && Array.isArray(m.myAnswer.answers) ? m.myAnswer.answers : [];
      const box = document.createElement('div');
      box.className = 'phone-myanswer';
      if (my.length) {
        qs.forEach((q, i) => {
          const line = document.createElement('div');
          line.className = 'phone-ans';
          line.innerHTML = `<strong>${escapeHtml(q)}</strong><br>ㄴ <b>${escapeHtml(my[i] || '')}</b>`;
          box.appendChild(line);
        });
      } else {
        box.textContent = '✅ 응답 완료';
      }
      body.appendChild(box);
    } else {
      // 레거시 주관식 설문 → 아직 응답 안 함: 텍스트 입력.
      const inputs = [];
      qs.forEach((q) => {
        body.appendChild(el('p', q, 'phone-q'));
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'phone-answer';
        body.appendChild(inp);
        inputs.push(inp);
      });
      body.appendChild(button('제출', () => {
        const answers = inputs.map((i) => i.value);
        m.myAnswer = { answers }; // 로컬에도 즉시 반영
        send('phone:respond', { deliveryId: m.deliveryId, answer: { answers } });
      }));
    }
  }

  wrap.appendChild(body);
  return wrap;
}

// 답장 입력칸을 아이템 안에 펼친다.
function openReply(wrap, m) {
  if (wrap.querySelector('.phone-reply')) return; // 이미 열림
  const box = document.createElement('div');
  box.className = 'phone-reply';
  const ta = document.createElement('textarea');
  ta.className = 'phone-answer';
  ta.rows = 2;
  ta.placeholder = `${m.senderNickname || '보낸 사람'}에게 답장`;
  box.appendChild(ta);
  box.appendChild(button('보내기', () => {
    const text = ta.value.trim();
    if (!text) return;
    send('phone:reply', { deliveryId: m.deliveryId, body: text });
    m.isRead = true; m.answered = true;
    renderInbox(); updateBadge();
  }));
  wrap.appendChild(box);
  ta.focus();
}

// --- 작은 DOM 헬퍼들 ---
function el(tag, text, cls) { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; }
function button(text, onClick) { const b = document.createElement('button'); b.textContent = text; b.className = 'phone-btn'; b.addEventListener('click', onClick); return b; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
