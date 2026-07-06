// =====================================================================
// intro.js — 페이지가 열리면 "가장 먼저" 뜨는 환영 애니메이션(로그인보다 앞).
// 클릭하거나 아무 키나 누르면 사라지고 로그인 흐름으로 넘어간다.
// 배경엔 캔버스로 그린 픽셀 봉래산 풍경(게임과 같은 픽셀 느낌).
// =====================================================================

export function showIntro(onDone) {
  const el = document.getElementById('intro-screen');
  if (!el) { onDone && onDone(); return; }
  el.classList.remove('hidden');

  drawPixelScenery(); // 픽셀 산/나무/땅 그리기

  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', go);
    el.removeEventListener('click', go);
    el.classList.add('intro-out');
    setTimeout(() => { el.classList.add('hidden'); onDone && onDone(); }, 380);
  };

  // 화면이 그려진 뒤 입력을 받도록 살짝 지연(실수 클릭 방지).
  setTimeout(() => {
    window.addEventListener('keydown', go);
    el.addEventListener('click', go);
  }, 300);
}

// 캔버스에 픽셀 풍경(봉래산 + 숲 + 땅)을 그린다. 8px 블록 단위라 큼직한 픽셀.
function drawPixelScenery() {
  const cv = document.getElementById('intro-canvas');
  if (!cv) return;
  const W = cv.clientWidth || window.innerWidth;
  const H = cv.clientHeight || window.innerHeight;
  cv.width = W;
  cv.height = H;
  const x = cv.getContext('2d');
  x.imageSmoothingEnabled = false;

  const B = 8;                       // 픽셀 블록 크기(클수록 더 도트같음)
  const snap = (v) => Math.round(v / B) * B;
  const groundY = snap(H * 0.72);    // 잔디 땅 시작 높이

  // ── 계단식 픽셀 산(봉래산) ──
  const mountain = (cx, w, h, dark, light, cap) => {
    const rows = Math.max(1, Math.floor(h / B));
    for (let i = 0; i < rows; i++) {
      const ry = groundY - i * B;
      const halfW = (w / 2) * (1 - i / rows);
      const rx = snap(cx - halfW);
      const rw = snap(halfW * 2) || B;
      x.fillStyle = dark;  x.fillRect(rx, ry, rw, B);                 // 왼쪽(짙은) 면
      x.fillStyle = light; x.fillRect(snap(cx), ry, rx + rw - snap(cx), B); // 오른쪽(밝은) 면
      if (i >= rows - 2) { x.fillStyle = cap; x.fillRect(snap(cx) - B, ry, B * 2, B); } // 연한 초록 꼭대기
    }
  };
  mountain(W * 0.28, W * 0.5, H * 0.40, '#245c2a', '#2f7a3a', '#8ed47c');
  mountain(W * 0.85, W * 0.42, H * 0.34, '#245c2a', '#2f7a3a', '#8ed47c');
  mountain(W * 0.57, W * 0.62, H * 0.52, '#1f5327', '#2c7838', '#7cc96a'); // 가장 큰 봉래산 앞쪽

  // ── 잔디 땅(줄무늬 픽셀) ──
  const riverY = snap(H * 0.88); // 이 아래는 강
  for (let gy = groundY; gy < riverY; gy += B) {
    x.fillStyle = ((gy - groundY) / B) % 2 ? '#5f9a41' : '#6fb04e';
    x.fillRect(0, gy, W, B);
  }

  // ── 강(맨 아래 픽셀 물) ──
  x.fillStyle = '#3f6b22'; x.fillRect(0, riverY - B, W, B); // 강둑 픽셀 라인
  for (let wy = riverY; wy < H; wy += B) {
    x.fillStyle = ((wy - riverY) / B) % 2 ? '#3f93cc' : '#4aa3df';
    x.fillRect(0, wy, W, B);
  }
  x.fillStyle = '#8fd4ec'; // 물결 반짝임
  for (let i = 0; i < Math.floor(W / 44); i++) {
    x.fillRect(snap(Math.random() * W), snap(riverY + Math.random() * (H - riverY)), B * 2, B);
  }

  // ── 픽셀 나무 몇 그루 ──
  const tree = (tx) => {
    const t = snap(tx);
    x.fillStyle = '#5a3a1e'; x.fillRect(t + 8, groundY - 8, 8, 12);          // 줄기
    x.fillStyle = '#245c2a'; x.fillRect(t, groundY - 26, 24, 18);            // 잎(짙음)
    x.fillStyle = '#3f8c46'; x.fillRect(t + 4, groundY - 34, 16, 12);        // 잎(밝음)
    x.fillStyle = '#8ed47c'; x.fillRect(t + 8, groundY - 38, 8, 6);          // 잎(연함)
  };
  const gap = Math.max(72, Math.floor(W / 9));
  for (let tx = 20; tx < W - 30; tx += gap) tree(tx + ((tx / gap) % 2 ? 24 : 0));
}
