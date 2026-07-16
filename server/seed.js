// =====================================================================
// seed.js — 초기 데이터 심기
// 처음 실행할 때 아바타 7명과 예시 강의자료를 넣는다.
// INSERT OR IGNORE(nickname UNIQUE) 라서 여러 번 실행해도 중복되지 않는다.
// 직접 실행: npm run seed
// =====================================================================

const { Avatars, Materials, Guides, db } = require('./db');

// 초기 아바타 7명. 색은 서로 잘 구분되게 다르게.
// 색은 서로 잘 구분되게 다르게 준다. 이름은 예시(가명)이며, 실제 수업에서는
// 관리센터에서 바꾸거나 학생이 직접 닉네임을 변경한다.
const INITIAL_AVATARS = [
  { nickname: 'soobing', role: 'admin', color: '#e8590c' }, // 선생님
  { nickname: '학생1', role: 'student', color: '#4dabf7' }, // 파랑
  { nickname: '학생2', role: 'student', color: '#ff922b' }, // 주황
  { nickname: '학생3', role: 'student', color: '#69db7c' }, // 초록
  { nickname: '학생4', role: 'student', color: '#f783ac' }, // 분홍
  { nickname: '학생5', role: 'student', color: '#9775fa' }, // 보라
  { nickname: '게스트', role: 'guest', color: '#adb5bd' }, // 뷰어(비번 없음)
];

function ensureSeed() {
  const already = Avatars.all().length;

  // 초기 아바타는 "빈 DB"일 때 딱 한 번만 심는다.
  // (닉네임으로 매번 INSERT OR IGNORE 하면, 사용자가 닉네임을 바꾼 뒤
  //  서버를 재시작할 때 원래 이름이 없다고 판단해 같은 사람을 또 만들어버린다)
  if (already === 0) {
    const insertMany = db.transaction(() => {
      for (const a of INITIAL_AVATARS) {
        Avatars.create({ nickname: a.nickname, role: a.role, color: a.color });
      }
    });
    insertMany();
  }

  // 예시 강의자료(칠판에 기본으로 걸려 있음). 기존 강의계획서 HTML 재활용.
  if (Materials.all().length === 0) {
    Materials.create({
      title: '강의계획서 — AI와 함께하는 진로 탐색',
      url: '/lectures/session1-plan.html',
      sessionNo: 1,
      slot: 0,
    });
  }

  // 교실 책장 기본 문서(How-to). 처음 한 번만.
  if (Guides.all().length === 0) {
    Guides.create({ title: 'GitHub 가입하는 법', url: '/guides/github-signup.html', slot: 0 });
  }

  // 정리: 더 이상 쓰지 않는 'Claude 가입하는 법' 문서를 책장에서 제거(있으면).
  // 이미 시드된 기존 DB(운영 포함)에서도 서버가 켜질 때 한 번 지운다. 멱등.
  for (const g of Guides.all()) {
    if (g.url === '/guides/claude-signup.html') Guides.deleteById(g.id);
  }

  if (already === 0) {
    console.log('[seed] 초기 아바타 7명 + 예시 강의자료를 넣었습니다.');
  }
}

module.exports = { ensureSeed };

// 파일을 직접 실행하면 시드만 돌리고 종료.
if (require.main === module) {
  ensureSeed();
  console.log('[seed] 완료.');
  process.exit(0);
}
