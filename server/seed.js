// =====================================================================
// seed.js — 초기 데이터 심기
// 처음 실행할 때 아바타 7명과 예시 강의자료를 넣는다.
// INSERT OR IGNORE(nickname UNIQUE) 라서 여러 번 실행해도 중복되지 않는다.
// 직접 실행: npm run seed
// =====================================================================

const fs = require('fs');
const path = require('path');
const { Avatars, Materials, Guides, Gallery, db } = require('./db');

// 작품 파일이 실제로 있는지 확인한다.
//   「나의 꿈은」 같은 영상 작품은 mp4 를 빌드해야 완성되는데(tools/dream-film/build.sh),
//   아직 안 만든 사람의 칸을 '전시됨' 으로 켜버리면 빈 화면이 열린다.
//   그래서 파일이 생긴 뒤 서버를 재시작할 때 자동으로 걸리게 한다.
function publicFileExists(urlPath) {
  return fs.existsSync(path.join(__dirname, '..', 'public', urlPath));
}

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

  // 자기소개 강의자료: 기존 데이터는 그대로 두고, 없을 때만 칠판에 추가(멱등).
  //   (이미 운영 중인 DB 에도 배포 후 재시작하면 이 자료가 칠판에 걸린다)
  const SELF_INTRO_URL = '/lectures/self-intro.html';
  if (!Materials.all().some((m) => m.url === SELF_INTRO_URL)) {
    Materials.create({
      title: '자기소개 만들기',
      url: SELF_INTRO_URL,
      sessionNo: 1,
      slot: 1,
    });
  }

  // 2회차 「나의 꿈은」 실습 안내서: 없을 때만 칠판에 추가(멱등).
  //   학생이 dream-film 서브에이전트의 도움을 어떻게 받는지 설명하는 자료.
  //   용어(터미널·빌드·README)를 하나도 모르는 상태를 전제로 쓰였다.
  const DREAM_FILM_URL = '/lectures/session2-dream-film.html';
  if (!Materials.all().some((m) => m.url === DREAM_FILM_URL)) {
    Materials.create({
      title: '「나의 꿈은」 영상 만들기',
      url: DREAM_FILM_URL,
      sessionNo: 2,
      slot: 2,
    });
  }

  // 선생님(soobing) 자기소개를 작품 갤러리 '자기소개' 칸(slot 0)에 건다(멱등).
  //   학생들에게 보여줄 모범 예시. 파일은 /works/soobing/intro.html (public 정적 서빙).
  const soobing = Avatars.byNickname('soobing');
  if (soobing) {
    const introUrl = '/works/soobing/intro.html';
    const has = Gallery.all().some((w) => w.author_id === soobing.id && w.url === introUrl);
    if (!has) {
      Gallery.setWork({
        authorId: soobing.id,
        slot: 0, // WORK_CATEGORIES[0] = intro(자기소개)
        url: introUrl,
        title: 'soobing 선생님의 자기소개',
      });
    }

    // 선생님 「나의 꿈은」 영상 작품 → slot 1 (멱등).
    //   영상(dream.mp4)이 아직 없으면 등록하지 않는다. 빌드한 뒤 서버를 다시 켜면 걸린다.
    //   만드는 법: ./tools/dream-film/build.sh soobing
    const dreamUrl = '/works/soobing/dream.html';
    const hasDream = Gallery.all().some((w) => w.author_id === soobing.id && w.url === dreamUrl);
    if (!hasDream && publicFileExists('/works/soobing/dream/dream.mp4')) {
      Gallery.setWork({
        authorId: soobing.id,
        slot: 1, // WORK_CATEGORIES[1] = dream(나의 꿈은?)
        url: dreamUrl,
        title: 'soobing 선생님의 나의 꿈은',
      });
    }
  }

  // 학생 자기소개를 작품 갤러리 '자기소개' 칸(slot 0)에 건다(멱등).
  //   파일은 public 정적 서빙이라 /works/<슬러그>/intro.html 로 바로 열린다.
  //   - 그 닉네임의 아바타가 없으면 조용히 건너뛴다(기본 시드 '학생1~5' 만 있는 DB).
  //   - 이미 그 학생의 slot 0 이 차 있으면 건드리지 않는다(관리센터에서 손수 바꾼 것을 덮어쓰지 않도록).
  //   - 폴더명은 isSafeDocUrl() 규칙상 영문·숫자만 되므로 이름 대신 슬러그를 쓴다.
  //   학생이 늘어나면 이 배열에 한 줄만 추가하면 된다.
  const STUDENT_INTROS = [
    { nickname: '안해찬', url: '/works/ahn/intro.html', title: '안해찬의 자기소개' },
    { nickname: '최승찬', url: '/works/seungchan/intro.html', title: '최승찬의 자기소개' },
    { nickname: '김선우', url: '/works/kim/intro.html', title: '김선우의 자기소개' },
    { nickname: '박효진', url: '/works/park/intro.html', title: '박효진의 자기소개' },
    { nickname: '김현영', url: '/works/hyunyoung/intro.html', title: '김현영의 자기소개' },
  ];
  for (const s of STUDENT_INTROS) {
    const who = Avatars.byNickname(s.nickname);
    if (!who) continue;
    if (Gallery.all().some((w) => w.author_id === who.id && w.slot === 0)) continue;
    Gallery.setWork({ authorId: who.id, slot: 0, url: s.url, title: s.title });
  }

  // 학생 「나의 꿈은」 영상 작품을 '나의 꿈은?' 칸(slot 1)에 건다(멱등).
  //   작품을 완성하면 이 배열에 한 줄만 추가하면 된다. (만드는 법: tools/dream-film/README.md)
  //   - dream.mp4 가 저장소에 없으면 건너뛴다. 영상 없이 칸만 켜지면 빈 화면이 열린다.
  //     → build.sh 로 만든 mp4 는 반드시 커밋해야 배포 서버에서도 뜬다.
  //       (frames/ 원본 그림과 bgm.mp3 는 .gitignore 대상이라 안 올라간다. mp4 는 올라간다)
  //   - 그 닉네임의 아바타가 없으면 조용히 건너뛴다. 닉네임을 바꿨다면 여기도 바꿔야 한다.
  //   - 이미 slot 1 이 차 있으면 건드리지 않는다(관리센터에서 손수 바꾼 것을 덮어쓰지 않도록).
  const STUDENT_DREAMS = [
    // 예) { nickname: '박효진', slug: 'park', title: '박효진의 나의 꿈은' },
    { nickname: '최승찬', slug: 'seungchan', title: '최승찬의 나의 꿈은' },
    { nickname: '안해찬', slug: 'ahn', title: '안해찬의 나의 꿈은' },
    { nickname: '김현영', slug: 'hyunyoung', title: '김현영의 나의 꿈은' },
    { nickname: '김선우', slug: 'kim', title: '김선우의 나의 꿈은' },
  ];
  for (const s of STUDENT_DREAMS) {
    const who = Avatars.byNickname(s.nickname);
    if (!who) continue;
    if (Gallery.all().some((w) => w.author_id === who.id && w.slot === 1)) continue;
    if (!publicFileExists(`/works/${s.slug}/dream/dream.mp4`)) continue;
    Gallery.setWork({
      authorId: who.id,
      slot: 1, // WORK_CATEGORIES[1] = dream(나의 꿈은?)
      url: `/works/${s.slug}/dream.html`,
      title: s.title,
    });
  }

  // 학생 김은준 자기소개를 작품 갤러리 '자기소개' 칸(slot 0)에 건다(멱등).
  //   파일은 /works/eunjun/intro.html (public 정적 서빙). 프로덕션 DB 에도 재시작 시 걸린다.
  const eunjun = Avatars.byNickname('김은준');
  if (eunjun) {
    const eunjunIntroUrl = '/works/eunjun/intro.html';
    const hasEunjun = Gallery.all().some((w) => w.author_id === eunjun.id && w.url === eunjunIntroUrl);
    if (!hasEunjun) {
      Gallery.setWork({
        authorId: eunjun.id,
        slot: 0, // WORK_CATEGORIES[0] = intro(자기소개)
        url: eunjunIntroUrl,
        title: '김은준의 자기소개',
      });
    }
  }

  // 학생 「5년 뒤 나의 미래(게임)」 작품을 '5년 뒤 나의 미래' 칸(slot 2)에 건다(멱등).
  //   game5.html 은 자체 완결형 HTML 게임(별도 빌드 없음). 파일이 저장소에 있어야 등록된다.
  //   - 그 닉네임의 아바타가 없으면 조용히 건너뛴다. 이미 slot 2 가 차 있으면 건드리지 않는다.
  const STUDENT_GAMES = [
    { nickname: '최승찬', slug: 'seungchan', title: '최승찬의 5년 뒤 나의 미래' },
  ];
  for (const s of STUDENT_GAMES) {
    const who = Avatars.byNickname(s.nickname);
    if (!who) continue;
    if (Gallery.all().some((w) => w.author_id === who.id && w.slot === 2)) continue;
    if (!publicFileExists(`/works/${s.slug}/game5.html`)) continue;
    Gallery.setWork({
      authorId: who.id,
      slot: 2, // WORK_CATEGORIES[2] = game5(5년 뒤 나의 미래·게임)
      url: `/works/${s.slug}/game5.html`,
      title: s.title,
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

  // 개발 지식 자료: 없을 때만 책장에 추가(멱등). 기존 DB(운영 포함)에도 재시작 시 걸린다.
  const DEV_BASICS_URL = '/guides/dev-basics.html';
  if (!Guides.all().some((g) => g.url === DEV_BASICS_URL)) {
    Guides.create({ title: '처음 만나는 개발 지식', url: DEV_BASICS_URL, slot: 1 });
  }

  // Windows에 Claude Code 설치 가이드(WSL 없이). 없을 때만 책장에 추가(멱등).
  const CC_WIN_URL = '/guides/claude-code-windows.html';
  if (!Guides.all().some((g) => g.url === CC_WIN_URL)) {
    Guides.create({ title: 'Windows에 Claude Code 설치하기', url: CC_WIN_URL, slot: 2 });
  }

  // 영상이 기술적으로 어떻게 만들어지는지(2회차 「나의 꿈은」 배경지식).
  //   숫자는 실제 결과물에서 뽑은 값이라, 작품이 바뀌면 문서도 같이 손봐야 한다.
  const HOW_VIDEO_URL = '/guides/how-video-works.html';
  if (!Guides.all().some((g) => g.url === HOW_VIDEO_URL)) {
    Guides.create({ title: '그림 5장이 영상이 되기까지', url: HOW_VIDEO_URL, slot: 3 });
  }

  // 협업 실전편(브랜치 → PR → 코드리뷰 + worktree/resume). 단독으로 읽어도 완결되게 썼다.
  const TEAM_URL = '/guides/team-workflow.html';
  if (!Guides.all().some((g) => g.url === TEAM_URL)) {
    Guides.create({ title: '개발자는 어떻게 함께 일할까?', url: TEAM_URL, slot: 4 });
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
