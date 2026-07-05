// =====================================================================
// net.js — 서버와의 실시간 통신(Socket.io) 래퍼
// io() 는 index.html 에서 불러온 /socket.io/socket.io.js 가 전역으로 제공한다.
// 다른 파일들은 여기서 export 한 socket 과 함수를 통해 통신한다.
// =====================================================================

import { state } from './state.js';

export let socket = null;

// 간단한 이벤트 버스: 다른 모듈이 net 이벤트를 구독할 수 있게 한다.
const listeners = {};
export function onNet(event, handler) {
  (listeners[event] ||= []).push(handler);
}
// 구독 해제(씬이 바뀔 때 중복 핸들러가 쌓이지 않도록).
export function offNet(event, handler) {
  const arr = listeners[event];
  if (!arr) return;
  const i = arr.indexOf(handler);
  if (i >= 0) arr.splice(i, 1);
}
function emitLocal(event, data) {
  (listeners[event] || []).forEach((h) => h(data));
}

/**
 * 토큰으로 서버에 연결한다. 성공하면 world:init 을 받아 게임을 시작한다.
 * @param {string} token
 * @param {() => void} onReady  world:init 수신 후(=로그인 성공) 호출됨
 */
export function connect(token, onReady) {
  // 이미 연결돼 있으면 정리하고 새로 연결.
  if (socket) socket.disconnect();

  // same-origin 이라 URL 을 적지 않아도 된다. auth 로 토큰 전달.
  socket = io({ auth: { token } });

  // 연결 거부(토큰 만료 등) → 토큰 지우고 로그인 화면으로.
  socket.on('connect_error', (err) => {
    console.warn('[net] connect_error:', err.message);
    if (err.message === 'NO_SESSION') {
      localStorage.removeItem('yw_token');
      state.token = null;
      emitLocal('need-login');
    }
  });

  // 최초 월드 상태.
  socket.on('world:init', (data) => {
    state.me = data.me;
    state.scene = data.scene;
    state.pendingPlayers = data.players || [];
    state.blackboard = data.blackboard || [];
    state.guides = data.guides || [];
    // 갤러리는 구조화 객체 { categories, students } (없으면 null).
    state.gallery = data.gallery || null;
    state.inbox = data.inbox || [];
    emitLocal('world:init', data);
    if (onReady) onReady();
  });

  // 아래 이벤트들은 그대로 로컬 버스로 흘려보내서 씬/ui 가 구독하게 한다.
  const passthrough = [
    'player:joined', 'player:moved', 'player:left', 'scene:ready',
    'phone:new', 'phone:alarm', 'phone:answered',
    'player:renamed', 'me:updated', 'peer:sent',
    'survey:mine', 'survey:changed',
    'mission:mine', 'mission:received', 'mission:changed', 'mission:remind',
    'blackboard:update', 'gallery:update', 'guides:update', 'admin:done', 'error',
  ];
  passthrough.forEach((ev) => socket.on(ev, (d) => emitLocal(ev, d)));

  socket.on('error', (d) => console.warn('[net] error:', d));
}

// 서버로 이벤트 전송(짧은 헬퍼).
export function send(event, data) {
  if (socket) socket.emit(event, data);
}
