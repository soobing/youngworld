// =====================================================================
// gallery.js — "작품 갤러리" 팝업(게임 메뉴 창, 픽셀)
// 학생별로 4가지 작품(자기소개/꿈/5년뒤 게임/10년뒤 웹툰)을 전시·열람한다.
// ◀ / ▶ 로 학생을 넘겨가며 보고, 전시된 작품 카드를 누르면 openPPT()로 크게 본다.
// 게스트도 감상은 할 수 있다(숨기지 않음).
// =====================================================================

import { state } from '../state.js';
import { onNet } from '../net.js';
import { openPPT } from './ppt.js';

let inited = false;
let currentIndex = 0; // 지금 보고 있는 학생 인덱스

export function initGallery() {
  if (inited) return;
  inited = true;

  document.getElementById('gallery-close').addEventListener('click', closeGallery);
  document.getElementById('gallery-prev').addEventListener('click', () => changeStudent(-1));
  document.getElementById('gallery-next').addEventListener('click', () => changeStudent(1));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGallery();
  });

  // 선생님이 작품을 새로 전시/교체하면 최신 데이터로 반영(열려 있으면 즉시 다시 그림).
  onNet('gallery:update', (d) => {
    state.gallery = (d && d.gallery) || null;
    const modal = document.getElementById('gallery-modal');
    if (modal && !modal.classList.contains('hidden')) render();
  });
}

// 다른 모듈(ClassroomScene 등)에서 호출: 갤러리를 열고 특정 학생부터 보여준다.
// studentId 가 없거나 목록에서 못 찾으면 첫 번째 학생부터 보여준다.
export function openGallery(studentId) {
  const modal = document.getElementById('gallery-modal');
  modal.classList.remove('hidden');
  state.uiOpen = true;

  const list = students();
  if (studentId != null) {
    const idx = list.findIndex((s) => s.id === studentId);
    currentIndex = idx >= 0 ? idx : 0;
  } else if (currentIndex >= list.length) {
    currentIndex = 0;
  }
  render();
}

function closeGallery() {
  const modal = document.getElementById('gallery-modal');
  if (modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  state.uiOpen = false;
}

function changeStudent(delta) {
  const list = students();
  if (!list.length) return;
  currentIndex = (currentIndex + delta + list.length) % list.length;
  render();
}

function students() {
  return (state.gallery && state.gallery.students) || [];
}
function categories() {
  return (state.gallery && state.gallery.categories) || [];
}

function render() {
  const nameEl = document.getElementById('gallery-name');
  const dotEl = document.getElementById('gallery-dot');
  const grid = document.getElementById('gallery-grid');
  const line = document.getElementById('gallery-line');
  const prevBtn = document.getElementById('gallery-prev');
  const nextBtn = document.getElementById('gallery-next');

  const list = students();

  if (!state.gallery || list.length === 0) {
    nameEl.textContent = '-';
    dotEl.style.background = 'transparent';
    grid.innerHTML = '';
    line.textContent = '아직 전시된 작품이 없어요.';
    line.className = 'pix-line';
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    return;
  }

  prevBtn.disabled = list.length <= 1;
  nextBtn.disabled = list.length <= 1;

  const student = list[currentIndex];
  const who = student.role === 'admin' ? `${student.nickname} 선생님` : student.nickname;
  nameEl.textContent = `${who} (${currentIndex + 1}/${list.length})`;
  dotEl.style.background = student.color || '#8ee07a';
  line.textContent = '';
  line.className = 'pix-line';

  grid.innerHTML = '';
  for (const cat of categories()) {
    const work = student.works ? student.works[cat.key] : null;
    grid.appendChild(buildCard(cat, work));
  }
}

function buildCard(cat, work) {
  const has = !!(work && work.url);

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'gal-card' + (has ? ' filled' : ' empty');
  if (has && work.thumbnail) {
    card.style.backgroundImage = `url("${work.thumbnail}")`;
  }

  const icon = document.createElement('span');
  icon.className = 'gal-card-icon';
  icon.textContent = cat.icon || '🖼️';
  card.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'gal-card-label';
  label.textContent = cat.label;
  card.appendChild(label);

  if (cat.sub) {
    const sub = document.createElement('span');
    sub.className = 'gal-card-sub';
    sub.textContent = cat.sub;
    card.appendChild(sub);
  }

  const status = document.createElement('span');
  status.className = 'gal-card-status';
  status.textContent = has ? '✔ 전시됨' : '전시 준비 중';
  card.appendChild(status);

  if (has) {
    card.addEventListener('click', () => {
      openPPT(work.url, cat.label + (cat.sub ? ' ' + cat.sub : ''));
    });
  } else {
    card.disabled = true;
  }

  return card;
}
