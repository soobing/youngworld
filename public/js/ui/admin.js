// =====================================================================
// admin.js — 선생님(admin) 전용 "영월드 관리센터" 패널
// 3가지 기능: (1) 아바타 추가  (2) 아바타 삭제  (3) 강의자료 게시
// 이 버튼들은 선생님에게만 보이고, 서버도 admin 만 허용한다(2중 안전).
// =====================================================================

import { state, isAdmin } from '../state.js';
import { onNet, send } from '../net.js';

// 책장 문서 삭제 드롭다운을 state.guides 로 채운다.
function fillGuides() {
  const sel = document.getElementById('adm-guide-del');
  if (!sel) return;
  sel.innerHTML = '';
  (state.guides || []).forEach((g) => {
    const o = document.createElement('option');
    o.value = String(g.id);
    o.textContent = g.title;
    sel.appendChild(o);
  });
}

let inited = false;

export function initAdmin() {
  if (inited) return;
  inited = true;

  const btn = document.getElementById('admin-button');
  if (!isAdmin()) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'flex';
  btn.addEventListener('click', togglePanel);
  document.getElementById('admin-close').addEventListener('click', closePanel);

  fillDeletable(); // 아바타 삭제 드롭다운
  fillGuides();     // 책장 문서 삭제 드롭다운

  document.getElementById('adm-addavatar-btn').addEventListener('click', addAvatar);
  document.getElementById('adm-delavatar-btn').addEventListener('click', deleteAvatar);
  document.getElementById('adm-material-btn').addEventListener('click', postMaterial);
  document.getElementById('adm-guide-btn').addEventListener('click', addGuide);
  document.getElementById('adm-guide-del-btn').addEventListener('click', deleteGuide);

  onNet('admin:done', (d) => { toast('완료: ' + d.action); fillDeletable(); });
  onNet('guides:update', fillGuides); // 책장 갱신 시 삭제 목록도 갱신
  onNet('error', (d) => toast('오류: ' + (d.message || d.code)));
}

function togglePanel() {
  const p = document.getElementById('admin-panel');
  const willOpen = p.classList.contains('hidden');
  p.classList.toggle('hidden');
  state.uiOpen = willOpen;
  if (willOpen) { fillDeletable(); fillGuides(); }
}
function closePanel() {
  document.getElementById('admin-panel').classList.add('hidden');
  state.uiOpen = false;
}

// 삭제 가능한 아바타(학생·게스트, 선생님 제외) 드롭다운 채우기.
async function fillDeletable() {
  let list = [];
  try { list = await (await fetch('/api/avatars')).json(); } catch (e) { return; }
  const sel = document.getElementById('adm-del-nick');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  list.filter((a) => a.role !== 'admin').forEach((a) => {
    const o = document.createElement('option');
    o.value = a.nickname;
    o.textContent = a.nickname + (a.role === 'guest' ? ' (게스트)' : ' (학생)');
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;
}

// 아바타 추가. 초기 비밀번호를 선생님이 지정할 수 있다(비우면 서버가 1234 로).
function addAvatar() {
  const nickname = document.getElementById('adm-new-nick').value.trim();
  const role = document.getElementById('adm-new-role').value;
  const password = document.getElementById('adm-new-pw').value.trim();
  if (!nickname) return;
  send('admin:addAvatar', { nickname, role, password });
  document.getElementById('adm-new-nick').value = '';
  document.getElementById('adm-new-pw').value = '';
  setTimeout(fillDeletable, 300); // 목록 갱신
}

// 아바타 삭제.
function deleteAvatar() {
  const nickname = document.getElementById('adm-del-nick').value;
  if (!nickname) return;
  send('admin:deleteAvatar', { nickname });
  setTimeout(fillDeletable, 300);
}

// 강의자료 게시.
function postMaterial() {
  const title = document.getElementById('adm-mat-title').value.trim();
  const url = document.getElementById('adm-mat-url').value.trim();
  const sessionNo = Number(document.getElementById('adm-mat-session').value) || null;
  if (!title || !url) return;
  send('admin:postMaterial', { title, url, sessionNo, slot: 0 });
}

// 책장 문서 추가.
function addGuide() {
  const title = document.getElementById('adm-guide-title').value.trim();
  const url = document.getElementById('adm-guide-url').value.trim();
  if (!title || !url) return;
  send('admin:addGuide', { title, url, slot: (state.guides || []).length });
  document.getElementById('adm-guide-title').value = '';
  document.getElementById('adm-guide-url').value = '';
}

// 책장 문서 삭제.
function deleteGuide() {
  const id = Number(document.getElementById('adm-guide-del').value);
  if (!id) return;
  send('admin:deleteGuide', { id });
}

// 화면 왼쪽 위 토스트(여러 개 쌓임).
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
  }, 2000);
}
