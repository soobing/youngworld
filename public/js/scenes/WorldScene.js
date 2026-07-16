// =====================================================================
// WorldScene — 야외(섬)와 실내(교실)가 "공통으로" 쓰는 기능을 모은 부모 씬.
// IslandScene / ClassroomScene 은 이 클래스를 상속받아 지도(buildMap)만 다르게 만든다.
//
// 여기서 처리하는 공통 기능:
//   - 타일 지도 그리기 + 충돌
//   - 내 아바타 이동(키보드) + 서버로 위치 전송(스로틀)
//   - 다른 플레이어 아바타 그리기 + 부드럽게 따라가기(보간)
//   - 등장/이동/퇴장 실시간 반영
// =====================================================================

import { state, isGuest } from '../state.js';
import { send, onNet, offNet } from '../net.js';
import { TILE } from './BootScene.js';
import { openMePanel } from '../ui/me.js';
import { isTouchDevice } from '../ui/touch.js';
import { openMailbox } from '../ui/phone.js';

const SPEED = 180;         // 이동 속도(px/s)
const MOVE_SEND_MS = 100;  // 위치 전송 주기(초당 10번). 너무 자주 보내면 네트워크 부담.

export class WorldScene extends Phaser.Scene {
  // data.transition === true 이면 "씬 이동으로 들어온 것" → 서버에 scene:enter 를 보낸다.
  create(data) {
    this.transition = !!(data && data.transition);
    this.others = new Map();     // id -> { sprite, label, tx, ty }
    this.solids = this.physics.add.staticGroup(); // 충돌(벽/물/산/책상)
    this.doors = [];             // makeDoor 로 등록된 문들(아바타 생성 후 연결)
    this.lastSent = 0;

    // 자식 씬이 지도를 그린다. spawn 좌표와 door 존을 세팅할 수 있다.
    this.spawn = { x: state.me.x, y: state.me.y };
    this.buildMap();

    // 내 아바타 생성(지도/문을 만든 "뒤"에).
    this.me = this.physics.add.sprite(this.spawn.x, this.spawn.y, 'avatar');
    this.me.setTint(colorToHex(state.me.color));
    this.me.setCollideWorldBounds(true);
    this.me.setDepth(6); // 책상(depth 2) 위로 → 교실에서 "책상에 앉은" 느낌
    // 충돌 몸통을 작은 원(반지름 10px)으로 → 좁은 등산로·모서리를 매끄럽게 통과.
    this.me.body.setCircle(10, 4, 6);
    this.physics.add.collider(this.me, this.solids);
    this.myLabel = this.makeLabel(state.me.nickname, this.spawn.x, this.spawn.y);

    // 내 캐릭터를 클릭하면 "내 설정" 팝업이 열린다(게스트 제외).
    this.me.setInteractive({ useHandCursor: true });
    this.me.on('pointerdown', () => { if (!state.uiOpen && !isGuest()) openMePanel(); });

    // 머리 위 알림(통통 튐). 클릭 → 우편함.
    //   💌 = 안읽은 쪽지/설문,  📋 = 미완료 미션(마감 임박하면 ⏰).
    this.mailIcon = this.add.text(this.spawn.x, this.spawn.y - 42, '💌', { fontSize: '22px' })
      .setOrigin(0.5, 1).setDepth(1200).setVisible(false);
    this.missionIcon = this.add.text(this.spawn.x, this.spawn.y - 42, '💥', { fontSize: '22px' })
      .setOrigin(0.5, 1).setDepth(1200).setVisible(false);
    for (const ic of [this.mailIcon, this.missionIcon]) {
      ic.setInteractive({ useHandCursor: true });
      ic.on('pointerdown', () => { if (!isGuest()) openMailbox(); });
    }
    this.mailBob = 0;
    this.updateMailIndicator();

    // 이제 아바타가 있으니 문(overlap)을 연결한다. (탭 입장과 fired 플래그 공유)
    for (const d of this.doors) {
      this.physics.add.overlap(this.me, d.zone, () => {
        if (d.fired || state.uiOpen) return;
        d.fired = true;
        d.onEnter();
      });
    }

    // 카메라: 지도가 화면보다 크면 나를 따라감.
    this.cameras.main.startFollow(this.me, true, 0.15, 0.15);

    // 모바일은 화면을 꽉 채우느라(ENVELOP) 많이 확대돼 한 번에 보이는 범위가 좁다.
    // 카메라를 살짝 줌아웃해 지도를 넓게 보여준다. fitZoom = 화면 밖으로 안 넘치는 최소 줌.
    if (isTouchDevice()) {
      const cam = this.cameras.main;
      const fitZoom = Math.max(this.scale.width / this.worldW, this.scale.height / this.worldH);
      const zoom = Math.max(0.9, fitZoom);
      cam.setZoom(zoom);

      // 아바타를 항상 화면 중앙에 두고 사방으로 따라가도록 카메라 경계를 반 화면씩 넓힌다.
      // 이렇게 하면 지도가 화면과 비슷한 크기여도(교실 800x608) 카메라가 팬(pan)할 여유가
      // 생겨 아바타를 따라가고, 세로화면에서 가장자리에 가도 아바타가 잘리거나 화면 밖으로
      // 나가지 않는다. 지도 밖은 배경색(하늘·바다 톤)이 자연스럽게 보인다.
      const padX = this.scale.width / zoom / 2;
      const padY = this.scale.height / zoom / 2;
      cam.setBounds(-padX, -padY, this.worldW + padX * 2, this.worldH + padY * 2);
      cam.centerOn(this.me.x, this.me.y); // 초반 화면을 아바타 중심으로 맞춘다.
    }

    // 키보드 입력(방향키 + WASD).
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    // 캡처 해제: Phaser 가 W/A/S/D·방향키의 기본동작(preventDefault)을 막으면
    // HTML 입력창(닉네임 등)에 그 글자가 안 찍힌다. body 가 overflow:hidden 이라
    // 방향키로 페이지가 스크롤되지도 않으므로 캡처를 풀어도 안전하다.
    // (이동은 매 프레임 isDown 폴링이라 캡처와 무관하게 정상 동작)
    this.input.keyboard.clearCaptures();

    // --- 실시간 이벤트 구독 ---
    this.handlers = {
      'player:joined': (p) => { if (p.scene === state.scene) this.addOther(p); },
      'player:moved': (m) => this.moveOther(m),
      'player:left': ({ id }) => this.removeOther(id),
      'scene:ready': (d) => this.onSceneReady(d),
      'player:renamed': ({ id, nickname }) => this.onRenamed(id, nickname),
      'player:recolored': ({ id, color }) => this.onRecolored(id, color),
      // 쪽지/미션 상태가 바뀌면 머리 위 알림을 갱신.
      'phone:new': () => this.updateMailIndicator(),
      'phone:alarm': () => this.updateMailIndicator(),
      'phone:answered': () => this.updateMailIndicator(),
      'mission:remind': () => this.updateMailIndicator(),
    };
    for (const [ev, fn] of Object.entries(this.handlers)) onNet(ev, fn);

    // 씬이 이동으로 들어왔으면 서버에 알리고, 서버가 scene:ready 로 사람들을 알려준다.
    // 처음 접속(boot)으로 들어온 경우엔 world:init 의 players 를 바로 그린다.
    if (this.transition) {
      send('scene:enter', { scene: state.scene, x: this.spawn.x, y: this.spawn.y });
    } else {
      for (const p of state.pendingPlayers) this.addOther(p);
    }

    // 씬 종료 시 구독 해제(중복 방지).
    this.events.once('shutdown', () => {
      for (const [ev, fn] of Object.entries(this.handlers)) offNet(ev, fn);
    });
  }

  // -------------------------------------------------------------------
  // 지도: 2차원 숫자 배열 → 타일 그리기 + 충돌 만들기
  // grid[row][col] = tileDefs 의 키(숫자). tileDefs[n] = { color, solid }
  // -------------------------------------------------------------------
  drawGrid(grid, tileDefs) {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const def = tileDefs[grid[r][c]];
        if (!def) continue;
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        // 방법 A) def.tex/def.texes: 미리 그려둔 상세 텍스처 사용(틴트 없음).
        // 방법 B) def.color/def.colors: 흰 타일에 색만 입힘(교실 등 단순 지형).
        const tex = def.texes ? pick(def.texes) : def.tex;
        const key = tex || 'tile';
        const color = def.colors ? pick(def.colors) : def.color;
        if (def.solid) {
          const t = this.solids.create(x, y, key);
          if (!tex) t.setTint(colorToHex(color));
          t.refreshBody();
        } else {
          const img = this.add.image(x, y, key);
          if (!tex) img.setTint(colorToHex(color));
        }
      }
    }
    // 월드 경계를 지도 크기에 맞춘다.
    const w = grid[0].length * TILE;
    const h = grid.length * TILE;
    this.worldW = w;
    this.worldH = h;
    this.physics.world.setBounds(0, 0, w, h);
    this.cameras.main.setBounds(0, 0, w, h);
  }

  // door 존을 등록한다. 밟으면(overlap) 또는 탭하면 onEnter 실행(씬 이동 등).
  // 실제 overlap 연결은 아바타 생성 후 create() 에서 한다.
  makeDoor(x, y, w, h, onEnter) {
    const zone = this.add.zone(x, y, w, h);
    this.physics.add.existing(zone, true); // 정적 바디
    const door = { zone, onEnter, fired: false };

    // 모바일 대응: 문을 "탭"하면 걸어가지 않아도 바로 입장.
    // 투명 사각형을 문 위에 얹어 클릭/터치를 받는다(PC 에서도 클릭하면 입장 — 추가 편의).
    const hit = this.add.rectangle(x, y, w, h).setInteractive({ useHandCursor: true });
    hit.setFillStyle(0xffffff, 0.001).setDepth(400);
    hit.on('pointerdown', () => {
      if (state.uiOpen || door.fired) return;
      door.fired = true;
      door.onEnter();
    });

    this.doors.push(door);
    return zone;
  }

  // 닉네임 라벨(아바타 위에 뜨는 이름표).
  makeLabel(text, x, y) {
    return this.add
      .text(x, y - 22, text, { fontSize: '12px', color: '#222', backgroundColor: '#ffffffcc', padding: { x: 3, y: 1 } })
      .setOrigin(0.5, 1)
      .setDepth(1000);
  }

  // -------------------------------------------------------------------
  // 다른 플레이어 관리
  // -------------------------------------------------------------------
  addOther(p) {
    if (p.id === state.me.id || this.others.has(p.id)) return;
    const sprite = this.add.image(p.x, p.y, 'avatar').setTint(colorToHex(p.color)).setDepth(6);
    const label = this.makeLabel(p.nickname, p.x, p.y);
    const entry = { sprite, label, tx: p.x, ty: p.y, nickname: p.nickname };
    // 다른 사람을 클릭하면 그 사람에게 쪽지 쓰기 창이 바로 열린다(게스트 제외).
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerdown', () => {
      if (!state.uiOpen && !isGuest()) openMePanel({ tab: 'msg', to: entry.nickname });
    });
    this.others.set(p.id, entry);
  }

  // 닉네임 변경 실시간 반영(나 또는 다른 사람).
  onRenamed(id, nickname) {
    if (id === state.me.id) {
      state.me.nickname = nickname;
      if (this.myLabel) this.myLabel.setText(nickname);
      return;
    }
    const o = this.others.get(id);
    if (o) { o.nickname = nickname; o.label.setText(nickname); }
  }

  // 색상 변경 실시간 반영(나 또는 다른 사람의 아바타 틴트).
  onRecolored(id, color) {
    if (id === state.me.id) {
      state.me.color = color;
      if (this.me) this.me.setTint(colorToHex(color));
      return;
    }
    const o = this.others.get(id);
    if (o) o.sprite.setTint(colorToHex(color));
  }

  // 머리 위 알림: 💌(안읽은 쪽지/설문) + 📋/⏰(미완료 미션). 둘 다면 나란히.
  updateMailIndicator() {
    if (!this.mailIcon) return;
    const inbox = state.inbox || [];
    const msgs = inbox.filter((m) => m.type !== 'mission' && !m.isRead).length;
    const missions = inbox.filter((m) => m.type === 'mission' && !(m.answered || m.done));
    const urgent = missions.some((m) => ['soon', 'today', 'overdue'].includes(m.urgency));

    this.mailIcon.setVisible(msgs > 0);
    if (msgs > 0) this.mailIcon.setText(msgs > 1 ? `💌×${msgs}` : '💌');

    this.missionIcon.setVisible(missions.length > 0);
    if (missions.length > 0) {
      const ic = urgent ? '⏰' : '💥';
      this.missionIcon.setText(missions.length > 1 ? `${ic}×${missions.length}` : ic);
    }
  }

  moveOther({ id, x, y }) {
    const o = this.others.get(id);
    if (!o) return;
    o.tx = x; // 목표 좌표만 저장. 실제 이동은 update 에서 부드럽게.
    o.ty = y;
  }

  removeOther(id) {
    const o = this.others.get(id);
    if (!o) return;
    o.sprite.destroy();
    o.label.destroy();
    this.others.delete(id);
  }

  // 씬 이동 완료: 서버가 준 사람들로 새로 그린다.
  onSceneReady(d) {
    if (d.scene !== state.scene) return;
    // 기존 표시 지우고 다시.
    for (const id of [...this.others.keys()]) this.removeOther(id);
    for (const p of d.players) this.addOther(p);
    if (typeof d.x === 'number') { this.me.x = d.x; this.me.y = d.y; }
  }

  // -------------------------------------------------------------------
  // 매 프레임: 내 이동 처리 + 다른 사람 보간
  // -------------------------------------------------------------------
  update(time) {
    // 패널(로그인/핸드폰/admin/PPT)이 열려 있으면 움직이지 않는다.
    if (state.uiOpen) {
      this.me.setVelocity(0, 0);
    } else {
      // 키보드(PC) 또는 화면 D-패드(모바일, state.touch) 어느 쪽이든 이동.
      const t = state.touch;
      const left = this.cursors.left.isDown || this.wasd.A.isDown || t.left;
      const right = this.cursors.right.isDown || this.wasd.D.isDown || t.right;
      const up = this.cursors.up.isDown || this.wasd.W.isDown || t.up;
      const down = this.cursors.down.isDown || this.wasd.S.isDown || t.down;

      let vx = 0, vy = 0, dir = state.me.dir || 'down';
      if (left) { vx = -SPEED; dir = 'left'; }
      else if (right) { vx = SPEED; dir = 'right'; }
      if (up) { vy = -SPEED; dir = 'up'; }
      else if (down) { vy = SPEED; dir = 'down'; }
      this.me.setVelocity(vx, vy);
      state.me.dir = dir;

      // 위치를 주기적으로 서버에 전송(움직였고, 전송 주기가 지났을 때).
      if ((vx || vy) && time - this.lastSent > MOVE_SEND_MS) {
        this.lastSent = time;
        state.me.x = this.me.x;
        state.me.y = this.me.y;
        send('player:move', { x: Math.round(this.me.x), y: Math.round(this.me.y), dir });
      }
    }

    // 내 이름표는 아바타를 따라다닌다.
    this.myLabel.setPosition(this.me.x, this.me.y - 22);

    // 💌/📋 알림은 이름표 위에서 통통 튀며 따라온다. 둘 다면 좌우로 벌린다.
    const both = this.mailIcon.visible && this.missionIcon.visible;
    if (this.mailIcon.visible || this.missionIcon.visible) {
      this.mailBob += 0.12;
      const y = this.me.y - 40 + Math.sin(this.mailBob) * 4;
      if (this.mailIcon.visible) this.mailIcon.setPosition(this.me.x - (both ? 16 : 0), y);
      if (this.missionIcon.visible) this.missionIcon.setPosition(this.me.x + (both ? 16 : 0), y);
    }

    // 다른 사람들: 목표 좌표로 부드럽게 이동(보간).
    for (const o of this.others.values()) {
      o.sprite.x = Phaser.Math.Linear(o.sprite.x, o.tx, 0.25);
      o.sprite.y = Phaser.Math.Linear(o.sprite.y, o.ty, 0.25);
      o.label.setPosition(o.sprite.x, o.sprite.y - 22);
    }
  }

  // 자식이 반드시 구현: 지도를 그린다.
  buildMap() {
    throw new Error('buildMap() 를 자식 씬에서 구현하세요.');
  }
}

// '#4dabf7' 같은 CSS 색 문자열 → Phaser 가 쓰는 0x4dabf7 숫자.
export function colorToHex(css) {
  if (typeof css === 'number') return css;
  return parseInt(String(css).replace('#', ''), 16) || 0xffffff;
}
