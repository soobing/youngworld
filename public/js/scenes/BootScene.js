// =====================================================================
// BootScene — 게임 시작 시 딱 한 번 실행.
// 외부 이미지 없이 필요한 그림(지형 타일·아바타·장식)을 코드로 "그려서" 텍스처로 만든다.
// 이번엔 단색이 아니라 2px 픽셀 노이즈로 결·물결·자갈을 넣어 더 섬세하게 표현.
// (학생이 색·픽셀 숫자만 바꿔도 바로 반영됨 → 배우기 좋음)
// =====================================================================

import { state } from '../state.js';

export const TILE = 32; // 한 칸 픽셀 크기(좌표 단위)

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    const R = (n) => Math.floor(Math.random() * n); // 0..n-1

    // 32칸을 2px 격자로 보고 무작위로 점을 찍는 헬퍼(픽셀 노이즈).
    const speck = (key, base, layers) => {
      g.clear();
      g.fillStyle(base, 1);
      g.fillRect(0, 0, TILE, TILE);
      for (const L of layers) {
        g.fillStyle(L.c, L.a ?? 1);
        for (let i = 0; i < L.n; i++) g.fillRect(R(16) * 2, R(16) * 2, 2, 2);
      }
      g.generateTexture(key, TILE, TILE);
    };

    // 0) 흰색 기본 타일(틴트용/보이지 않는 충돌존용) — 기존 호환.
    g.clear(); g.fillStyle(0xffffff, 1); g.fillRect(0, 0, TILE, TILE); g.generateTexture('tile', TILE, TILE);

    // 1) 잔디 3종(결 표현).
    speck('grass0', 0x6fb04e, [{ c: 0x7cc05a, n: 26 }, { c: 0x5f9a41, n: 18, a: .9 }, { c: 0x88c766, n: 10, a: .8 }]);
    speck('grass1', 0x67a646, [{ c: 0x79ba58, n: 24 }, { c: 0x568c3c, n: 16, a: .9 }, { c: 0x8ecb66, n: 8, a: .7 }]);
    speck('grass2', 0x77b857, [{ c: 0x8ecb66, n: 22 }, { c: 0x63a047, n: 16, a: .9 }]);

    // 2) 물(가로 물결 + 반짝임).
    g.clear(); g.fillStyle(0x4aa3df, 1); g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x6bb8e8, 0.9);
    for (const y of [5, 13, 21, 27]) { g.fillRect(R(6), y, 10, 2); g.fillRect(16 + R(6), y + 2, 9, 2); }
    g.fillStyle(0x3f93cc, 0.7); for (let i = 0; i < 10; i++) g.fillRect(R(16) * 2, R(16) * 2, 2, 2);
    g.fillStyle(0xbfeaf7, 0.8); for (let i = 0; i < 5; i++) g.fillRect(R(16) * 2, R(16) * 2, 2, 2);
    g.generateTexture('water', TILE, TILE);

    // 3) 흙길 / 등산로 / 모래.
    speck('dirt', 0xc39a6b, [{ c: 0xa97c4e, n: 24, a: .9 }, { c: 0xd8b488, n: 14, a: .8 }]);
    speck('trail', 0xd8c49a, [{ c: 0xb89a6a, n: 22, a: .9 }, { c: 0xefe0bf, n: 12, a: .8 }]);
    speck('sand', 0xecdcac, [{ c: 0xd9c489, n: 18, a: .8 }, { c: 0xf6ead0, n: 12, a: .7 }]);

    // 4) 산(짙은 숲 초록) 2종 — 들판보다 확실히 진하게, 탁하지 않게.
    speck('mtn0', 0x2c7838, [{ c: 0x3a8c46, n: 26 }, { c: 0x1f5e2c, n: 18, a: .9 }, { c: 0x49a251, n: 8, a: .6 }]);
    speck('mtn1', 0x256c30, [{ c: 0x318040, n: 24 }, { c: 0x184e23, n: 16, a: .9 }, { c: 0x3f944a, n: 6, a: .6 }]);

    // 5) 나무다리(세로 널).
    g.clear(); g.fillStyle(0xb98a53, 1); g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(0x946b3c, 1); for (let x = 0; x < TILE; x += 8) g.fillRect(x, 0, 2, TILE);
    g.fillStyle(0xa87c47, 1); g.fillRect(0, 14, TILE, 2);
    g.generateTexture('bridge', TILE, TILE);

    // 6) 아바타(동그란 몸통) → 흰색으로 만들고 각자 색으로 tint.
    g.clear();
    g.fillStyle(0x000000, 0.15); g.fillEllipse(14, 26, 22, 8);
    g.fillStyle(0xffffff, 1); g.fillCircle(14, 14, 12);
    g.lineStyle(2, 0x333333, 1); g.strokeCircle(14, 14, 12);
    g.generateTexture('avatar', 28, 30);

    // 7) 나무 — 잎을 여러 겹 작은 덩어리로(더 촘촘하게).
    g.clear();
    g.fillStyle(0x000000, 0.16); g.fillEllipse(16, 40, 22, 7);
    g.fillStyle(0x7a5230, 1); g.fillRect(13, 27, 6, 13);
    g.fillStyle(0x6b4626, 1); g.fillRect(13, 27, 2, 13);
    g.fillStyle(0x35702f, 1); g.fillCircle(16, 20, 13);
    g.fillStyle(0x3f7d38, 1); g.fillCircle(10, 18, 8); g.fillCircle(22, 18, 8); g.fillCircle(16, 12, 9);
    g.fillStyle(0x4e9a4a, 1); g.fillCircle(12, 14, 6); g.fillCircle(20, 15, 6);
    g.fillStyle(0x62b356, 1); g.fillCircle(10, 11, 3); g.fillCircle(18, 10, 3);
    g.generateTexture('tree', 32, 46);

    // 8) 꽃 — 흰 꽃잎 + 노란 중심(각 꽃마다 색으로 tint).
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillRect(4, 1, 3, 3); g.fillRect(1, 4, 3, 3); g.fillRect(7, 4, 3, 3); g.fillRect(4, 7, 3, 3);
    g.fillStyle(0xffd24a, 1); g.fillRect(4, 4, 3, 3);
    g.generateTexture('flower', 11, 11);

    // 9) 바위.
    g.clear();
    g.fillStyle(0x000000, 0.15); g.fillEllipse(12, 15, 16, 4);
    g.fillStyle(0xa99483, 1); g.fillCircle(12, 10, 8);
    g.fillStyle(0x8c7666, 1); g.fillCircle(15, 12, 5);
    g.fillStyle(0xc4b3a3, 1); g.fillCircle(9, 8, 2);
    g.generateTexture('rock', 24, 20);

    // 10) 산 봉우리 아이콘 — 산 영역보다 살짝 진한 초록 봉우리 + 연한 초록 꼭대기(눈 없음).
    g.clear();
    g.fillStyle(0x000000, 0.12); g.fillEllipse(16, 30, 26, 5);
    g.fillStyle(0x184f24, 1); g.fillTriangle(16, 3, 1, 30, 31, 30);   // 왼쪽(짙은 초록)
    g.fillStyle(0x226a2f, 1); g.fillTriangle(16, 3, 16, 30, 31, 30);  // 오른쪽(조금 밝은 초록)
    g.fillStyle(0x123f1b, 0.5); g.fillRect(12, 18, 2, 2); g.fillRect(18, 22, 2, 2); g.fillRect(9, 24, 2, 2);
    g.fillStyle(0x8ed47c, 1); g.fillTriangle(16, 3, 10, 15, 22, 15);  // 연한 초록 꼭대기
    g.fillStyle(0x7cc96a, 1); g.fillTriangle(16, 3, 16, 15, 22, 15);
    g.generateTexture('mountain', 32, 34);

    // 11) 교실 마루바닥 — 따뜻한 파스텔 우드 톤 + 널 결(가로줄)로 나무마루 느낌.
    g.clear(); g.fillStyle(0xf3d9b1, 1); g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(0xe8c090, 0.9); for (let i = 0; i < 16; i++) g.fillRect(R(16) * 2, R(16) * 2, 2, 2);
    g.fillStyle(0xffe9c7, 0.8); for (let i = 0; i < 10; i++) g.fillRect(R(16) * 2, R(16) * 2, 2, 2);
    g.fillStyle(0xd9a86a, 0.5); g.fillRect(0, 10, TILE, 1); g.fillRect(0, 21, TILE, 1);
    g.generateTexture('classfloor', TILE, TILE);

    // 12) 갤러리 러그 바닥 — 전시 구역을 표시하는 연한 세이지(민트) 러그(테두리 있음).
    g.clear(); g.fillStyle(0xd7e8d2, 1); g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(0xbcd9b6, 0.9); for (let i = 0; i < 14; i++) g.fillRect(R(16) * 2, R(16) * 2, 2, 2);
    g.fillStyle(0xffffff, 0.55);
    g.fillRect(2, 2, TILE - 4, 2); g.fillRect(2, TILE - 4, TILE - 4, 2);
    g.fillRect(2, 2, 2, TILE - 4); g.fillRect(TILE - 4, 2, 2, TILE - 4);
    g.generateTexture('classrug', TILE, TILE);

    // 13) 교실 책상(위에서 본 모습) — 나무 상판 + 다리(모서리) + 책/연필 소품.
    g.clear();
    g.fillStyle(0x000000, 0.12); g.fillRect(3, 3, 26, 26);
    g.fillStyle(0x8a5a34, 1); g.fillRect(2, 2, 28, 26);   // 테두리(짙은 나무)
    g.fillStyle(0xcaa472, 1); g.fillRect(4, 4, 24, 22);   // 상판(밝은 나무)
    g.fillStyle(0xb5835a, 0.7); g.fillRect(4, 8, 24, 1); g.fillRect(4, 16, 24, 1); // 나뭇결
    g.fillStyle(0x4a4a4a, 1);
    g.fillRect(2, 2, 3, 3); g.fillRect(27, 2, 3, 3); g.fillRect(2, 25, 3, 3); g.fillRect(27, 25, 3, 3); // 다리
    g.fillStyle(0x4a7bd1, 1); g.fillRect(6, 6, 7, 5);     // 책
    g.fillStyle(0xffffff, 1); g.fillRect(7, 7, 5, 3);
    g.fillStyle(0xffd24a, 1); g.fillRect(20, 18, 5, 1);   // 연필
    g.generateTexture('desk', TILE, TILE);

    // 14) 교실 의자(위에서 본 모습) — 등받이는 책상(위쪽)을 향한다.
    g.clear();
    g.fillStyle(0x000000, 0.12); g.fillEllipse(16, 22, 18, 6);
    g.fillStyle(0x7f5539, 1); g.fillRect(9, 6, 14, 4);    // 등받이
    g.fillStyle(0x9c6b45, 1); g.fillRect(8, 12, 16, 12);  // 좌석
    g.fillStyle(0x6b4a30, 1); g.fillRect(9, 22, 2, 4); g.fillRect(21, 22, 2, 4); // 다리
    g.generateTexture('chair', TILE, TILE);

    // 15) 교실 책장 — 나무 틀 + 2단 선반에 알록달록 책들.
    g.clear();
    g.fillStyle(0x000000, 0.14); g.fillRect(3, 44, 42, 6);        // 바닥 그림자
    g.fillStyle(0x7a5230, 1); g.fillRect(2, 2, 44, 46);           // 나무 틀(짙은)
    g.fillStyle(0x9c6b45, 1); g.fillRect(5, 5, 38, 40);           // 안쪽(밝은 나무)
    g.fillStyle(0x6b4a30, 1); g.fillRect(5, 23, 38, 3);           // 가운데 선반
    const books = [0xe8590c, 0x1c7ed6, 0x2f9e44, 0xf59f00, 0x9c36b5, 0xe64980, 0x0ca678];
    const shelf = (sy) => {
      let x = 7;
      while (x < 41) {
        const w = 3 + R(3);                 // 책 두께 3~5
        if (x + w > 41) break;
        g.fillStyle(books[R(books.length)], 1);
        g.fillRect(x, sy, w, 15);
        g.fillStyle(0xffffff, 0.25); g.fillRect(x, sy, w, 2); // 상단 하이라이트
        x += w + 1;
      }
    };
    shelf(7); shelf(28);
    g.generateTexture('bookshelf', 48, 50);

    g.destroy();

    // 서버가 알려준 마지막 씬으로 시작(없으면 island).
    // (환영 애니메이션은 로그인 전에 HTML 인트로로 먼저 보여준다)
    const start = state.scene === 'classroom' ? 'ClassroomScene' : 'IslandScene';
    this.scene.start(start);
  }
}
