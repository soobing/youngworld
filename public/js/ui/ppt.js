// =====================================================================
// ppt.js — 강의자료/작품을 전체화면으로 크게 보여주는 모달(iframe)
// 칠판의 자료나 갤러리 작품을 클릭하면 열린다. Esc 또는 X 로 닫는다.
// =====================================================================

import { state } from '../state.js';

export function openPPT(url, title) {
  const modal = document.getElementById('ppt-modal');
  document.getElementById('ppt-title').textContent = title || '';
  // 로그인한 사람 이름을 작품(iframe)에 ?me= 로 넘겨준다.
  // 게임 순위표 등에서 이름을 직접 입력받지 않고 이 값으로 자동 저장할 수 있다.
  let src = url;
  const nick = state.me && state.me.nickname;
  if (nick) src += (url.includes('?') ? '&' : '?') + 'me=' + encodeURIComponent(nick);
  document.getElementById('ppt-frame').src = src;
  modal.classList.remove('hidden');
  state.uiOpen = true; // 게임 입력 잠금
}

export function closePPT() {
  const modal = document.getElementById('ppt-modal');
  if (modal.classList.contains('hidden')) return;
  document.getElementById('ppt-frame').src = 'about:blank'; // 재생 중이던 영상·소리도 멈춘다
  modal.classList.add('hidden');
  // 이 뷰어는 갤러리 팝업 위에 겹쳐서 열릴 수 있다(작품 카드 클릭).
  // 아래에 갤러리가 아직 남아 있으면 입력 잠금을 풀면 안 된다.
  // 풀어버리면 팝업이 떠 있는 채로 방향키에 캐릭터가 움직인다.
  const gallery = document.getElementById('gallery-modal');
  state.uiOpen = !!gallery && !gallery.classList.contains('hidden');
}

// 앱 시작 시 1번 호출(닫기 버튼/Esc 연결).
export function initPPT() {
  document.getElementById('ppt-close').addEventListener('click', closePPT);

  // Esc 는 "맨 위에 떠 있는 것 하나만" 닫아야 한다.
  //   이 자료 뷰어는 갤러리 팝업 위에 겹쳐서 열린다(z-index 150 vs 110).
  //   그런데 갤러리도 document 에 Esc 핸들러를 달아두기 때문에, 그냥 두면
  //   Esc 한 번에 뷰어와 갤러리가 같이 닫혀 게임 화면까지 튕겨 나간다.
  //   (main.js 에서 initGallery 가 먼저 등록돼 갤러리가 오히려 먼저 닫힌다)
  //
  //   그래서 캡처 단계로 먼저 잡고, 뷰어가 열려 있을 때만 이벤트를 여기서
  //   끊는다. 아래 레이어는 Esc 를 아예 못 본다. 뷰어가 닫혀 있으면 그냥
  //   흘려보내므로 갤러리 단독 Esc 는 그대로 동작한다.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape') return;
      if (document.getElementById('ppt-modal').classList.contains('hidden')) return;
      e.stopImmediatePropagation();
      closePPT();
    },
    true
  );
}
