// =====================================================================
// ppt.js — 강의자료/작품을 전체화면으로 크게 보여주는 모달(iframe)
// 칠판의 자료나 갤러리 작품을 클릭하면 열린다. Esc 또는 X 로 닫는다.
// =====================================================================

import { state } from '../state.js';

export function openPPT(url, title) {
  const modal = document.getElementById('ppt-modal');
  document.getElementById('ppt-title').textContent = title || '';
  document.getElementById('ppt-frame').src = url;
  modal.classList.remove('hidden');
  state.uiOpen = true; // 게임 입력 잠금
}

export function closePPT() {
  const modal = document.getElementById('ppt-modal');
  if (modal.classList.contains('hidden')) return;
  document.getElementById('ppt-frame').src = 'about:blank';
  modal.classList.add('hidden');
  state.uiOpen = false;
}

// 앱 시작 시 1번 호출(닫기 버튼/Esc 연결).
export function initPPT() {
  document.getElementById('ppt-close').addEventListener('click', closePPT);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePPT();
  });
}
