// =====================================================================
// IslandScene — 강원도 영월 산골 마을(야외). 스타듀밸리풍 코지 컨트리사이드.
//
// 지형은 아래 "구역 함수"들로 정해진다(큰 지도라 숫자 배열 대신 함수가 더 깔끔).
// 학생이 바꾸고 싶으면 각 함수의 좌표 숫자만 고치면 된다.
//   - mountain(): 산 (막힘, 봉우리 아이콘)   - river(): 동강 (막힘)
//   - schoolWall()/door(): 학교              - plaza(): 마을 광장(넓게)
//   - path(): 흙길                           - pond(): 연못(작게)
// 빈 잔디는 아이들이 채울 공간으로 비워둔다.
// =====================================================================

import { WorldScene } from './WorldScene.js';
import { TILE } from './BootScene.js';
import { state } from '../state.js';

const COLS = 30, ROWS = 22; // 30x22 타일 = 960x704 (카메라가 따라다님)

// 지형 종류별 텍스처/충돌. (tex/texes = 상세 픽셀 텍스처)
const TILES = {
  0: { texes: ['grass0', 'grass1', 'grass2'], solid: false }, // 잔디(밝은 들판)
  1: { tex: 'water', solid: true },                          // 동강(물)
  2: { texes: ['mtn0', 'mtn1'], solid: true },               // 산(짙은 숲 초록 + 봉우리 아이콘)
  3: { tex: 'dirt', solid: false },                          // 흙길/위쪽 흙
  4: { tex: 'sand', solid: false },                          // 광장(모래)
  5: { color: '#8a5a2b', solid: false },                     // 학교 문
  6: { tex: 'bridge', solid: false },                        // 나무다리
  7: { color: '#efe2c4', solid: true },                      // 학교 건물(벽)
  8: { tex: 'trail', solid: false },                         // 등산로
  9: { texes: ['grass0', 'grass1', 'grass2'], solid: true }, // 나무 자리(잔디 + 위에 나무)
};

// 등산로: 마을 광장 오른쪽(24,15)에서 숲(나무) 사이로 지그재그(스위치백)로 올라간다.
// 1칸 폭이라 나무 사이를 요리조리 통과해야 함(작은 원형 몸통이라 통과 가능).
// 모든 이동이 상/하/좌/우(대각선 없음)라서 반드시 걸어서 오를 수 있다.
const TRAIL = [
  [25,15],[26,15],[27,15],[28,15], // 입구에서 오른쪽으로
  [28,14],[28,13],                 // 위로
  [27,13],[26,13],[25,13],         // 왼쪽으로
  [25,12],[25,11],                 // 위로
  [26,11],[27,11],[28,11],         // 오른쪽으로
  [28,10],[28,9],                  // 위로
  [27,9],[26,9],[25,9],            // 왼쪽으로
  [25,8],[25,7],                   // 위로
  [26,7],[27,7],[28,7],            // 오른쪽으로
  [28,6],[28,5],                   // 위로
  [27,5],[26,5],                   // 왼쪽으로 → 정상 빈터
];
const CLEARING = [[25,4],[26,4],[27,4]]; // 산 정상 빈터(아이들이 꾸밀 공간)

// 숲(나무) 자리. 가장자리를 아늑하게. (산/물 위에 겹치면 자동으로 제외됨)
const TREES = [
  [1,4],[2,5],[1,6],[2,8],[1,9],[1,13],[2,14],[1,16],[2,17],
  [10,2],[12,2],[20,2],[22,3],[19,8],[6,13],
  [7,18],[9,19],[20,18],[22,19],
];

// 청소년수련관 오른쪽 캠프파이어 텐트.
//   cx = 가운데 x, baseY = 바닥(아랫변) y, apexY = 꼭대기 y, halfW = 아랫변 반폭.
//   입구는 아랫변 가운데. 밟거나 클릭하면 텐트 안(CampfireScene)으로 들어간다.
const TENT = { cx: 13 * TILE, baseY: 6 * TILE, apexY: 4 * TILE - 8, halfW: 40 };

export class IslandScene extends WorldScene {
  constructor() {
    super('IslandScene');
  }

  // ---- 구역 판정 함수들 ----
  // 학교: 3x2(가로 3 · 세로 2)로 더 작게. 문은 아래 가운데 1칸(크기 유지).
  //   벽을 행 4~5 로 낮춰 맵 위쪽 잘림을 줄이고, 지붕이 벽 윗변을 깔끔히 덮게 한다.
  static door(c, r) { return r === 5 && c === 5; }
  static schoolWall(c, r) { return c >= 4 && c <= 6 && r >= 4 && r <= 5 && !IslandScene.door(c, r); }
  static bridge(c, r) { return (c >= 13 && c <= 15) && (r === 10 || r === 11); }
  static dirtTop(c, r) { return r <= 1; }    // 맵 위쪽 = 흙(그대로 남겨둠)
  static mountain(c, r) { return c >= 25 && r >= 2; } // 오른쪽만 산(맨 위 흙줄 아래로)
  static river(c, r) { return r >= 10 && r <= 11 && c >= 1 && c <= 24; } // 동강 본류(가로)
  // 연못: 반지름을 절반으로(넓이 약 1/4). 왼쪽 아래 작게.
  static pond(c, r) { const dx = c - 4, dy = r - 18; return dx * dx + dy * dy < 1.6; }
  // 광장: 넓게(cols 10~19, rows 13~17).
  static plaza(c, r) { return c >= 10 && c <= 19 && r >= 13 && r <= 17; }

  buildMap() {
    state.scene = 'island';

    // 흙길: 시작 → 광장 → 다리 → 학교.
    const path = new Set();
    const P = (c, r) => path.add(c + ',' + r);
    for (let r = 20; r >= 18; r--) P(14, r);   // 시작 → 광장 아래
    P(14, 12);                                  // 광장 위 → 다리
    P(14, 9);                                    // 다리 위
    for (let c = 13; c >= 5; c--) P(c, 9);       // 서쪽으로
    P(5, 8); P(5, 7); P(5, 6);                   // 학교 문 앞

    // 등산로/빈터(산을 뚫어 걸을 수 있게).
    const trail = new Set(TRAIL.map(([c, r]) => c + ',' + r));
    const clearing = new Set(CLEARING.map(([c, r]) => c + ',' + r));

    // 지형 코드 계산(우선순위 주의). 등산로/빈터는 산보다 먼저 → 산을 뚫는다.
    const code = (c, r) => {
      if (IslandScene.door(c, r)) return 5;
      if (IslandScene.schoolWall(c, r)) return 7;
      if (IslandScene.bridge(c, r)) return 6;
      if (IslandScene.dirtTop(c, r)) return 3; // 맵 위쪽 = 흙
      if (trail.has(c + ',' + r)) return 8;   // 등산로(걸을 수 있음)
      if (clearing.has(c + ',' + r)) return 0; // 산속 빈터(잔디)
      if (IslandScene.mountain(c, r)) return 2;
      if (IslandScene.river(c, r)) return 1;
      if (IslandScene.plaza(c, r)) return 4;
      if (path.has(c + ',' + r)) return 3;
      if (IslandScene.pond(c, r)) return 1;
      return 0;
    };

    // 나무 자리는 잔디 위에 있을 때만 유효.
    const treeSet = new Set();
    for (const [c, r] of TREES) if (code(c, r) === 0) treeSet.add(c + ',' + r);

    // 2차원 배열로 만들어 drawGrid 에 넘긴다.
    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push(treeSet.has(c + ',' + r) ? 9 : code(c, r));
      grid.push(row);
    }
    this.drawGrid(grid, TILES);

    // 실내에서 나왔을 땐 그 문 앞에서 시작(교실=학교 문 아래 / 텐트=텐트 입구 앞).
    if (this.transition) {
      this.spawn = this.fromScene === 'campfire'
        ? { x: TENT.cx, y: TENT.baseY + 26 }
        : { x: 5 * TILE + TILE / 2, y: 7 * TILE + TILE / 2 };
    }

    this.decorate(treeSet, grid);

    // 학교 문 → 교실 입장(문 1칸).
    this.makeDoor(5 * TILE + TILE / 2, 5 * TILE + TILE / 2, TILE, TILE, () => {
      this.scene.start('ClassroomScene', { transition: true });
    });

    // 텐트 입구 → 캠프파이어(회고) 입장.
    this.makeDoor(TENT.cx, TENT.baseY - 10, 46, 26, () => {
      this.scene.start('CampfireScene', { transition: true });
    });
  }

  // 지형 위에 얹는 그림들. grid 는 최종 지형 코드(등산로가 뚫린 상태).
  decorate(treeSet, grid) {
    // 산(코드 2): 맨 윗줄(위가 흙인 능선)엔 봉우리 아이콘, 그 아래 산속은 나무 숲.
    // 등산로(코드 8)·빈터(코드 0)는 비어 있어 그 "나무 사이"로 지그재그로 오른다.
    const isM = (c, r) => r >= 0 && c >= 0 && r < ROWS && c < COLS && grid[r][c] === 2;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isM(c, r)) continue;
        if (grid[r - 1] && grid[r - 1][c] === 3) {
          // 위가 흙(맨 위 능선) → 봉우리
          this.add.image(c * TILE + TILE / 2, r * TILE + TILE * 0.7, 'mountain').setOrigin(0.5, 0.8);
        } else if (Math.random() < 0.82) {
          // 산속 → 나무(숲). 약간의 빈틈을 남긴다.
          this.add.image(c * TILE + TILE / 2, r * TILE + TILE, 'tree').setOrigin(0.5, 0.82);
        }
      }
    }

    // 나무.
    for (const key of treeSet) {
      const [c, r] = key.split(',').map(Number);
      this.add.image(c * TILE + TILE / 2, r * TILE + TILE, 'tree').setOrigin(0.5, 0.82);
    }

    // 꽃밭(오른쪽 산 앞) + 흩뿌린 꽃.
    const FLOWER_COLORS = [0xf56aa0, 0xffd24a, 0xb06fe0, 0xff8a5c, 0xffffff];
    const flower = (x, y) =>
      this.add.image(x, y, 'flower').setTint(Phaser.Utils.Array.GetRandom(FLOWER_COLORS));
    for (let r = 5; r <= 9; r++)
      for (let c = 19; c <= 23; c++)
        if (this.isFreeGrass(c, r, treeSet) && Math.random() < 0.5)
          flower(c * TILE + 6 + Math.random() * 20, r * TILE + 6 + Math.random() * 20);
    for (let i = 0; i < 30; i++) {
      const c = 1 + Math.floor(Math.random() * 24), r = 2 + Math.floor(Math.random() * 18);
      if (this.isFreeGrass(c, r, treeSet)) flower(c * TILE + 8 + Math.random() * 14, r * TILE + 8 + Math.random() * 14);
    }

    // 연못가 바위.
    this.add.image(6 * TILE + 8, 18 * TILE, 'rock').setScale(0.8);

    // 마을 광장(넓게): 큰 나무 + 모닥불 + 벤치.
    this.add.image(13 * TILE + 16, 15 * TILE + 20, 'tree').setOrigin(0.5, 0.82).setScale(1.7);
    const bigZone = this.solids.create(13 * TILE + 16, 15 * TILE + 22, 'tile');
    bigZone.setVisible(false); bigZone.setDisplaySize(26, 18); bigZone.refreshBody();
    this.drawCampfire(17 * TILE + 16, 15 * TILE + 18);
    const g = this.add.graphics();
    g.fillStyle(0xb98a53, 1);
    g.fillRect(11 * TILE + 4, 16 * TILE + 12, 26, 6);
    g.fillRect(16 * TILE + 20, 16 * TILE + 12, 26, 6);

    // 학교 건물(3x2, 행 4~5 에 맞춤).
    this.drawSchool(4 * TILE, 4 * TILE, 3 * TILE, 2 * TILE);

    // 수련관 오른쪽: 캠프파이어 텐트(회고하는 곳) + 텐트 앞 모닥불.
    this.drawTent();

    // 이정표: 동강 다리를 건넌 직후(강 북쪽), 학교로 꺾이는 길목에서 "← 학교".
    this.drawSignpost(15 * TILE + 8, 8 * TILE + 4);

    // 산 정상 빈터에 바위 하나(나머지는 아이들이 꾸밀 공간).
    this.add.image(25 * TILE + 10, 4 * TILE + 6, 'rock').setScale(0.8);

    // 지명 라벨.
    this.placeLabel('🏞️ 동강', 16 * TILE, 10 * TILE + 4, '#1c6fa8', '#ffffff');
    this.placeLabel('⛰️ 봉래산', 27 * TILE, 10 * TILE, '#2f572d', '#eaf3e6');
    this.placeLabel('🥾 등산로', 23 * TILE, 15 * TILE, '#5a4a2a', '#f5efe0');
    this.placeLabel('동강 둔치', 12 * TILE, 13 * TILE + 2, '#7a5230', '#fff7e6');
    this.placeLabel('밭', 11 * TILE, 1 * TILE, '#7a5a34', '#efe2c4');
  }

  isFreeGrass(c, r, treeSet) {
    return !IslandScene.mountain(c, r) && !IslandScene.river(c, r) && !IslandScene.pond(c, r)
      && !IslandScene.plaza(c, r) && !IslandScene.schoolWall(c, r) && !IslandScene.door(c, r)
      && !treeSet.has(c + ',' + r);
  }

  // 캠프파이어 텐트(청소년수련관 오른쪽). 삼각 텐트 + 걷어올린 입구 + 밧줄/말뚝.
  // 색은 주황~빨강 사이 레드 계열(#e2603a → #8e2318)로 캠프파이어 분위기를 낸다.
  drawTent() {
    const { cx, baseY, apexY, halfW } = TENT;
    const L = cx - halfW, R = cx + halfW;
    const g = this.add.graphics();
    g.setDepth(3);

    // 바닥 그림자.
    g.fillStyle(0x000000, 0.16); g.fillEllipse(cx, baseY + 3, halfW * 2 + 10, 10);

    // 밧줄 + 말뚝(양쪽으로 팽팽하게).
    g.lineStyle(2, 0xf1e0bd, 0.9);
    g.lineBetween(cx, apexY + 6, L - 16, baseY);
    g.lineBetween(cx, apexY + 6, R + 16, baseY);
    g.fillStyle(0x6b4a30, 1);
    g.fillRect(L - 18, baseY - 3, 4, 7); g.fillRect(R + 14, baseY - 3, 4, 7);

    // 천 몸통: 왼쪽은 빛을 받은 주황, 오른쪽은 그늘진 빨강.
    g.fillStyle(0xe2603a, 1); g.fillTriangle(L, baseY, cx, apexY, cx, baseY);
    g.fillStyle(0xc0392b, 1); g.fillTriangle(cx, baseY, cx, apexY, R, baseY);
    // 아랫단(땅에 닿는 부분) 짙게 + 천 주름 몇 줄.
    g.fillStyle(0x8e2318, 0.35); g.fillTriangle(L, baseY, R, baseY, cx, baseY - 12);
    g.lineStyle(2, 0xffffff, 0.14);
    g.lineBetween(cx - 18, baseY, cx - 6, apexY + 16);
    g.lineBetween(cx + 18, baseY, cx + 6, apexY + 16);

    // 입구: 안쪽은 어둡고, 걷어올린 문짝 두 장이 양옆으로 묶여 있다.
    const dw = 15, dh = 34;
    g.fillStyle(0x3a1a12, 1); g.fillTriangle(cx - dw, baseY, cx, baseY - dh, cx + dw, baseY);
    g.fillStyle(0xffb17a, 0.5); g.fillTriangle(cx - 5, baseY, cx, baseY - dh + 6, cx + 5, baseY); // 안쪽 불빛
    g.fillStyle(0xf08a5d, 1);
    g.fillTriangle(cx - dw - 9, baseY, cx - dw + 1, baseY - dh + 4, cx - dw + 1, baseY); // 왼쪽 문짝
    g.fillTriangle(cx + dw + 9, baseY, cx + dw - 1, baseY - dh + 4, cx + dw - 1, baseY); // 오른쪽 문짝

    // 용마루(가운데 기둥선)와 꼭대기 깃발.
    g.fillStyle(0x8e2318, 1); g.fillRect(cx - 1, apexY, 2, baseY - apexY);
    g.fillStyle(0x6b4a30, 1); g.fillRect(cx - 1, apexY - 12, 2, 13);
    g.fillStyle(0xffd24a, 1); g.fillTriangle(cx + 1, apexY - 12, cx + 14, apexY - 8, cx + 1, apexY - 4);

    // 천은 지나갈 수 없다(입구만 열려 있음). 보이지 않는 충돌 몸통.
    const body = this.solids.create(cx, apexY + 34, 'tile');
    body.setVisible(false); body.setDisplaySize(halfW * 2 - 6, 40); body.refreshBody();

    // 텐트 앞 모닥불 + 통나무 의자(밖에서도 캠프파이어 분위기).
    this.drawCampfire(cx + 78, baseY - 14);
    const logs = this.add.graphics();
    logs.fillStyle(0xb98a53, 1);
    logs.fillRect(cx + 52, baseY - 4, 20, 6);
    logs.fillRect(cx + 90, baseY - 26, 6, 20);

    // 안내 라벨(꼭대기 위).
    this.add
      .text(cx, apexY - 14, '⛺ 캠프파이어', {
        fontSize: '11px', fontStyle: 'bold', color: '#7a2a12',
        backgroundColor: '#fff3e0dd', padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(500);
  }

  drawCampfire(x, y) {
    const g = this.add.graphics();
    g.fillStyle(0x6b4b2f, 1); g.fillRect(x - 8, y + 4, 16, 4);
    g.fillStyle(0xff8a2b, 1); g.fillTriangle(x, y - 10, x - 6, y + 4, x + 6, y + 4);
    g.fillStyle(0xffd24a, 1); g.fillTriangle(x, y - 3, x - 3, y + 4, x + 3, y + 4);
  }

  drawSignpost(x, y) {
    const g = this.add.graphics();
    g.fillStyle(0x946b3c, 1); g.fillRect(x - 2, y, 4, 30);
    // 위 판 = 수련관, 아래 판 = 그 오른쪽의 캠프파이어 텐트.
    g.fillStyle(0xb98a53, 1); g.fillRect(x - 30, y - 5, 60, 12);
    g.fillStyle(0xc07a4a, 1); g.fillRect(x - 30, y + 10, 60, 12);
    this.add.text(x, y + 1, '← 청소년수련관', { fontSize: '8px', color: '#4a3418' }).setOrigin(0.5, 0.5);
    this.add.text(x, y + 16, '← ⛺ 캠프파이어', { fontSize: '8px', color: '#3f1d10' }).setOrigin(0.5, 0.5);
  }

  // 작은 3x2 학교 건물. (bx,by)=벽 몸통 왼쪽 위, bw×bh=벽 크기.
  // 지붕 밑변을 벽 윗변(by)에 정확히 맞추고 처마를 좌우로 넉넉히 빼서
  // 크림색 벽 모서리가 지붕 밖으로 삐져나오지 않게 한다.
  drawSchool(bx, by, bw, bh) {
    const g = this.add.graphics();
    const cx = bx + bw / 2;

    // 바닥 그림자.
    g.fillStyle(0x000000, 0.14); g.fillEllipse(cx, by + bh + 2, bw + 6, 8);

    // 벽 몸통 테두리(크림 타일이 건물처럼 보이게 얇은 외곽선).
    g.lineStyle(2, 0x000000, 0.16); g.strokeRect(bx, by, bw, bh);

    // 지붕: 밑변을 by(벽 윗변)에 두고 처마는 좌우 +7px → 벽 top 을 완전히 덮음.
    const eaveL = bx - 7, eaveR = bx + bw + 7, apexY = by - 22;
    g.fillStyle(0xc85a3d, 1); g.fillTriangle(eaveL, by, cx, apexY, eaveR, by);   // 지붕(밝은 면)
    g.fillStyle(0xa84730, 1); g.fillTriangle(eaveL, by, cx, apexY, cx, by);       // 왼쪽 그늘
    g.fillStyle(0x8a3a26, 1); g.fillRect(cx - 1, apexY, 2, by - apexY);           // 용마루
    g.fillStyle(0x000000, 0.12); g.fillRect(bx, by, bw, 3);                        // 처마 밑 그림자

    // 창문 2개(문 위 좌우).
    const wy = by + 15, ww = 14, wh = 14;
    const wxs = [bx + 9, bx + bw - 9 - ww];
    g.fillStyle(0xffe9a8, 1);
    for (const wx of wxs) g.fillRect(wx, wy, ww, wh);
    g.lineStyle(2, 0x946b3c, 1);
    for (const wx of wxs) {
      g.strokeRect(wx, wy, ww, wh);
      g.lineBetween(wx, wy + wh / 2, wx + ww, wy + wh / 2);
      g.lineBetween(wx + ww / 2, wy, wx + ww / 2, wy + wh);
    }

    // 문(가운데 아래) — 밟으면 교실로 들어가는 그 칸. 크기 유지.
    const dw = 20, dh = 24;
    g.fillStyle(0x7a5230, 1); g.fillRect(cx - dw / 2, by + bh - dh, dw, dh);
    g.fillStyle(0x5f3f24, 1); g.fillRect(cx - dw / 2, by + bh - dh, 3, dh);
    g.fillStyle(0xffd24a, 1); g.fillCircle(cx + dw / 2 - 4, by + bh - dh / 2, 1.6);

    // 간판(처마 아래 벽 위쪽).
    g.fillStyle(0xb98a53, 1); g.fillRect(cx - 33, by + 2, 66, 13);
    g.fillStyle(0x000000, 0.15); g.fillRect(cx - 33, by + 15, 66, 2);
    this.add.text(cx, by + 8, '청소년수련관', { fontSize: '8px', fontStyle: 'bold', color: '#4a3418' }).setOrigin(0.5);
  }

  placeLabel(text, x, y, color, bg) {
    this.add
      .text(x, y, text, { fontSize: '13px', fontStyle: 'bold', color, backgroundColor: bg + 'cc', padding: { x: 5, y: 2 } })
      .setOrigin(0, 0.5)
      .setDepth(500);
  }
}
