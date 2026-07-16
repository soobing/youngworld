// =====================================================================
// me.js — "내 캐릭터 설정" 팝업(게임 메뉴 창)
// 맵에서 자기 자신 캐릭터를 클릭하거나 ⚙️ 버튼을 누르면 열린다.
// 탭 3개: (1) 내 정보(닉네임 변경) (2) 쪽지 쓰기 (3) 설문 만들기 (4) 설문 현황
// 게스트는 정체성이 없어 이 창을 쓰지 못한다(HUD 버튼도 숨김).
// =====================================================================

import { state, isGuest, isAdmin } from '../state.js';
import { onNet, send } from '../net.js';

let inited = false;

// "모두에게" 를 뜻하는 특수 값(실제 닉네임과 겹치지 않도록).
const ALL = '__all__';

// 설문 현황 캐시(뷰어 관점 필드 mine/myAnswers/isTarget 를 실시간 집계와 병합 유지).
let surveyList = [];
// 설문 현황 화면의 depth: null = 목록, 아니면 해당 messageId 의 상세.
let currentDetailId = null;

// 미션 현황 캐시 + 상세 depth.
let missionList = [];
let missionDetailId = null;

// 설문/미션 탭 안의 서브탭 상태(만들기/현황).
const currentSub = { survey: 'make', mission: 'make' };

export function initMe() {
  if (inited) return;
  inited = true;

  const btn = document.getElementById('me-button');
  // 게스트: 설정 없음.
  if (isGuest()) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'flex';
  btn.addEventListener('click', () => openMePanel());
  document.getElementById('me-close').addEventListener('click', closeMePanel);

  // 상위 탭 전환.
  document.querySelectorAll('#me-panel .pix-tab').forEach((t) => {
    t.addEventListener('click', () => selectTab(t.dataset.tab));
  });
  // 서브탭(설문/미션 안의 만들기↔현황) 전환.
  document.querySelectorAll('#me-panel .pix-subtab').forEach((t) => {
    t.addEventListener('click', () => selectSubTab(t.dataset.group, t.dataset.subtab));
  });

  // 미션 "만들기"는 선생님만. 학생은 미션 탭에서 "결과"(자기 것만)만 본다.
  if (!isAdmin()) {
    document.querySelectorAll('#me-panel .admin-only').forEach((t) => (t.style.display = 'none'));
    const misSub = document.getElementById('me-mission-subtabs');
    if (misSub) misSub.style.display = 'none'; // 만들기 없이 결과만 → 서브탭 바 숨김
    currentSub.mission = 'status';
  }

  // 설문/미션 대상(전체/개인) 토글.
  document.getElementById('me-vote-target').addEventListener('change', (e) => {
    document.getElementById('me-vote-to-row').style.display =
      e.target.value === 'individual' ? 'block' : 'none';
  });
  document.getElementById('me-mission-target').addEventListener('change', (e) => {
    document.getElementById('me-mission-to-row').style.display =
      e.target.value === 'individual' ? 'block' : 'none';
  });

  // 설문 빌더: 질문 블록 최소 1개로 시작.
  addSurveyQuestionBlock();

  // 액션 버튼들.
  document.getElementById('me-nick-save').addEventListener('click', saveNickname);
  document.getElementById('me-pw-save').addEventListener('click', changePassword);

  // 아바타 색상: 고르는 동안 도트 미리보기, 확정(change)되면 서버에 저장.
  const colorInput = document.getElementById('me-color');
  if (colorInput) {
    colorInput.addEventListener('input', () => {
      document.getElementById('me-avatar-dot').style.background = colorInput.value;
    });
    colorInput.addEventListener('change', () => send('me:setColor', { color: colorInput.value }));
  }
  document.getElementById('me-msg-send').addEventListener('click', sendPeerMessage);
  document.getElementById('me-survey-add').addEventListener('click', () => addSurveyQuestionBlock());
  document.getElementById('me-survey-send').addEventListener('click', sendSurvey);
  document.getElementById('me-mission-send').addEventListener('click', sendMission);

  // 닉네임/색상 변경 성공.
  onNet('me:updated', (d) => {
    if (d.nickname !== undefined) {
      state.me.nickname = d.nickname;
      line(`이름이 "${d.nickname}" 으로 바뀌었어요!`, 'ok');
      document.getElementById('me-role').textContent = roleLabel();
    }
    if (d.color !== undefined) {
      state.me.color = d.color;
      document.getElementById('me-avatar-dot').style.background = d.color;
      const ci = document.getElementById('me-color');
      if (ci) ci.value = d.color;
      line('아바타 색을 바꿨어요! 🎨', 'ok');
    }
  });

  // 쪽지/설문/미션/답장 전송 완료.
  onNet('peer:sent', ({ kind, count }) => {
    const label = { sms: '쪽지', survey: '설문', mission: '미션', reply: '답장' }[kind] || '메시지';
    if (count > 0) {
      line(`${label}를 ${count}명에게 보냈어요! ✅`, 'ok');
      // 방금 보낸 입력칸 비우기.
      if (kind === 'sms') document.getElementById('me-msg-body').value = '';
      if (kind === 'survey') resetSurveyBuilder();
      if (kind === 'mission') resetMissionForm();
    } else {
      line('받을 사람이 없어요.', 'err');
    }
  });

  // 설문 현황: 내가 볼 수 있는 설문 목록 + 실시간 집계.
  onNet('survey:mine', ({ surveys }) => {
    surveyList = surveys || [];
    if (currentDetailId && !surveyList.find((s) => s.messageId === currentDetailId)) {
      currentDetailId = null;
    }
    renderSurveyPane();
  });
  // 설문에 변화(응답/공개·공유 상태 변경)가 생기면, 현황 탭이 열려 있을 때만 새로고침한다.
  // (역할별 권한이 달라 서버가 결과를 브로드캐스트하지 않고, 각자 자기 관점으로 재요청)
  onNet('survey:changed', () => {
    const pane = document.querySelector('#me-panel .pix-subpane[data-subpane="survey-status"]');
    if (pane && !pane.classList.contains('hidden')) send('survey:mine');
  });

  // 설문을 새로 올리거나 / 내가 설문에 응답하면 현황도 갱신(내 응답 표시 반영).
  onNet('peer:sent', ({ kind }) => { if (kind === 'survey') send('survey:mine'); });
  onNet('phone:answered', () => { send('survey:mine'); refreshMissionsIfOpen(); });

  // 미션 현황(선생님): 목록 + 완료자/진행률.
  onNet('mission:mine', ({ missions }) => {
    missionList = missions || [];
    if (missionDetailId && !missionList.find((m) => m.messageId === missionDetailId)) missionDetailId = null;
    renderMissionPane();
  });
  // 학생: 내가 받은 미션(자기 완료 여부만).
  onNet('mission:received', ({ missions }) => renderStudentMissions(missions || []));
  onNet('peer:sent', ({ kind }) => { if (kind === 'mission') send('mission:mine'); });
  onNet('mission:changed', () => refreshMissionsIfOpen());

  onNet('error', (d) => line(d.message || d.code || '오류', 'err'));
}

function refreshMissionsIfOpen() {
  const pane = document.querySelector('#me-panel .pix-subpane[data-subpane="mission-status"]');
  if (pane && !pane.classList.contains('hidden')) send(isAdmin() ? 'mission:mine' : 'mission:received');
}

// 다른 모듈(WorldScene)에서 호출: 특정 탭으로 바로 열기 + 받는사람 미리 선택.
//   openMePanel({ tab:'msg', to:'학생1' })
export async function openMePanel(prefill = {}) {
  if (isGuest()) return;
  const p = document.getElementById('me-panel');
  p.classList.remove('hidden');
  state.uiOpen = true;

  // 내 정보 채우기.
  document.getElementById('me-nick').value = state.me.nickname;
  document.getElementById('me-role').textContent = roleLabel();
  document.getElementById('me-avatar-dot').style.background = state.me.color || '#8ee07a';
  document.getElementById('me-color').value = state.me.color || '#8ee07a';
  line('', '');

  // 설문 빌더가 비어있으면(방어적으로) 기본 1개 블록을 채운다.
  if (!document.getElementById('me-survey-questions').children.length) addSurveyQuestionBlock();

  await fillRecipients(); // 최신 상대 목록

  selectTab(prefill.tab || 'profile');
  if (prefill.to) {
    document.getElementById('me-msg-to').value = prefill.to;
    document.getElementById('me-vote-target').value = 'individual';
    document.getElementById('me-vote-to-row').style.display = 'block';
    document.getElementById('me-vote-to').value = prefill.to;
  }
}

function closeMePanel() {
  document.getElementById('me-panel').classList.add('hidden');
  state.uiOpen = false;
}

function selectTab(name) {
  document.querySelectorAll('#me-panel .pix-tab').forEach((t) =>
    t.classList.toggle('selected', t.dataset.tab === name)
  );
  document.querySelectorAll('#me-panel .pix-pane').forEach((s) =>
    s.classList.toggle('hidden', s.dataset.pane !== name)
  );
  line('', '');
  // 설문/미션 상위 탭을 열면 마지막(또는 기본 '만들기') 서브탭을 활성화한다.
  if (name === 'survey') selectSubTab('survey', currentSub.survey);
  if (name === 'mission') selectSubTab('mission', currentSub.mission);
}

// 설문/미션 탭 안의 서브탭(만들기/현황) 전환. 현황을 열면 최신 데이터를 요청한다.
function selectSubTab(group, sub) {
  currentSub[group] = sub;
  document.querySelectorAll(`#me-panel .pix-subtab[data-group="${group}"]`).forEach((t) =>
    t.classList.toggle('selected', t.dataset.subtab === sub)
  );
  document.querySelectorAll('#me-panel .pix-subpane').forEach((p) => {
    if (!p.dataset.subpane.startsWith(group + '-')) return;
    p.classList.toggle('hidden', p.dataset.subpane !== `${group}-${sub}`);
  });
  line('', '');
  if (group === 'survey' && sub === 'status') {
    currentDetailId = null;
    document.getElementById('me-poll-list').innerHTML = '<p class="pix-hint">불러오는 중…</p>';
    send('survey:mine');
  }
  if (group === 'mission' && sub === 'status') {
    missionDetailId = null;
    document.getElementById('me-mission-list').innerHTML = '<p class="pix-hint">불러오는 중…</p>';
    send(isAdmin() ? 'mission:mine' : 'mission:received'); // 선생님=전체현황 / 학생=내 것만
  }
}

// =====================================================================
// 설문 빌더(질문 여러 개: 기본 1개 + "+ 질문 추가")
// =====================================================================

function addSurveyQuestionBlock() {
  const box = document.getElementById('me-survey-questions');
  const block = document.createElement('div');
  block.className = 'svq-block';
  block.innerHTML = `
    <div class="svq-head">
      <span class="svq-num"></span>
      <select class="pix-input svq-type">
        <option value="choice">객관식</option>
        <option value="text">주관식</option>
      </select>
      <button type="button" class="svq-del" title="이 질문 삭제">×</button>
    </div>
    <label class="pix-field">질문
      <input class="pix-input svq-q" type="text" placeholder="무엇을 물어볼까요?" />
    </label>
    <label class="pix-field svq-opts-row">보기 (쉼표로 구분, 2개 이상)
      <input class="pix-input svq-opts" type="text" placeholder="예: 떡볶이, 피자, 치킨" />
    </label>
  `;
  // 유형 전환: 주관식이면 보기 입력을 숨긴다(구글 설문지처럼 자유 서술).
  const typeSel = block.querySelector('.svq-type');
  const optsRow = block.querySelector('.svq-opts-row');
  typeSel.addEventListener('change', () => {
    optsRow.style.display = typeSel.value === 'text' ? 'none' : 'block';
  });
  block.querySelector('.svq-del').addEventListener('click', () => {
    block.remove();
    renumberSurveyBlocks();
  });
  box.appendChild(block);
  renumberSurveyBlocks();
}

// 질문 번호를 다시 매기고, 블록이 1개뿐이면 삭제 버튼을 막는다.
function renumberSurveyBlocks() {
  const blocks = document.querySelectorAll('#me-survey-questions .svq-block');
  blocks.forEach((b, i) => {
    b.querySelector('.svq-num').textContent = `${i + 1}`;
    b.querySelector('.svq-del').disabled = blocks.length <= 1;
  });
}

// 설문 올리기 성공 후: 질문 1개짜리 빈 빌더로 되돌린다.
function resetSurveyBuilder() {
  document.getElementById('me-survey-questions').innerHTML = '';
  addSurveyQuestionBlock();
  document.getElementById('me-vote-title').value = '';
}

// 블록들에서 유효한 질문(질문 있음 + 보기 2개 이상)만 모은다.
function collectSurveyQuestions() {
  const blocks = document.querySelectorAll('#me-survey-questions .svq-block');
  const questions = [];
  blocks.forEach((b) => {
    const q = b.querySelector('.svq-q').value.trim();
    if (!q) return;
    const kind = b.querySelector('.svq-type').value;
    if (kind === 'text') {
      questions.push({ q, options: [] }); // 주관식(자유 서술)
    } else {
      const options = b.querySelector('.svq-opts').value
        .split(',').map((s) => s.trim()).filter(Boolean);
      if (options.length >= 2) questions.push({ q, options }); // 객관식
    }
  });
  return questions;
}

function sendSurvey() {
  const target = document.getElementById('me-vote-target').value;
  const title = document.getElementById('me-vote-title').value.trim();
  const questions = collectSurveyQuestions();
  if (!questions.length) { line('질문을 하나 이상 올바르게 적어주세요(보기 2개 이상).', 'err'); return; }
  const isPublic = document.getElementById('me-survey-public').value === 'public';
  const msg = { target, title, questions, public: isPublic };
  if (target === 'individual') msg.recipientNickname = document.getElementById('me-vote-to').value;
  send('peer:survey', msg);
}

// =====================================================================
// 미션 내기(선생님) + 미션 현황(목록 → 상세)
// =====================================================================

function sendMission() {
  const target = document.getElementById('me-mission-target').value;
  const title = document.getElementById('me-mission-title').value.trim();
  const task = document.getElementById('me-mission-task').value.trim();
  const due = document.getElementById('me-mission-due').value; // 'YYYY-MM-DD' or ''
  if (!task) { line('해야 할 일을 적어주세요.', 'err'); return; }
  const msg = { target, title, task, due };
  if (target === 'individual') msg.recipientNickname = document.getElementById('me-mission-to').value;
  send('mission:create', msg);
}

function resetMissionForm() {
  document.getElementById('me-mission-title').value = '';
  document.getElementById('me-mission-task').value = '';
  document.getElementById('me-mission-due').value = '';
}

// 마감 임박도 → 라벨/클래스.
const URGENCY = {
  overdue: { label: '기한 지남', cls: 'over' },
  today: { label: '오늘까지', cls: 'today' },
  soon: { label: '곧 마감', cls: 'soon' },
  later: { label: '', cls: 'later' },
  none: { label: '', cls: 'none' },
};

function renderMissionPane() {
  const box = document.getElementById('me-mission-list');
  box.innerHTML = '';
  if (missionDetailId) {
    const m = missionList.find((x) => x.messageId === missionDetailId);
    if (m) { box.appendChild(missionDetail(m)); return; }
    missionDetailId = null;
  }
  if (!missionList.length) {
    box.innerHTML = '<p class="pix-hint">아직 낸 미션이 없어요. "미션 내기" 탭에서 내보세요.</p>';
    return;
  }
  for (const m of missionList) box.appendChild(missionCard(m));
}

function missionMeta(m) {
  const u = URGENCY[m.urgency] || URGENCY.none;
  const dueTxt = m.due ? `기한 ${m.due}` : '기한 없음';
  return `${dueTxt}${u.label ? ' · ' + u.label : ''} · 완료 ${m.completedCount}/${m.delivered}명 (${m.pct}%)`;
}

// 학생용 미션 결과: 내가 받은 미션 목록 + 내 완료 여부만(남의 완료율·명단 없음).
function renderStudentMissions(missions) {
  const box = document.getElementById('me-mission-list');
  box.innerHTML = '';
  if (!missions.length) {
    box.innerHTML = '<p class="pix-hint">아직 받은 미션이 없어요.</p>';
    return;
  }
  for (const m of missions) {
    const card = document.createElement('div');
    card.className = 'poll-card';
    const q = document.createElement('div');
    q.className = 'poll-q';
    q.textContent = '📋 ' + (m.task || '미션');
    card.appendChild(q);

    const meta = document.createElement('div');
    meta.className = 'poll-meta';
    const u = URGENCY[m.urgency] || URGENCY.none;
    const dueTxt = m.due ? `기한 ${m.due}` : '기한 없음';
    meta.textContent = `보낸이 ${m.senderNickname || '?'} · ${dueTxt}${u.label ? ' · ' + u.label : ''}`;
    if (['over', 'today', 'soon'].includes(u.cls) && !m.myDone) meta.classList.add('mis-urgent-' + u.cls);
    card.appendChild(meta);

    const status = document.createElement('div');
    status.className = 'stu-mis-status ' + (m.myDone ? 'done' : 'pend');
    status.textContent = m.myDone ? '✅ 완료함' : '⏳ 아직 안 함 (우편함에서 완료 체크)';
    card.appendChild(status);
    box.appendChild(card);
  }
}

function missionCard(m) {
  const card = document.createElement('div');
  card.className = 'poll-card sv-card';
  const q = document.createElement('div');
  q.className = 'poll-q';
  q.textContent = '📋 ' + (m.task || '미션');
  card.appendChild(q);
  // 진행률 막대.
  const bar = document.createElement('div'); bar.className = 'mis-prog';
  const fill = document.createElement('div'); fill.className = 'mis-prog-fill';
  fill.style.width = m.pct + '%';
  bar.appendChild(fill);
  card.appendChild(bar);
  const meta = document.createElement('div');
  meta.className = 'poll-meta';
  const u = URGENCY[m.urgency] || URGENCY.none;
  meta.innerHTML = missionMeta(m);
  if (u.cls === 'over' || u.cls === 'today' || u.cls === 'soon') meta.classList.add('mis-urgent-' + u.cls);
  card.appendChild(meta);
  card.addEventListener('click', () => { missionDetailId = m.messageId; renderMissionPane(); });
  return card;
}

function missionDetail(m) {
  const frag = document.createDocumentFragment();
  const back = document.createElement('button');
  back.type = 'button'; back.className = 'pix-btn sv-back'; back.textContent = '← 목록';
  back.addEventListener('click', () => { missionDetailId = null; renderMissionPane(); });
  frag.appendChild(back);

  const q = document.createElement('div'); q.className = 'poll-q'; q.textContent = '📋 ' + (m.task || '미션');
  frag.appendChild(q);
  const meta = document.createElement('div'); meta.className = 'poll-meta'; meta.textContent = missionMeta(m);
  frag.appendChild(meta);

  // 진행률 막대(큰 것).
  const bar = document.createElement('div'); bar.className = 'mis-prog big';
  const fill = document.createElement('div'); fill.className = 'mis-prog-fill';
  fill.style.width = m.pct + '%'; bar.appendChild(fill); frag.appendChild(bar);

  // 완료한 사람 / 아직 안 한 사람.
  const done = m.completers || [];
  const pend = m.pending || [];
  frag.appendChild(nameGroup(`✅ 완료 (${done.length})`, done, 'done'));
  frag.appendChild(nameGroup(`⏳ 미완료 (${pend.length})`, pend, 'pend'));
  return frag;
}

function nameGroup(title, names, kind) {
  const box = document.createElement('div');
  box.className = 'mis-names';
  const h = document.createElement('div'); h.className = 'mis-names-head'; h.textContent = title;
  box.appendChild(h);
  if (!names.length) {
    const e = document.createElement('div'); e.className = 'svd-empty'; e.textContent = '(없음)';
    box.appendChild(e);
  } else {
    const wrap = document.createElement('div'); wrap.className = 'mis-chips';
    names.forEach((n) => {
      const c = document.createElement('span'); c.className = 'mis-chip ' + kind; c.textContent = n;
      wrap.appendChild(c);
    });
    box.appendChild(wrap);
  }
  return box;
}

// =====================================================================
// 설문 현황(목록 → 상세, depth 한 단계)
// =====================================================================

// 캐시(surveyList)와 currentDetailId 를 보고 목록/상세 중 하나를 그린다.
function renderSurveyPane() {
  const box = document.getElementById('me-poll-list');
  box.innerHTML = '';

  if (currentDetailId) {
    const s = surveyList.find((x) => x.messageId === currentDetailId);
    if (s) { box.appendChild(surveyDetail(s)); return; }
    currentDetailId = null; // 목록에서 사라졌으면 목록으로.
  }

  if (!surveyList.length) {
    box.innerHTML = '<p class="pix-hint">아직 볼 수 있는 설문이 없어요.<br>전체 공개 설문이나 내가 대상인 설문, 내가 만든 설문이 여기 모여요.</p>';
    return;
  }
  for (const s of surveyList) box.appendChild(surveyCard(s));
}

function surveyCard(s) {
  const card = document.createElement('div');
  card.className = 'poll-card sv-card';
  card.dataset.mid = s.messageId;
  card.appendChild(surveyCardInner(s));
  card.addEventListener('click', () => { currentDetailId = s.messageId; renderSurveyPane(); });
  return card;
}

function pollTag(text, cls) {
  const s = document.createElement('span');
  s.className = 'poll-tag ' + cls;
  s.textContent = text;
  return s;
}

// 요약 태그(내가 만듦/전체/내가 대상) — 목록 카드/상세 공통으로 쓴다.
function surveyTags(s) {
  const tags = document.createElement('div');
  tags.className = 'poll-tags';
  if (s.mine) tags.appendChild(pollTag('내가 만듦', 'mine'));
  if (s.isPublic) tags.appendChild(pollTag('전체', 'pub'));
  if (s.isTarget && !s.mine) tags.appendChild(pollTag('내가 대상', 'tgt'));
  return tags;
}

function surveyMetaText(s) {
  const qn = (s.questions || []).length;
  const priv = s.isPublic ? '' : ' · 🔒비공개';
  return `설문 생성자: ${s.senderNickname || '?'} · 응답 ${s.total}/${s.delivered}명 · 질문 ${qn}개${priv}`;
}

// 목록 카드 내용(제목/태그/요약).
function surveyCardInner(s) {
  const frag = document.createDocumentFragment();

  const q = document.createElement('div');
  q.className = 'poll-q';
  q.textContent = '📋 ' + (s.title || (s.questions && s.questions[0] && s.questions[0].q) || '설문');
  frag.appendChild(q);

  const meta = document.createElement('div');
  meta.className = 'poll-meta';
  meta.textContent = surveyMetaText(s);
  frag.appendChild(meta);

  return frag;
}

// 상세 화면: "← 목록" + [응답 보기 select: 통계 / 응답자별] + 선택에 따른 내용.
// 통계와 개별 응답은 "같은 질문-박스 레이아웃"을 공유한다.
function surveyDetail(s) {
  const frag = document.createDocumentFragment();

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'pix-btn sv-back';
  back.textContent = '← 목록';
  back.addEventListener('click', () => { currentDetailId = null; renderSurveyPane(); });
  frag.appendChild(back);

  frag.appendChild(surveyCardInner(s));

  // 생성자 전용 설정: 공개 상태 + 응답 결과 공유하기(통계 공유).
  if (s.mine) {
    // 공개 상태(현황 목록 노출 여부).
    frag.appendChild(makeFlagRow({
      label: '공개 상태',
      value: s.isPublic ? 'on' : 'off',
      onLabel: '공개 (현황에 표시)',
      offLabel: '비공개 (나만 보기)',
      onSave: (on) => {
        s.isPublic = on;
        send('survey:setPublic', { messageId: s.messageId, public: on });
        toast(`공개 상태를 ${on ? '공개' : '비공개'}로 저장했어요 ✓`);
        renderSurveyPane();
      },
    }));
    // 응답 결과 공유하기(켜면 다른 사람도 통계만 볼 수 있음).
    frag.appendChild(makeFlagRow({
      label: '결과 공유',
      value: s.shareResults ? 'on' : 'off',
      onLabel: '공유함 (다른 사람도 통계 열람)',
      offLabel: '공유 안 함 (나만 통계 열람)',
      onSave: (on) => {
        s.shareResults = on;
        send('survey:setShareResults', { messageId: s.messageId, share: on });
        toast(`응답 결과 공유를 ${on ? '켰어요' : '껐어요'} ✓`);
        renderSurveyPane();
      },
    }));
  }

  const responses = s.responses || []; // 개별 응답은 생성자에게만 내려온다.

  // "응답 보기" 옵션을 역할에 맞게 구성.
  //   생성자: 통계 + 각 응답자(개별)
  //   응답한 사람: (공유 시)통계 + 내 응답
  //   그 외: (공유 시)통계
  const views = []; // { value, label, kind:'stats'|'person', person? }
  if (s.canSeeStats) views.push({ value: 'stats', label: `📊 통계 (${s.total}/${s.delivered}명)`, kind: 'stats' });
  if (s.mine) {
    responses.forEach((r, i) => views.push({ value: 'p' + i, label: '👤 ' + r.nickname, kind: 'person', person: r }));
  } else if (s.myAnswers) {
    views.push({ value: 'me', label: '🙋 내 응답', kind: 'person', person: { nickname: state.me.nickname, answers: s.myAnswers } });
  }

  if (views.length === 0) {
    const e = document.createElement('div');
    e.className = 'svd-empty';
    e.textContent = s.myAnswers ? '(결과가 아직 공유되지 않았어요)' : '(아직 볼 수 있는 결과가 없어요)';
    frag.appendChild(e);
    return frag;
  }

  const selRow = document.createElement('div');
  selRow.className = 'svd-viewsel';
  const lab = document.createElement('span');
  lab.className = 'svd-viewsel-label';
  lab.textContent = '응답 보기';
  const sel = document.createElement('select');
  sel.className = 'pix-input';
  views.forEach((v) => {
    const o = document.createElement('option');
    o.value = v.value;
    o.textContent = v.label;
    sel.appendChild(o);
  });
  selRow.appendChild(lab);
  selRow.appendChild(sel);
  frag.appendChild(selRow);

  // 선택에 따라 통계/개인을 같은 레이아웃으로 그린다.
  const content = document.createElement('div');
  content.className = 'svd-content';
  frag.appendChild(content);

  const renderView = () => {
    content.innerHTML = '';
    const v = views.find((x) => x.value === sel.value) || views[0];
    if (v.kind === 'stats') renderSurveyStats(content, s);
    else renderSurveyPerson(content, s, v.person);
  };
  sel.addEventListener('change', renderView);
  renderView();

  return frag;
}

// 생성자용 on/off 설정 행(라벨 + 셀렉트 + 저장). value: 'on'|'off'.
function makeFlagRow({ label, value, onLabel, offLabel, onSave }) {
  const row = document.createElement('div');
  row.className = 'svd-viewsel';
  const l = document.createElement('span');
  l.className = 'svd-viewsel-label';
  l.textContent = label;
  const sel = document.createElement('select');
  sel.className = 'pix-input';
  const o1 = document.createElement('option'); o1.value = 'on'; o1.textContent = onLabel;
  const o2 = document.createElement('option'); o2.value = 'off'; o2.textContent = offLabel;
  sel.appendChild(o1); sel.appendChild(o2);
  sel.value = value;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pix-btn svd-pub-save';
  btn.textContent = '저장';
  btn.addEventListener('click', () => onSave(sel.value === 'on'));
  row.appendChild(l); row.appendChild(sel); row.appendChild(btn);
  return row;
}

// 질문 박스 + 제목(통계/개인 공통). 주관식이면 "(주관식)" 표시.
function surveyQuestionBox(q, qi) {
  const qBox = document.createElement('div');
  qBox.className = 'svd-q';
  const isText = q.kind === 'text' || !(q.options && q.options.length);
  const qTitle = document.createElement('div');
  qTitle.className = 'svd-q-title';
  qTitle.textContent = `Q${qi + 1}. ${q.q}` + (isText ? '  (주관식)' : '');
  qBox.appendChild(qTitle);
  return { qBox, isText };
}

// 통계(전체 집계): 질문마다 막대(객관식)/응답목록(주관식).
function renderSurveyStats(container, s) {
  const myAnswers = s.myAnswers || null;
  (s.questions || []).forEach((q, qi) => {
    const { qBox, isText } = surveyQuestionBox(q, qi);
    const myAns = myAnswers ? myAnswers[qi] : null;
    if (isText) {
      const texts = q.texts || [];
      if (!texts.length) {
        const e = document.createElement('div');
        e.className = 'svd-empty';
        e.textContent = '(아직 응답 없음)';
        qBox.appendChild(e);
      } else {
        texts.forEach((t) => {
          const d = document.createElement('div');
          d.className = 'svd-text' + (typeof myAns === 'string' && myAns === t ? ' mine' : '');
          d.textContent = '“' + t + '”';
          qBox.appendChild(d);
        });
      }
    } else {
      const counts = q.counts || [];
      const max = Math.max(1, ...counts);
      (q.options || []).forEach((opt, oi) => {
        const n = counts[oi] || 0;
        const pct = s.total > 0 ? Math.round((n / s.total) * 100) : 0;
        const isMine = myAns === oi;
        const row = document.createElement('div');
        row.className = 'poll-row' + (isMine ? ' mine' : '');
        const bar = document.createElement('div');
        bar.className = 'poll-bar';
        bar.classList.toggle('lead', n === max && n > 0);
        bar.style.width = (s.total > 0 ? Math.round((n / max) * 100) : 0) + '%';
        const label = document.createElement('span');
        label.className = 'poll-label';
        label.textContent = (isMine ? '✔ ' : '') + opt;
        const val = document.createElement('span');
        val.className = 'poll-val';
        val.textContent = `${n}표 (${pct}%)`;
        row.appendChild(bar); row.appendChild(label); row.appendChild(val);
        qBox.appendChild(row);
      });
    }
    container.appendChild(qBox);
  });
}

// 개별 응답: 선택한 응답자의 답을 질문마다 "ㄴ 답" 형태로(같은 질문-박스).
function renderSurveyPerson(container, s, r) {
  if (!r) {
    const e = document.createElement('div');
    e.className = 'svd-empty';
    e.textContent = '(응답 정보가 없어요)';
    container.appendChild(e);
    return;
  }
  (s.questions || []).forEach((q, qi) => {
    const { qBox, isText } = surveyQuestionBox(q, qi);
    const a = (r.answers || [])[qi];
    const shown = isText
      ? (typeof a === 'string' ? a : '')
      : (Number.isInteger(a) ? (q.options[a] || '') : '');
    const ans = document.createElement('div');
    ans.className = 'svd-answer';
    ans.textContent = 'ㄴ ' + (shown || '-');
    qBox.appendChild(ans);
    container.appendChild(qBox);
  });
}

// /api/avatars 에서 게스트·나 자신을 뺀 상대 목록으로 두 드롭다운을 채운다.
async function fillRecipients() {
  let list = [];
  try {
    list = await (await fetch('/api/avatars')).json();
  } catch (e) { /* 오프라인이면 빈 목록 */ }
  const others = list.filter((a) => a.role !== 'guest' && a.nickname !== state.me.nickname);

  for (const id of ['me-msg-to', 'me-vote-to', 'me-mission-to']) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    const prev = sel.value;
    sel.innerHTML = '';
    // 쪽지 받는사람 드롭다운에는 맨 위에 "모두에게"를 넣는다(설문/미션은 별도 대상 선택이 있음).
    if (id === 'me-msg-to') {
      const all = document.createElement('option');
      all.value = ALL; all.textContent = '📢 모두에게 (게스트 제외)';
      sel.appendChild(all);
    }
    if (others.length === 0 && id !== 'me-msg-to') {
      const o = document.createElement('option');
      o.value = ''; o.textContent = '(보낼 사람이 없어요)';
      sel.appendChild(o);
    } else {
      others.forEach((a) => {
        const o = document.createElement('option');
        o.value = a.nickname;
        o.textContent = a.nickname + (a.role === 'admin' ? ' (선생님)' : '');
        sel.appendChild(o);
      });
      if (prev) sel.value = prev;
    }
  }
}

function saveNickname() {
  const nickname = document.getElementById('me-nick').value.trim();
  if (!nickname) { line('닉네임을 입력해주세요.', 'err'); return; }
  if (nickname === state.me.nickname) { line('지금 이름과 같아요.', 'err'); return; }
  send('me:setNickname', { nickname });
}

// 비밀번호 변경(설정 > 내 정보). 소켓이 아니라 /api HTTP 를 쓴다.
async function changePassword() {
  const oldPassword = document.getElementById('me-pw-old').value;
  const newPassword = document.getElementById('me-pw-new').value;
  if (!oldPassword || !newPassword) { line('기존/새 비밀번호를 모두 입력해주세요.', 'err'); return; }
  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: state.token, oldPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) { line(data.message || '변경 실패', 'err'); return; }
    document.getElementById('me-pw-old').value = '';
    document.getElementById('me-pw-new').value = '';
    line('비밀번호를 변경했어요 ✓', 'ok');
  } catch (e) {
    line('변경 중 오류가 났어요.', 'err');
  }
}

function sendPeerMessage() {
  const to = document.getElementById('me-msg-to').value;
  const body = document.getElementById('me-msg-body').value.trim();
  if (!to) { line('받는 사람을 골라주세요.', 'err'); return; }
  if (!body) { line('쪽지 내용을 적어주세요.', 'err'); return; }
  if (to === ALL) {
    send('peer:send', { target: 'all', body });
  } else {
    send('peer:send', { recipientNickname: to, body });
  }
}

function roleLabel() {
  return state.me.role === 'admin' ? '선생님' : state.me.role === 'student' ? '학생' : '게스트';
}

// 창 아래 한 줄 안내(성공=초록/실패=빨강).
function line(text, kind) {
  const el = document.getElementById('me-msg-line');
  el.textContent = text || '';
  el.className = 'pix-line' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
}

// 화면 왼쪽 위 토스트(여러 개 쌓임). 패널 재렌더에도 지워지지 않는 공용 스택 사용.
function toast(text) {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const item = document.createElement('div');
  item.className = 'toast-item';
  item.textContent = text;
  stack.appendChild(item);
  setTimeout(() => {
    item.classList.add('out');
    setTimeout(() => item.remove(), 300);
  }, 2000);
}
