// =====================================================================
// touch.js — 모바일 이동 D-패드 + 터치 기기 감지
// 터치(coarse pointer) 기기에서만 화면 왼쪽 아래 방향 버튼을 켜고,
// 버튼 눌림을 state.touch 로 전달한다. WorldScene 이 키보드와 함께 읽는다.
// PC(마우스, fine pointer)에서는 아무것도 하지 않는다(기존과 동일).
// =====================================================================

import { state } from '../state.js';

// 터치 기기 여부: coarse 포인터(손가락)면 모바일/태블릿으로 본다.
export function isTouchDevice() {
  return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}

let inited = false;

export function initTouch() {
  if (inited) return;
  inited = true;

  // 표시는 터치 기기에서만(CSS). 단, 버튼 배선은 항상 해둔다
  // → 터치 노트북·개발자도구 에뮬레이션에서도 동작하고, 숨겨진 버튼은 무해.
  if (isTouchDevice()) document.body.classList.add('touch');
  const pad = document.getElementById('touch-dpad');
  if (!pad) return;

  const set = (dir, on) => { if (dir in state.touch) state.touch[dir] = on; };
  const clearAll = () => { state.touch.up = state.touch.down = state.touch.left = state.touch.right = false; };

  pad.querySelectorAll('.dpad-btn').forEach((btn) => {
    const dir = btn.dataset.dir;
    // 포인터 이벤트로 누름/뗌 처리(터치·마우스 공통). 스크롤/확대 방지.
    const press = (e) => { e.preventDefault(); set(dir, true); btn.classList.add('active'); };
    const release = (e) => { if (e) e.preventDefault(); set(dir, false); btn.classList.remove('active'); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    // 손가락이 버튼 밖으로 미끄러져도 확실히 멈추도록.
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // 창이 가려지거나(백그라운드) UI 패널이 열리면 눌림 초기화(계속 이동하는 것 방지).
  window.addEventListener('blur', clearAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearAll(); });
}
