// =====================================================================
// retro.js — 캠프파이어 회고 롤링페이퍼
// 텐트 안 모닥불(📜)을 누르면 열린다. 탭 3개로 나뉜다.
//   ✍️ 쓰기      : 좋았던 점 / 아쉬웠던 점 / 앞으로 하고 싶은 것 + 친구별 비밀 한마디
//   📖 모두의 회고 : 공개 3칸만 함께 읽는다(비밀 한마디는 절대 안 나온다)
//   💌 나에게 온 편지 : 나에게 온 비밀 한마디만
//
// 비밀 보장은 서버에서 지킨다(socket.js 의 retroPayload). 화면은 서버가 준 것만 그린다.
// =====================================================================

import { state, isGuest } from '../state.js';
import { send, onNet } from '../net.js';

let inited = false;
let data = null;            // 서버가 준 마지막 회고 데이터
let currentTab = 'write';
let preserveDraft = false;  // 남이 저장해서 새로고침한 경우 → 내가 쓰던 글은 건드리지 않는다

const FIELDS = ['retro-good', 'retro-bad', 'retro-next'];

export function initRetro() {
  if (inited) return;
  inited = true;

  document.getElementById('retro-close').addEventListener('click', closeRetro);
  document.getElementById('retro-save').addEventListener('click', saveRetro);

  document.querySelectorAll('#retro-panel .retro-tab').forEach((t) => {
    t.addEventListener('click', () => selectTab(t.dataset.rtab));
  });

  // 글자 수 표시 + 체크리스트 갱신.
  for (const id of FIELDS) {
    document.getElementById(id).addEventListener('input', onType);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeRetro();
  });

  // --- 서버 이벤트 ---
  onNet('retro:data', (d) => {
    data = d || null;
    renderAll();
    preserveDraft = false;
  });
  onNet('retro:saved', () => {
    line('모닥불에 올렸어요! 언제든 다시 고쳐 쓸 수 있어요 🔥', 'ok');
    toast('🔥 회고를 모닥불에 올렸어요');
  });
  // 다른 사람이 회고를 올리면 목록만 조용히 새로고침(내가 쓰던 글은 유지).
  onNet('retro:changed', () => {
    if (isOpen()) { preserveDraft = true; send('retro:load'); }
  });
  // 저장 실패(빈 칸 등) — 회고 창이 열려 있을 때만 이 창에 표시한다.
  onNet('error', (d) => {
    if (!isOpen() || !d) return;
    const code = String(d.code || ''), action = String(d.action || '');
    if (code.startsWith('BAD_RETRO') || action.startsWith('retro:')) line(d.message || '저장하지 못했어요', 'err');
  });
  // 나에게 비밀 한마디가 도착했을 때.
  onNet('retro:whisper', () => {
    toast('💌 모닥불에 나에게 온 비밀 편지가 도착했어요');
    if (isOpen()) { preserveDraft = true; send('retro:load'); }
  });
}

function isOpen() {
  const p = document.getElementById('retro-panel');
  return p && !p.classList.contains('hidden');
}

// 텐트 안 모닥불에서 호출.
export function openRetro() {
  if (isGuest()) {
    toast('🔒 게스트는 회고를 볼 수 없어요 — 친구들의 소중한 이야기니까요');
    return;
  }
  document.getElementById('retro-panel').classList.remove('hidden');
  state.uiOpen = true;
  line('', '');
  selectTab(currentTab);
  send('retro:load');          // 최신 상태를 받아 화면을 채운다
  if (data) renderAll();       // 이미 받아둔 게 있으면 먼저 보여준다(깜빡임 방지)
}

function closeRetro() {
  if (!isOpen()) return;
  document.getElementById('retro-panel').classList.add('hidden');
  state.uiOpen = false;
}

function selectTab(name) {
  currentTab = name;
  document.querySelectorAll('#retro-panel .retro-tab').forEach((t) =>
    t.classList.toggle('selected', t.dataset.rtab === name)
  );
  document.querySelectorAll('#retro-panel .retro-pane').forEach((p) =>
    p.classList.toggle('hidden', p.dataset.rpane !== name)
  );
  document.querySelector('#retro-panel .retro-body').scrollTop = 0;
}

// ---------------------------------------------------------------------
// 그리기
// ---------------------------------------------------------------------
function renderAll() {
  renderWrite();
  renderPapers();
  renderReceived();
  updateChecklist();
}

// 쓰기 탭: 서버에 저장된 내 회고를 채운다(내가 쓰던 중이면 건드리지 않음).
function renderWrite() {
  if (!data) return;
  if (!preserveDraft) {
    const mine = data.mine || {};
    document.getElementById('retro-good').value = mine.good || '';
    document.getElementById('retro-bad').value = mine.bad || '';
    document.getElementById('retro-next').value = mine.nextStep || '';
  }
  renderPeople();
  for (const id of FIELDS) updateCount(id);
}

// 친구별 비밀 한마디 입력칸(사람 수만큼).
function renderPeople() {
  const box = document.getElementById('retro-people');
  const people = (data && data.people) || [];

  // 이미 그려둔 상태에서 새로고침이면 입력 중인 내용을 지키기 위해 값만 유지한다.
  const typed = {};
  box.querySelectorAll('textarea[data-to]').forEach((t) => { typed[t.dataset.to] = t.value; });

  box.innerHTML = '';
  if (people.length === 0) {
    box.innerHTML = '<p class="retro-empty">아직 함께할 친구가 없어요.</p>';
    return;
  }

  const saved = {};
  for (const f of (data.myFeedbacks || [])) saved[f.toId] = f.body;

  for (const p of people) {
    const card = document.createElement('div');
    card.className = 'retro-person';

    const head = document.createElement('div');
    head.className = 'retro-person-head';
    const dot = document.createElement('span');
    dot.className = 'retro-dot';
    dot.style.background = p.color || '#adb5bd';
    const name = document.createElement('span');
    name.className = 'retro-person-name';
    name.textContent = p.role === 'admin' ? `${p.nickname} 선생님` : p.nickname;
    const lock = document.createElement('span');
    lock.className = 'retro-person-lock';
    lock.textContent = `🔒 ${p.nickname}만 볼 수 있어요`;
    head.append(dot, name, lock);

    const ta = document.createElement('textarea');
    ta.className = 'retro-input retro-input-sm';
    ta.rows = 2;
    ta.maxLength = 400;
    ta.dataset.to = String(p.id);
    ta.placeholder = `${p.nickname}에게 하고 싶은 말을 적어보세요`;
    ta.value = preserveDraft && typed[p.id] !== undefined ? typed[p.id] : (saved[p.id] || '');
    ta.addEventListener('input', onType);

    card.append(head, ta);
    box.appendChild(card);
  }
}

// 모두의 회고(공개 3칸).
function renderPapers() {
  const box = document.getElementById('retro-papers');
  const papers = (data && data.papers) || [];
  box.innerHTML = '';
  if (papers.length === 0) {
    box.innerHTML = '<p class="retro-empty">아직 아무도 회고를 올리지 않았어요. 첫 번째로 올려볼까요? 🔥</p>';
    return;
  }
  for (const p of papers) {
    const card = document.createElement('article');
    card.className = 'retro-card';

    const head = document.createElement('div');
    head.className = 'retro-card-head';
    const dot = document.createElement('span');
    dot.className = 'retro-dot';
    dot.style.background = p.color || '#adb5bd';
    const who = document.createElement('b');
    who.textContent = p.role === 'admin' ? `${p.nickname} 선생님` : p.nickname;
    head.append(dot, who);
    if (state.me && p.authorId === state.me.id) {
      const meTag = document.createElement('span');
      meTag.className = 'retro-metag';
      meTag.textContent = '나';
      head.appendChild(meTag);
    }
    card.appendChild(head);

    card.appendChild(section('😊 좋았던 점', p.good));
    card.appendChild(section('😥 아쉬웠던 점', p.bad));
    card.appendChild(section('🌱 앞으로 하고 싶은 것', p.nextStep));
    box.appendChild(card);
  }
}

function section(title, body) {
  const wrap = document.createElement('div');
  wrap.className = 'retro-sec';
  const h = document.createElement('div');
  h.className = 'retro-sec-t';
  h.textContent = title;
  const b = document.createElement('p');
  b.className = 'retro-sec-b';
  b.textContent = body || '';
  wrap.append(h, b);
  return wrap;
}

// 나에게 온 비밀 편지.
function renderReceived() {
  const box = document.getElementById('retro-received');
  const list = (data && data.received) || [];
  const badge = document.getElementById('retro-mine-badge');
  badge.textContent = String(list.length);
  badge.classList.toggle('hidden', list.length === 0);

  box.innerHTML = '';
  if (list.length === 0) {
    box.innerHTML = '<p class="retro-empty">아직 도착한 편지가 없어요. 조금만 기다려볼까요? 💌</p>';
    return;
  }
  for (const f of list) {
    const card = document.createElement('article');
    card.className = 'retro-letter';
    const head = document.createElement('div');
    head.className = 'retro-card-head';
    const dot = document.createElement('span');
    dot.className = 'retro-dot';
    dot.style.background = f.color || '#adb5bd';
    const who = document.createElement('b');
    who.textContent = `${f.nickname} →  나에게`;
    head.append(dot, who);
    const body = document.createElement('p');
    body.className = 'retro-letter-b';
    body.textContent = f.body;
    card.append(head, body);
    box.appendChild(card);
  }
}

// ---------------------------------------------------------------------
// 입력 상태(글자 수 · 필수 4칸 체크리스트)
// ---------------------------------------------------------------------
function onType(e) {
  if (e && e.target && e.target.id) updateCount(e.target.id);
  updateChecklist();
}

function updateCount(id) {
  const el = document.getElementById(id);
  const label = document.querySelector(`.retro-count[data-count-for="${id}"]`);
  if (el && label) label.textContent = `${el.value.length} / ${el.maxLength}`;
}

function feedbackEntries() {
  return [...document.querySelectorAll('#retro-people textarea[data-to]')].map((t) => ({
    toId: Number(t.dataset.to),
    body: t.value.trim(),
  }));
}

function updateChecklist() {
  const box = document.getElementById('retro-checklist');
  if (!box) return;
  const v = (id) => document.getElementById(id).value.trim();
  const wrote = feedbackEntries().filter((f) => f.body).length;
  const items = [
    ['좋았던 점', !!v('retro-good')],
    ['아쉬웠던 점', !!v('retro-bad')],
    ['앞으로 하고 싶은 것', !!v('retro-next')],
    [`친구에게 한마디 (${wrote}명)`, wrote > 0],
  ];
  box.innerHTML = '';
  for (const [label, done] of items) {
    const chip = document.createElement('span');
    chip.className = 'retro-chip' + (done ? ' done' : '');
    chip.textContent = (done ? '✅ ' : '⬜ ') + label;
    box.appendChild(chip);
  }
}

// ---------------------------------------------------------------------
// 저장
// ---------------------------------------------------------------------
function saveRetro() {
  const good = document.getElementById('retro-good').value.trim();
  const bad = document.getElementById('retro-bad').value.trim();
  const nextStep = document.getElementById('retro-next').value.trim();
  const feedbacks = feedbackEntries();

  if (!good || !bad || !nextStep) {
    line('좋았던 점 · 아쉬웠던 점 · 앞으로 하고 싶은 것을 모두 채워주세요 ✍️', 'err');
    return;
  }
  if (!feedbacks.some((f) => f.body)) {
    line('친구 한 명에게라도 비밀 한마디를 남겨주세요 💌 (받는 사람만 볼 수 있어요)', 'err');
    return;
  }
  line('올리는 중…', '');
  preserveDraft = true; // 저장 직후 돌아오는 데이터로 내 입력이 튀지 않게
  send('retro:save', { good, bad, nextStep, feedbacks });
}

function line(text, kind) {
  const el = document.getElementById('retro-line');
  if (!el) return;
  el.textContent = text;
  el.className = 'retro-line' + (kind ? ' ' + kind : '');
}

// 화면 아래 토스트(다른 UI 와 같은 방식).
function toast(text) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const item = document.createElement('div');
  item.className = 'toast-item';
  item.textContent = text;
  stack.appendChild(item);
  setTimeout(() => {
    item.classList.add('out');
    setTimeout(() => item.remove(), 300);
  }, 3200);
}
