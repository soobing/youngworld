// =====================================================================
// CampfireScene — 캠프파이어 텐트 안(실내).
// 일부러 "아주 좁게" 만들었다. 걸어다닐 수 있는 곳은 가운데 작은 타원뿐이라
// 여러 명이 들어오면 모닥불 주위에 옹기종기 붙어 앉게 된다.
//   0=돗자리 바닥(걸을 수 있음)  1=텐트 천(막힘)  2=나가는 입구(걷어올린 문)
// 가운데 모닥불 위에는 📜 쪽지 아이콘이 깜빡인다 → 클릭하면 회고 롤링페이퍼가 열린다.
// =====================================================================

import { WorldScene } from './WorldScene.js';
import { TILE } from './BootScene.js';
import { state } from '../state.js';
import { openRetro } from '../ui/retro.js';

const COLS = 25, ROWS = 19; // 25x19 = 800x608 (화면을 꽉 채움)

const TILES = {
  0: { tex: 'tentfloor', solid: false }, // 돗자리 바닥
  1: { tex: 'tentwall', solid: true },   // 텐트 천(벽)
  2: { tex: 'tentfloor', solid: false }, // 입구(나가는 곳)
};

// 걸을 수 있는 공간 = 가운데 작은 타원. 반지름을 키우면 텐트가 넓어진다.
const CENTER = { c: 12, r: 9 };
const RX = 4.6, RY = 3.5;
const EXIT = { c: 12, r: 16 }; // 아래쪽 입구(천을 걷어올린 자리)

// 둘러앉는 자리와 문 사이의 짧은 통로. 앉는 곳이 문에 바로 붙지 않게 띄워준다.
const HALL = { c0: 11, c1: 13, r0: 12, r1: EXIT.r - 1 };

function inside(c, r) {
  const dx = (c - CENTER.c) / RX, dy = (r - CENTER.r) / RY;
  return dx * dx + dy * dy <= 1;
}
function hall(c, r) {
  return c >= HALL.c0 && c <= HALL.c1 && r >= HALL.r0 && r <= HALL.r1;
}

export class CampfireScene extends WorldScene {
  constructor() {
    super('CampfireScene');
  }

  buildMap() {
    state.scene = 'campfire';

    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        if (inside(c, r) || hall(c, r)) row.push(0);
        else if (c === EXIT.c && r === EXIT.r) row.push(2);
        else row.push(1);
      }
      grid.push(row);
    }
    this.drawGrid(grid, TILES);

    // 들어오면 통로 가운데(문과 모닥불 사이)에서 시작.
    this.spawn = { x: CENTER.c * TILE + TILE / 2, y: (HALL.r1 - 0.5) * TILE };

    // 입구를 밟거나 누르면 섬으로 나간다.
    this.makeDoor(EXIT.c * TILE + TILE / 2, EXIT.r * TILE + TILE / 2, TILE, TILE, () => {
      this.scene.start('IslandScene', { transition: true, from: 'campfire' });
    });

    this.drawTentInside();
    this.drawExitFlap();
    this.drawFire();
  }

  // 텐트 안: 모닥불 불빛 + 둘러앉는 방석. (그 밖의 소품은 두지 않는다 — 불과 자리에만 집중)
  drawTentInside() {
    const cx = CENTER.c * TILE + TILE / 2;
    const cy = CENTER.r * TILE + TILE / 2;

    // 밤의 텐트 안: 전체를 살짝 어둡게 깔고(따뜻한 갈색),
    // 그 위에 모닥불 불빛을 세 겹으로 겹친다 — 바깥은 주황, 안쪽으로 갈수록 노랑.
    // (타일 depth 0 위 · 방석/사람 아래에 깔아 "불빛에 물든 바닥" 처럼 보이게)
    this.add.rectangle(this.worldW / 2, this.worldH / 2, this.worldW, this.worldH, 0x3a1608, 0.32).setDepth(0.4);

    // 불빛 두 겹(넓게 퍼지는 빛 + 불 가까이 노란 심지). 'firelight' 는 부드러운
    // 그라데이션 그림이라 가장자리가 각지지 않는다. 겹마다 속도를 달리해 일렁인다.
    const glow = (w, h, alpha, depth) => {
      const img = this.add.image(cx, cy + 4, 'firelight').setDepth(depth).setAlpha(alpha);
      img.setDisplaySize(TILE * w, TILE * h);
      return img;
    };
    const wide = glow(12.5, 8.6, 0.95, 0.5);
    const core = glow(6.6, 4.6, 0.8, 0.6);
    [[wide, 1600, 1.05], [core, 1150, 1.09]].forEach(([img, dur, mul]) =>
      this.tweens.add({
        targets: img, scaleX: img.scaleX * mul, scaleY: img.scaleY * mul,
        duration: dur, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    );

    // 둘러앉는 방석 8개(모닥불을 감싸는 타원). 좁아서 자연스럽게 붙어 앉게 된다.
    const seatColors = [0xf08a5d, 0xffd24a, 0x8ee07a, 0x74c0fc, 0xf783ac, 0xb197fc, 0xffa8a8, 0x63e6be];
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + Math.PI / 8;
      const x = cx + Math.cos(a) * TILE * 2.5;
      const y = cy + Math.sin(a) * TILE * 1.8;
      this.add.image(x, y, 'cushion').setTint(seatColors[i]).setDepth(2).setAlpha(0.95);
    }

    // 안내 문구(위쪽) — 아바타가 모이는 아래쪽을 가리지 않게 위에 둔다.
    this.add
      .text(cx, cy - TILE * 3.5, '🔥 모닥불에 둘러앉아 이번 강의를 돌아보는 시간', {
        fontSize: '12px', fontStyle: 'bold', color: '#ffe9c7',
      })
      .setOrigin(0.5)
      .setDepth(500);
  }

  // 나가는 입구(천을 양옆으로 걷어올린 자리). 밖의 밤하늘이 살짝 보인다.
  drawExitFlap() {
    const x = EXIT.c * TILE + TILE / 2, top = EXIT.r * TILE;
    const g = this.add.graphics().setDepth(3);
    // 열린 구멍(위가 둥근 문 모양).
    g.fillStyle(0x120402, 1);
    g.fillRect(x - 20, top - 6, 40, TILE + 8);
    g.fillEllipse(x, top - 6, 40, 22);
    // 밖(밤 풀밭 + 하늘빛).
    g.fillStyle(0x27506b, 1); g.fillRect(x - 14, top - 2, 28, TILE - 2);
    g.fillEllipse(x, top - 2, 28, 16);
    g.fillStyle(0x2f572d, 1); g.fillRect(x - 14, top + TILE - 12, 28, 12);
    g.fillStyle(0xffe066, 0.9); g.fillRect(x - 8, top + 2, 2, 2); g.fillRect(x + 6, top + 7, 2, 2);
    // 양옆으로 걷어올려 묶어둔 문짝 + 노란 끈.
    g.fillStyle(0xc0392b, 1);
    g.fillTriangle(x - 26, top - 6, x - 13, top + TILE + 2, x - 26, top + TILE + 2);
    g.fillTriangle(x + 26, top - 6, x + 13, top + TILE + 2, x + 26, top + TILE + 2);
    g.fillStyle(0xffd24a, 1);
    g.fillRect(x - 22, top + 8, 8, 3); g.fillRect(x + 14, top + 8, 8, 3);

    this.add.text(x, top - 10, '🚪 나가기', { fontSize: '11px', fontStyle: 'bold', color: '#ffe9c7' })
      .setOrigin(0.5, 1).setDepth(600);
  }

  // 가운데 모닥불 + 머리 위 깜빡이는 📜 쪽지(클릭 → 회고 롤링페이퍼).
  drawFire() {
    const x = CENTER.c * TILE + TILE / 2;
    const y = CENTER.r * TILE + TILE / 2;

    // 장작(X 자로 겹친 통나무) + 돌 화덕.
    const g = this.add.graphics().setDepth(3);
    g.fillStyle(0x8c7666, 1);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      g.fillCircle(x + Math.cos(a) * 26, y + Math.sin(a) * 17 + 6, 5);
    }
    g.fillStyle(0x6b4b2f, 1); g.fillRect(x - 16, y + 6, 32, 6);
    g.fillStyle(0x7a5230, 1); g.fillRect(x - 12, y + 2, 24, 5);

    // 불꽃 2겹 — 흔들리게 tween.
    const flame = this.add.graphics().setDepth(4);
    flame.fillStyle(0xff6b2b, 1); flame.fillTriangle(0, -26, -12, 8, 12, 8);
    flame.fillStyle(0xff9f43, 1); flame.fillTriangle(0, -17, -8, 8, 8, 8);
    flame.fillStyle(0xffe066, 1); flame.fillTriangle(0, -8, -4, 8, 4, 8);
    flame.setPosition(x, y);
    this.tweens.add({
      targets: flame, scaleY: 1.18, scaleX: 0.92,
      duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // 불티가 위로 올라간다.
    this.add.particles(x, y - 6, 'spark', {
      speedY: { min: -46, max: -18 }, speedX: { min: -12, max: 12 },
      lifespan: 1100, quantity: 1, frequency: 180,
      scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 },
      tint: [0xffd24a, 0xff9f43],
    }).setDepth(5);

    // 모닥불 자리는 지나갈 수 없다(둘러앉게).
    const body = this.solids.create(x, y + 4, 'tile');
    body.setVisible(false); body.setDisplaySize(34, 22); body.refreshBody();

    // --- 머리 위 알림처럼 깜빡이는 쪽지 아이콘 ---
    // 말풍선(테두리 상자) 없이 이모지만 둥둥 떠 있게 한다.
    const icon = this.add.text(x, y - 44, '📜', { fontSize: '18px' })
      .setOrigin(0.5)
      .setDepth(1300)
      // 그림보다 넉넉한 클릭 영역(작은 이모지를 놓치지 않게).
      .setInteractive(new Phaser.Geom.Rectangle(-9, -12, 36, 36), Phaser.Geom.Rectangle.Contains);
    icon.input.cursor = 'pointer';
    icon.on('pointerdown', () => { if (!state.uiOpen) openRetro(); });

    // 깜빡임(알림처럼) + 위아래로 통통.
    this.tweens.add({ targets: icon, alpha: 0.25, duration: 460, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: icon, y: y - 50, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // 📜 ↔ 🗞️ 를 번갈아 보여준다.
    this.time.addEvent({
      delay: 700, loop: true,
      callback: () => icon.setText(icon.text === '📜' ? '🗞️' : '📜'),
    });

    // 모닥불 자체를 눌러도 열린다(아이콘이 작아서 놓치지 않게).
    const hit = this.add.rectangle(x, y - 6, 56, 56).setFillStyle(0xffffff, 0.001).setDepth(1200);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => { if (!state.uiOpen) openRetro(); });

    // 클릭 안내(반짝반짝). 쪽지 아이콘 바로 위 — 사람들이 앉는 아래쪽을 가리지 않는다.
    const hint = this.add
      .text(x, y - TILE * 2.65, '📜 눌러서 롤링페이퍼 쓰기', {
        fontSize: '11px', fontStyle: 'bold', color: '#4a2410',
        backgroundColor: '#ffe9a8ee', padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(600);
    this.tweens.add({ targets: hint, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });
  }
}
