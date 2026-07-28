// =====================================================================
// music.js — 「나의 꿈은」(안해찬) 배경음악을 직접 합성한다.
//
//   node public/works/ahn/dream/music.js
//   → 같은 폴더에 bgm.wav 가 생긴다. build.sh 가 쓰는 mp3 로 바꾸려면:
//     ffmpeg -y -i bgm.wav -c:a libmp3lame -b:a 192k bgm.mp3
//
// 왜 기성곡을 안 쓰고 만드나:
//   이 영상은 컷 하나가 정확히 5초다. 기성곡을 갖다 붙이면 컷3의 "첫 박"
//   같은 결정적인 순간과 음악의 강세가 어긋난다. 96 BPM · 4/4 로 잡으면
//   한 컷 = 정확히 2마디(2.5초 × 2)가 되므로, 컷이 바뀌는 자리에 마디 첫
//   박이 떨어진다. 외부 음원이 아니라서 라이선스 표기 문제도 없어진다.
//
//   bgm.* 는 .gitignore 대상이라 저장소에 음원 자체는 올라가지 않는다.
//   대신 이 파일이 커밋되므로, 다른 컴퓨터에서도 똑같은 음악을 다시 만들 수 있다.
//   (난수에 시드를 고정해 둔 이유 — 몇 번을 돌려도 같은 파일이 나온다)
//
// 구성 — 자기소개의 흐름(관객석 → 무대)을 그대로 따라간다
//    0~5초  컷1 객석      패드만. 드럼이 없다 — 아직 "보는 쪽"이다
//    5~10초 컷2 첫날      킥이 조심스럽게 들어온다
//   10~15초 컷3 첫 박     크래시와 함께 드럼이 전부 들어온다
//   15~20초 컷4 한국사    드럼을 덜어내고 멜로디가 생각에 잠긴다
//   20~26초 컷5 큰 무대   전부 다시, 가장 크게. 마지막은 C 로 풀린다
// =====================================================================
const fs = require('fs');
const path = require('path');

const SR = 44100;
const BPM = 96;
const BEAT = 60 / BPM; // 0.625초
const BAR = BEAT * 4; // 2.5초 = 컷 하나의 절반
const BARS = 11; // 27.5초. build.sh 가 앞 26초만 쓴다(끝이 잘리지 않게 여유)

const N = Math.ceil(BAR * BARS * SR);
const L = new Float64Array(N);
const R = new Float64Array(N);

function mix(i, l, r) {
  if (i >= 0 && i < N) {
    L[i] += l;
    R[i] += r;
  }
}

// 드럼의 노이즈 성분에 쓸 난수. 매번 같은 결과가 나오도록 시드를 고정한다.
let seed = 20260728;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
}

// ---------------------------------------------------------------- 악기
// 패드 — 코드를 깔아주는 소리. 사인파를 살짝 어긋나게(detune) 두 겹 쌓아
// 두께를 만들고, 좌우로 벌려 공간감을 준다.
function pad(t0, freqs, dur, amp) {
  const atk = 0.5;
  const rel = 0.8;
  const base = Math.round(t0 * SR);
  for (const f of freqs) {
    for (const det of [0.997, 1.003]) {
      let ph = 0;
      let ph2 = 0;
      const n = Math.ceil((dur + rel) * SR);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        ph += (2 * Math.PI * f * det) / SR;
        ph2 += (2 * Math.PI * f * det * 2) / SR;
        let env;
        if (t < atk) env = t / atk;
        else if (t < dur) env = 1;
        else env = Math.max(0, 1 - (t - dur) / rel);
        env *= env; // 각지지 않게
        const s = (Math.sin(ph) + 0.22 * Math.sin(ph2)) * env * amp;
        mix(base + i, s * (det < 1 ? 1 : 0.72), s * (det < 1 ? 0.72 : 1));
      }
    }
  }
}

// 베이스 — 뿌리음. tanh 로 살짝 물려서 작은 스피커에서도 들리게 한다.
function bass(t0, f, dur, amp) {
  let ph = 0;
  const base = Math.round(t0 * SR);
  const n = Math.ceil((dur + 0.06) * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * f) / SR;
    const tail = t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.06);
    const env = Math.min(1, t / 0.008) * Math.exp(-t * 2.1) * tail;
    const s = Math.tanh(Math.sin(ph) * 1.6) * env * amp;
    mix(base + i, s, s);
  }
}

// 킥 — 음이 순간적으로 떨어지는 사인파. 앞머리에 클릭을 섞어 존재감을 준다.
function kick(t0, amp) {
  let ph = 0;
  const base = Math.round(t0 * SR);
  const n = Math.ceil(0.36 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * (48 + 120 * Math.exp(-t * 42))) / SR;
    const s = (Math.sin(ph) * Math.exp(-t * 10.5) + Math.exp(-t * 420) * rnd() * 0.25) * amp;
    mix(base + i, s, s);
  }
}

// 스네어 — 노이즈(줄 울림) + 186Hz 몸통.
function snare(t0, amp) {
  let ph = 0;
  let prev = 0;
  const base = Math.round(t0 * SR);
  const n = Math.ceil(0.28 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * 186) / SR;
    const nz = rnd();
    const hp = nz - prev; // 차분 = 간단한 하이패스. 노이즈의 고역만 남는다
    prev = nz;
    const s = (hp * 0.55 + Math.sin(ph) * 0.35) * Math.exp(-t * 19) * amp;
    mix(base + i, s * 0.95, s);
  }
}

// 하이햇 — 아주 짧은 고역 노이즈.
function hat(t0, amp, open) {
  let prev = 0;
  const base = Math.round(t0 * SR);
  const n = Math.ceil((open ? 0.28 : 0.06) * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const nz = rnd();
    const hp = nz - prev;
    prev = nz;
    const s = hp * Math.exp(-t * (open ? 16 : 70)) * amp;
    mix(base + i, s * 0.78, s);
  }
}

// 크래시 — 길게 남는 노이즈. 좌우를 다른 난수로 만들어 넓게 퍼지게 한다.
function crash(t0, amp) {
  let p1 = 0;
  let p2 = 0;
  const base = Math.round(t0 * SR);
  const n = Math.ceil(2.2 * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = rnd();
    const b = rnd();
    const ha = a - p1;
    p1 = a;
    const hb = b - p2;
    p2 = b;
    const env = Math.exp(-t * 2.3) * Math.min(1, t / 0.004);
    mix(base + i, ha * env * amp, hb * env * amp);
  }
}

// 멜로디 — 배음을 얹은 사인파에 아주 옅은 비브라토.
function lead(t0, f, dur, amp) {
  let ph = 0;
  const rel = 0.25;
  const base = Math.round(t0 * SR);
  const n = Math.ceil((dur + rel) * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * f * (1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * t))) / SR;
    let env;
    if (t < 0.02) env = t / 0.02;
    else if (t < dur) env = 0.75 + 0.25 * Math.exp(-(t - 0.02) * 3);
    else env = Math.max(0, 1 - (t - dur) / rel) * 0.75;
    const s =
      (Math.sin(ph) + 0.42 * Math.sin(ph * 2) + 0.16 * Math.sin(ph * 3)) * env * amp;
    mix(base + i, s * 0.9, s);
  }
}

// ---------------------------------------------------------------- 편곡
// 가단조로 시작해 마지막에 다장조로 푼다(같은 음들인데 밝게 끝난다).
const CHORD = {
  Am: { notes: [220, 261.63, 329.63], root: 110 },
  F: { notes: [174.61, 220, 261.63], root: 87.31 },
  C: { notes: [261.63, 329.63, 392], root: 130.81 },
  G: { notes: [196, 246.94, 293.66], root: 98 },
};

// 마디 11개. drums 가 이 곡의 이야기다 — none → soft → full → mid → full.
const PLAN = [
  { ch: 'Am', pad: 0.055, drums: 'none' }, //  0  컷1 객석
  { ch: 'F', pad: 0.055, drums: 'air' }, //  1  컷1
  { ch: 'C', pad: 0.075, drums: 'soft' }, //  2  컷2 첫날
  { ch: 'G', pad: 0.075, drums: 'soft' }, //  3  컷2
  { ch: 'Am', pad: 0.105, drums: 'full', crash: true }, //  4  컷3 첫 박 ★
  { ch: 'F', pad: 0.105, drums: 'full' }, //  5  컷3
  { ch: 'C', pad: 0.085, drums: 'mid' }, //  6  컷4 한국사
  { ch: 'G', pad: 0.085, drums: 'mid' }, //  7  컷4
  { ch: 'F', pad: 0.125, drums: 'full', crash: true }, //  8  컷5 큰 무대
  { ch: 'G', pad: 0.125, drums: 'full' }, //  9  컷5
  { ch: 'C', pad: 0.135, drums: 'end', crash: true }, // 10  마무리
];

// 멜로디는 컷4에서 처음 나온다 — "생각하는 구간"에 사람 목소리 같은 선을 준다.
// [마디, [박, 주파수, 길이(박)] …]
const MELODY = [
  [6, [[0, 440, 1], [1, 523.25, 1], [2, 587.33, 2]]],
  [7, [[0, 659.25, 2], [2, 587.33, 1], [3, 523.25, 1]]],
  [8, [[0, 440, 1], [1, 523.25, 1], [2, 587.33, 2]]],
  [9, [[0, 587.33, 2], [2, 783.99, 2]]], // G5 — 이 곡의 가장 높은 음(22.5초)
  [10, [[0, 659.25, 4]]],
];

PLAN.forEach((barPlan, b) => {
  const t = b * BAR;
  const ch = CHORD[barPlan.ch];

  pad(t, ch.notes, BAR, barPlan.pad);
  if (barPlan.crash) crash(t, 0.34);

  const d = barPlan.drums;
  if (d === 'air') {
    hat(t + BEAT, 0.1, true);
    hat(t + BEAT * 3, 0.1, true);
  } else if (d !== 'none' && d !== 'end') {
    const loud = d === 'full';
    // 8분음표 하이햇
    for (let k = 0; k < 8; k++) {
      hat(t + k * BEAT * 0.5, (k % 2 === 0 ? 0.16 : 0.1) * (loud ? 1.25 : d === 'soft' ? 0.7 : 1));
    }
    kick(t, 0.85);
    kick(t + BEAT * 2, d === 'soft' ? 0.6 : 0.8);
    if (loud) kick(t + BEAT * 2.75, 0.55);
    if (d === 'soft') {
      snare(t + BEAT * 2, 0.3);
    } else {
      snare(t + BEAT, 0.5);
      snare(t + BEAT * 3, loud ? 0.55 : 0.45);
    }
    // 베이스
    bass(t, ch.root, BEAT * 2, 0.4);
    bass(t + BEAT * 2, ch.root, BEAT * 2, 0.36);
    if (loud) bass(t + BEAT * 3.5, ch.root, BEAT * 0.5, 0.3);
  } else if (d === 'end') {
    kick(t, 0.9);
    bass(t, ch.root, BEAT * 4, 0.42);
  }
});

MELODY.forEach(([b, notes]) => {
  for (const [beat, f, len] of notes) {
    lead(b * BAR + beat * BEAT, f, len * BEAT, 0.085);
  }
});

// ---------------------------------------------------------------- 출력
let peak = 0;
for (let i = 0; i < N; i++) {
  if (Math.abs(L[i]) > peak) peak = Math.abs(L[i]);
  if (Math.abs(R[i]) > peak) peak = Math.abs(R[i]);
}
const gain = peak > 0 ? 0.89 / peak : 1;

const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(2, 22); // 스테레오
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const l = Math.max(-1, Math.min(1, L[i] * gain));
  const r = Math.max(-1, Math.min(1, R[i] * gain));
  buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(r * 32767), 44 + i * 4 + 2);
}

const out = path.join(__dirname, 'bgm.wav');
fs.writeFileSync(out, buf);
console.log(`✅ ${out}`);
console.log(`   ${(N / SR).toFixed(1)}초 · ${BPM} BPM · 마디 ${BARS}개 · 피크 ${peak.toFixed(3)} → 0.89 정규화`);
