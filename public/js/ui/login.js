// =====================================================================
// login.js — 로그인 / 첫 비밀번호 설정 화면(HTML 폼)
// 소켓 연결 전에 동작해야 하므로 /api HTTP 를 쓴다.
//   - 이름을 드롭다운에서 고른다(게스트는 비번칸 숨김)
//   - 처음 로그인(초기 비번 1234)이면 새 비번 설정 화면으로 넘어간다
// =====================================================================

import { state } from '../state.js';
import { connect } from '../net.js';

let onReady = null;

// 현재 고른 캐릭터 카드 정보(드롭다운 <select> 를 대체).
let selectedNick = null;
let selectedNeeds = false;

// 아바타 점(dot) 색 = 서버가 준 DB 색(avatars.color). 인게임 미니미·갤러리와 통일.
function dotColor(a) {
  return a.color || '#adb5bd';
}

export function initLogin(readyCb) {
  onReady = readyCb;

  // 아바타 목록으로 캐릭터 카드 채우기.
  fetch('/api/avatars')
    .then((r) => r.json())
    .then((list) => {
      // 카드 순서: 선생님 → 게스트 → 학생(원래 id 순).
      // 2열 그리드라 [선생님·게스트] / [학생1·학생2] / [학생3·학생4] / [학생5] 로 배치된다.
      const rank = (a) => (a.role === 'admin' ? 0 : a.role === 'guest' ? 1 : 2);
      list.sort((x, y) => rank(x) - rank(y)); // 안정 정렬 → 학생끼리는 원래 순서 유지

      const box = document.getElementById('login-cards');
      box.innerHTML = '';
      selectedNick = null;
      selectedNeeds = false;
      list.forEach((a, i) => {
        const roleLabel = a.role === 'admin' ? '선생님' : a.role === 'guest' ? '게스트' : '학생';
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'lg-card' + (a.role === 'admin' ? ' lg-card-admin' : a.role === 'guest' ? ' lg-card-guest' : '');
        card.dataset.nick = a.nickname;
        card.dataset.needs = a.needsPassword;
        card.setAttribute('role', 'option');
        card.setAttribute('aria-selected', 'false');

        const dot = document.createElement('span');
        dot.className = 'lg-card-dot';
        dot.style.background = dotColor(a);
        dot.textContent = a.nickname.slice(0, 1);

        const meta = document.createElement('span');
        meta.className = 'lg-card-meta';
        const name = document.createElement('span');
        name.className = 'lg-card-name';
        name.textContent = a.nickname;
        const role = document.createElement('span');
        role.className = 'lg-card-role';
        role.textContent = roleLabel;
        meta.appendChild(name);
        meta.appendChild(role);

        card.appendChild(dot);
        card.appendChild(meta);
        card.addEventListener('click', () => selectCard(card));
        box.appendChild(card);

        // 첫 카드를 기본 선택.
        if (i === 0) selectCard(card);
      });
    });

  document.getElementById('login-btn').addEventListener('click', doLogin);
  document.getElementById('login-pw').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('setpw-btn').addEventListener('click', doSetPw);
}

// 카드 하나를 고른다: 강조 표시 + 선택값 저장 + 비번칸 토글.
function selectCard(card) {
  const box = document.getElementById('login-cards');
  for (const c of box.querySelectorAll('.lg-card')) {
    c.classList.remove('selected');
    c.setAttribute('aria-selected', 'false');
  }
  card.classList.add('selected');
  card.setAttribute('aria-selected', 'true');
  selectedNick = card.dataset.nick;
  selectedNeeds = card.dataset.needs === 'true';
  togglePwRow();
}

// 게스트면 비밀번호 칸을 숨긴다.
function togglePwRow() {
  document.getElementById('login-pw-row').style.display = selectedNeeds ? 'block' : 'none';
}

function setMsg(id, text) {
  document.getElementById(id).textContent = text || '';
}

async function doLogin() {
  const nickname = selectedNick;
  const password = document.getElementById('login-pw').value;
  setMsg('login-msg', '');
  if (!nickname) {
    setMsg('login-msg', '캐릭터를 골라주세요.');
    return;
  }

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    setMsg('login-msg', data.message || '로그인에 실패했습니다.');
    return;
  }

  state.token = data.token;
  localStorage.setItem('yw_token', data.token);

  // 초기 비번(1234)을 아직 안 바꿨으면 비번 설정 화면으로.
  if (data.mustChange) {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('setpw-form').classList.remove('hidden');
    return;
  }
  connect(state.token, onReady);
}

async function doSetPw() {
  const newPassword = document.getElementById('setpw-input').value;
  setMsg('setpw-msg', '');
  const res = await fetch('/api/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: state.token, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) {
    setMsg('setpw-msg', data.message || '설정에 실패했습니다.');
    return;
  }
  connect(state.token, onReady);
}

export function showLogin() {
  document.getElementById('login-panel').classList.remove('hidden');
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('setpw-form').classList.add('hidden');
  state.uiOpen = true;
}

export function hideLogin() {
  document.getElementById('login-panel').classList.add('hidden');
  state.uiOpen = false;
}
