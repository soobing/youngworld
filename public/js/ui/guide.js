// =====================================================================
// guide.js — 교실 책장(How-to 문서 보관함) 팝업
// 책장을 클릭하면 보관 중인 안내 문서 목록이 뜨고, 항목을 클릭하면 열람(openPPT).
// 칠판과 달리 아무 때나 열람하는 참고 자료(가입법 등)를 모아둔다.
// =====================================================================

import { state } from '../state.js';
import { onNet } from '../net.js';
import { openPPT } from './ppt.js';

let inited = false;

export function initGuide() {
  if (inited) return;
  inited = true;

  document.getElementById('guide-close').addEventListener('click', closeGuide);

  // 책장 문서가 갱신되면(선생님이 추가/삭제) 열려 있을 때 다시 그린다.
  onNet('guides:update', ({ guides }) => {
    state.guides = guides || [];
    const p = document.getElementById('guide-panel');
    if (p && !p.classList.contains('hidden')) renderList();
  });
}

// 책장(교실 오브젝트)에서 호출: 목록 팝업을 연다.
export function openGuide() {
  const p = document.getElementById('guide-panel');
  p.classList.remove('hidden');
  state.uiOpen = true;
  renderList();
}

function closeGuide() {
  document.getElementById('guide-panel').classList.add('hidden');
  state.uiOpen = false;
}

function renderList() {
  const box = document.getElementById('guide-list');
  box.innerHTML = '';
  const guides = state.guides || [];
  if (guides.length === 0) {
    box.innerHTML = '<p class="pix-hint">아직 보관 중인 문서가 없어요.</p>';
    return;
  }
  for (const g of guides) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'guide-item';
    item.innerHTML = `<span class="guide-item-ic">📄</span><span class="guide-item-title"></span>`;
    item.querySelector('.guide-item-title').textContent = g.title;
    item.addEventListener('click', () => { if (g.url) openPPT(g.url, g.title); });
    box.appendChild(item);
  }
}
