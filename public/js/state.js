// =====================================================================
// state.js — 클라이언트 공유 상태
// Phaser 씬은 화면이 바뀔 때마다 새로 만들어지므로(=변수 사라짐),
// 씬이 바뀌어도 유지돼야 하는 값들은 여기(씬 바깥 모듈)에 둔다.
// =====================================================================

export const state = {
  token: localStorage.getItem('yw_token') || null,

  me: null,          // 내 아바타 { id, nickname, role, color, x, y, scene }
  scene: 'island',   // 현재 씬 이름

  pendingPlayers: [], // 씬 시작 시 그려야 할 "다른 플레이어" 목록(서버가 방금 알려준)
  blackboard: [],     // 칠판 강의자료 목록
  guides: [],         // 교실 책장 How-to 문서 목록 [{id,title,url,slot}]
  gallery: null,      // 작품 갤러리(구조화): { categories, students:[{id,nickname,color,works}] }
  inbox: [],          // 내 핸드폰 수신함(학생만)

  uiOpen: false,      // HTML 패널(로그인/핸드폰/admin/PPT)이 열려 있으면 true → 게임 입력 차단
  game: null,         // Phaser.Game 인스턴스
};

// 게스트/선생님 여부 편의 함수.
export const isGuest = () => state.me && state.me.role === 'guest';
export const isAdmin = () => state.me && state.me.role === 'admin';
export const isStudent = () => state.me && state.me.role === 'student';
