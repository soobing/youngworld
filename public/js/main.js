// =====================================================================
// main.js — 클라이언트 시작점
// 흐름: 로그인 → 서버 연결(world:init) → Phaser 게임 시작 → 핸드폰/어드민 UI 준비
// =====================================================================

import { state } from './state.js';
import { connect, onNet } from './net.js';
import { BootScene } from './scenes/BootScene.js';
import { IslandScene } from './scenes/IslandScene.js';
import { ClassroomScene } from './scenes/ClassroomScene.js';
import { initLogin, showLogin, hideLogin } from './ui/login.js';
import { initPhone } from './ui/phone.js';
import { initMe } from './ui/me.js';
import { initGallery } from './ui/gallery.js';
import { initGuide } from './ui/guide.js';
import { initAdmin } from './ui/admin.js';
import { initPPT } from './ui/ppt.js';
import { showIntro } from './ui/intro.js';
import { initTouch, isTouchDevice } from './ui/touch.js';

let uiReady = false;

// world:init 을 받은 뒤(로그인 성공) 호출됨.
function startGame() {
  hideLogin();

  // Phaser 게임은 딱 한 번만 만든다.
  if (!state.game) {
    // 화면 맞춤: PC 는 FIT(전체가 다 보임, 여백 생김), 모바일은 ENVELOP(잘리더라도 꽉 채움).
    const scaleMode = isTouchDevice() ? Phaser.Scale.ENVELOP : Phaser.Scale.FIT;
    state.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: 800,
      height: 600,
      backgroundColor: '#89c2d9',
      pixelArt: true,      // 픽셀을 뭉개지 않고 또렷하게(NEAREST 필터)
      roundPixels: true,
      physics: { default: 'arcade', arcade: { debug: false } },
      scale: { mode: scaleMode, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [BootScene, IslandScene, ClassroomScene],
    });
  }

  // 로그인 후 UI(핸드폰/어드민/비번변경) 준비 — 한 번만.
  if (!uiReady) {
    uiReady = true;
    initPhone();
    initMe();
    initGallery();
    initGuide();
    initAdmin();
    initTouch();   // 모바일 이동 D-패드(터치 기기에서만)
  }
}

// 세션이 끊겨 재로그인이 필요할 때.
onNet('need-login', () => showLogin());

window.addEventListener('DOMContentLoaded', () => {
  initLogin(startGame);
  initPPT();

  // 로그아웃: 토큰 지우고 새로고침 → 소켓/게임이 깔끔히 정리되고 로그인 화면으로 돌아간다.
  document.getElementById('logout-button').addEventListener('click', () => {
    localStorage.removeItem('yw_token');
    location.reload();
  });

  // 먼저 환영 애니메이션을 보여주고, 사라진 뒤 로그인 흐름으로.
  showIntro(() => {
    if (state.token) {
      connect(state.token, startGame); // 저장된 토큰 → 자동 접속
    } else {
      showLogin();                     // 없으면 로그인 화면
    }
  });
});
