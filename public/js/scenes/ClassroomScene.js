// =====================================================================
// ClassroomScene — 학교 안 교실(실내).
// 맵을 화면(800x600)보다 크게(25x19=800x608) 잡아 하늘색 여백 없이 꽉 채운다.
//   0=바닥(마루)  6=벽(막힘)  8=작품 구역 러그  5=나가는 문
//   책상/의자는 그리드가 아니라 이미지 오브젝트(정면, 일자)로 배치한다(drawDesks).
// 칠판/작품은 클릭하면 HTML 화면(PPT/작품)이 크게 열린다.
// =====================================================================

import { WorldScene, colorToHex } from './WorldScene.js';
import { TILE } from './BootScene.js';
import { state } from '../state.js';
import { onNet, offNet } from '../net.js';
import { openPPT } from '../ui/ppt.js';
import { openGallery } from '../ui/gallery.js';
import { openGuide } from '../ui/guide.js';

const COLS = 25, ROWS = 19; // 25x19 타일 = 800x608px (캔버스 800x600 을 꽉 채움)

const TILES = {
  0: { tex: 'classfloor', solid: false }, // 바닥(따뜻한 나무마루)
  6: { color: '#495057', solid: true },   // 벽
  8: { tex: 'classrug', solid: false },   // 작품 구역 러그(세이지)
  5: { color: '#a9713f', solid: false },  // 나가는 문(나무색; 위에 문짝을 그림)
};

// 작품 구역(오른쪽 좁은 스트립)과 문 위치.
const GALLERY_COLS = [21, 23];      // 러그 열(작품 구역) — 이름표가 잘리지 않게 3칸으로 넓힘
const DOOR_COLS = [12, 13];         // 아래 벽 가운데 2칸이 문

// 배경색(0xRRGGBB)이 밝은지 판단 — 색 이름표 위 글자색(어둡게/밝게)을 고르는 데 쓴다.
function isLightHex(num) {
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

export class ClassroomScene extends WorldScene {
  constructor() {
    super('ClassroomScene');
  }

  buildMap() {
    state.scene = 'classroom';

    // 지도(테두리 벽 + 오른쪽 작품 러그 + 아래 벽 가운데 문)를 코드로 생성.
    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        let code = 0;
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) code = 6; // 테두리 벽
        if (c >= GALLERY_COLS[0] && c <= GALLERY_COLS[1] && r >= 1 && r <= ROWS - 2) code = 8; // 러그
        if (r === ROWS - 1 && DOOR_COLS.includes(c)) code = 5; // 문(아래 벽)
        row.push(code);
      }
      grid.push(row);
    }
    this.drawGrid(grid, TILES);

    // 문 근처(아래쪽)에서 시작.
    const doorCx = (DOOR_COLS[0] + 1) * TILE; // 두 칸 사이 경계 = 13*TILE
    this.spawn = { x: doorCx, y: (ROWS - 3) * TILE + TILE / 2 };

    // 나가는 문(5) → 섬으로 복귀.
    this.makeDoor(doorCx, (ROWS - 1) * TILE + TILE / 2, TILE * 2, TILE, () => {
      this.scene.start('IslandScene', { transition: true });
    });

    // 책상(앞줄2·뒷줄3, 일자)·문짝·칠판·책장·작품 목록 그리기.
    this.drawDesks();
    this.drawExitDoor();
    this.drawBlackboard();
    this.drawBookshelf();
    this.drawGallery();
  }

  // 교실 왼쪽 아래 벽 옆에 책장. 클릭하면 안내 문서(How-to) 목록이 열린다.
  drawBookshelf() {
    const x = 2 * TILE, y = (ROWS - 3) * TILE;
    const shelf = this.add.image(x, y, 'bookshelf').setDepth(2).setInteractive({ useHandCursor: true });
    shelf.on('pointerdown', () => { if (!state.uiOpen) openGuide(); });
    // 충돌(지나가지 못하게).
    const body = this.solids.create(x, y, 'tile');
    body.setVisible(false); body.setDisplaySize(44, 46); body.refreshBody();
    // 안내 라벨.
    this.add.text(x, y - 30, '📚 책장', { fontSize: '11px', fontStyle: 'bold', color: '#5c3d00' })
      .setOrigin(0.5).setDepth(3);
  }

  // WorldScene.create 를 실행한 뒤, 칠판/갤러리 실시간 갱신도 구독.
  create(data) {
    super.create(data);
    this._onBoard = (d) => { state.blackboard = d.materials || []; this.drawBlackboard(); };
    this._onGallery = (d) => { state.gallery = d.gallery || state.gallery; this.drawDesks(); this.drawGallery(); };
    onNet('blackboard:update', this._onBoard);
    onNet('gallery:update', this._onGallery);
    this.events.once('shutdown', () => {
      offNet('blackboard:update', this._onBoard);
      offNet('gallery:update', this._onGallery);
    });
  }

  // 칠판: 위쪽에 초록 판 + 강의자료 제목들(클릭 시 전체화면).
  drawBlackboard() {
    if (this._bb) this._bb.forEach((o) => o.destroy());
    this._bb = [];
    const cx = 11 * TILE, cy = 2 * TILE, w = 18 * TILE, h = 3 * TILE - 8;
    const board = this.add.rectangle(cx, cy, w, h, 0x1b4332).setStrokeStyle(4, 0x7f5539);
    this._bb.push(board);
    this._bb.push(this.add.text(cx - w / 2 + 12, cy - h / 2 + 6, '📋 칠판 · 강의자료 (제목을 클릭하세요)', { fontSize: '13px', color: '#d8f3dc' }));

    if (state.blackboard.length === 0) {
      this._bb.push(this.add.text(cx, cy + 8, '(아직 게시된 자료가 없습니다)', { fontSize: '12px', color: '#95d5b2' }).setOrigin(0.5));
    }
    state.blackboard.forEach((m, i) => {
      const t = this.add
        .text(cx - w / 2 + 18, cy - h / 2 + 30 + i * 20, '• ' + m.title, { fontSize: '13px', color: '#ffffff' })
        .setInteractive({ useHandCursor: true });
      t.on('pointerover', () => t.setColor('#ffe066'));
      t.on('pointerout', () => t.setColor('#ffffff'));
      t.on('pointerdown', () => openPPT(m.url, m.title));
      this._bb.push(t);
    });
  }

  // 책상 배치: 학생 수에 맞춰 자동으로 늘어난다. 한 줄 최대 3개, 가운데 정렬,
  // 칠판(위)과 문(아래) 사이 세로로 여러 줄. 오른쪽 작품 구역(러그)은 침범하지 않는다.
  // 일자(정면)로 칠판을 바라본다. 충돌 몸통을 하나씩 둔다.
  drawDesks() {
    if (this._desks) this._desks.forEach((o) => o.destroy());
    this._desks = [];
    // 책상은 학생 수만큼만(선생님은 갤러리에는 있지만 학생 책상은 두지 않는다).
    const people = (state.gallery && state.gallery.students) || null;
    const n = people ? people.filter((s) => s.role !== 'admin').length : 5;
    const desks = this.deskLayout(n);
    for (const d of desks) {
      // 의자(책상 남쪽)를 먼저 → 책상이 살짝 덮어 "책상에 앉은" 느낌.
      this._desks.push(this.add.image(d.x, d.y + 15, 'chair').setDepth(1));
      this._desks.push(this.add.image(d.x, d.y, 'desk').setDepth(2));
      // 보이지 않는 충돌 몸통.
      const body = this.solids.create(d.x, d.y, 'tile');
      body.setVisible(false);
      body.setDisplaySize(26, 20);
      body.refreshBody();
      this._desks.push(body);
    }
  }

  // n명 → 책상 좌표 목록. 한 줄 최대 3개, 가로 4칸 간격, 세로 4칸(줄) 간격.
  // 좌우는 가운데 정렬(작품 구역 열 22~23 은 피함), 위에서부터 채운다.
  deskLayout(n) {
    const count = Math.max(0, n);
    const perRow = 3;                 // 한 줄 최대 3개
    const colGap = 4, rowGap = 4;     // 책상 간격(타일)
    const startRow = 7;               // 첫 줄 y(타일). 칠판(위) 아래.
    const desks = [];
    const rows = Math.ceil(count / perRow);
    let placed = 0;
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(perRow, count - placed); // 이 줄의 책상 수
      const rowW = (inRow - 1) * colGap;
      const startCol = (COLS - 1) / 2 - rowW / 2 - 1;  // 교실 가로 가운데(러그 제외 폭) 정렬
      for (let c = 0; c < inRow; c++) {
        desks.push({ x: (startCol + c * colGap + 0.5) * TILE, y: (startRow + r * rowGap + 0.5) * TILE });
        placed++;
      }
    }
    return desks;
  }

  // 나가는 문짝(아래 벽의 2칸 문). 보라색 대신 나무 문 + "나가기" 안내로 문임을 분명히.
  drawExitDoor() {
    const cx = (DOOR_COLS[0] + 1) * TILE; // 문 중심(두 칸 경계)
    const top = (ROWS - 1) * TILE;        // 문 타일 상단
    const g = this.add.graphics();
    g.setDepth(3);
    g.fillStyle(0x5f3f24, 1); g.fillRect(cx - TILE - 2, top - 3, TILE * 2 + 4, TILE + 3); // 문틀
    g.fillStyle(0xb5835a, 1);                                                             // 문짝 2개
    g.fillRect(cx - TILE + 2, top, TILE - 4, TILE - 3);
    g.fillRect(cx + 2, top, TILE - 4, TILE - 3);
    g.lineStyle(2, 0x8a5a34, 1);                                                          // 패널
    g.strokeRect(cx - TILE + 6, top + 4, TILE - 12, TILE - 12);
    g.strokeRect(cx + 6, top + 4, TILE - 12, TILE - 12);
    g.fillStyle(0xffd24a, 1);                                                             // 손잡이
    g.fillCircle(cx - 5, top + TILE / 2, 2);
    g.fillCircle(cx + 5, top + TILE / 2, 2);
    this.add.text(cx, top - 6, '🚪 나가기', { fontSize: '11px', fontStyle: 'bold', color: '#5c3d00' })
      .setOrigin(0.5, 1).setDepth(3);
  }

  // 오른쪽 작품 구역(러그 스트립): 사람마다 '색 이름표'(대표색 배경 + 이름)를 세로로 건다.
  // 대표색을 이름표 배경으로 삼아 점 아이콘 없이 색과 이름을 하나로 보여준다.
  // 이름표를 누르면 그 사람의 작품(4가지) 화면이 열린다. 선생님도 학생과 동일하게(별도 아이콘 없이) 표시.
  drawGallery() {
    if (this._g) this._g.forEach((o) => o.destroy());
    this._g = [];
    const stripL = GALLERY_COLS[0] * TILE;                          // 러그 왼쪽 x
    const stripW = (GALLERY_COLS[1] - GALLERY_COLS[0] + 1) * TILE;  // 러그 폭
    const cx = stripL + stripW / 2;                                 // 러그 중심 x
    this._g.push(this.add.text(cx, 1 * TILE + 4, '🖼 작품', { fontSize: '13px', fontStyle: 'bold', color: '#3f5c3a' }).setOrigin(0.5, 0));

    const gallery = state.gallery;
    if (!gallery || !gallery.students || gallery.students.length === 0) {
      this._g.push(this.add.text(cx, 6 * TILE, '(준비중)', { fontSize: '11px', color: '#6b8a66' }).setOrigin(0.5));
      return;
    }

    const plateW = stripW - 12;  // 이름표 폭(러그 안쪽 여백)
    const plateH = 24;
    const top = 2.6 * TILE;      // 첫 이름표 y(제목 아래)
    const gap = plateH + 10;     // 이름표 세로 간격
    gallery.students.forEach((stu, i) => {
      const y = top + i * gap;
      const fill = colorToHex(stu.color || '#adb5bd');
      const plate = this.add
        .rectangle(cx, y, plateW, plateH, fill)
        .setStrokeStyle(2, 0x2b2340)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      // 배경 밝기에 따라 글자색 자동 선택(대비 확보).
      const txtColor = isLightHex(fill) ? '#2b2340' : '#ffffff';
      const name = this.add
        .text(cx, y, stu.nickname, { fontSize: '11px', fontStyle: 'bold', color: txtColor })
        .setOrigin(0.5);
      plate.on('pointerover', () => plate.setStrokeStyle(2, 0xe8590c));
      plate.on('pointerout', () => plate.setStrokeStyle(2, 0x2b2340));
      plate.on('pointerdown', () => openGallery(stu.id));
      this._g.push(plate, name);
    });
  }
}
