// =====================================================================
// permissions.js — 역할별 권한 규칙 (서버에서 강제)
// 클라이언트가 버튼을 숨기는 건 "장식"일 뿐이고, 진짜 권한 검사는 여기서 한다.
// 모든 변경(mutating) 소켓 이벤트 핸들러는 첫 줄에서 can(role, action) 을 확인.
// =====================================================================

// 각 역할이 할 수 있는 action 목록.
// admin 은 '*' 로 전부 허용.
const RULES = {
  admin: '*',
  student: new Set([
    'player:move',
    'scene:enter',
    'phone:markRead',
    'phone:respond',
    // 자기 설정(닉네임) + 친구끼리 쪽지/투표/답장
    'me:setNickname',
    'peer:send',
    'peer:survey',
    'phone:reply',
    'survey:view',
    'mission:complete',
    'mission:view',
  ]),
  guest: new Set([
    // 게스트는 돌아다니며 관람만 가능. 핸드폰/생성/admin 전부 불가.
    'player:move',
    'scene:enter',
  ]),
};

/**
 * role 이 action 을 할 수 있는가?
 * @param {'admin'|'student'|'guest'} role
 * @param {string} action  예: 'phone:respond', 'admin:sendPhone'
 * @returns {boolean}
 */
function can(role, action) {
  const rule = RULES[role];
  if (!rule) return false;
  if (rule === '*') return true;
  return rule.has(action);
}

module.exports = { can };
