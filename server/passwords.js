// =====================================================================
// passwords.js — 비밀번호 해싱/검증 (Node 내장 crypto.scrypt, 의존성 없음)
// 저장 형식: "scrypt$<salt(hex)>$<hash(hex)>"
// 공개 서버로 호스팅할 때 평문 저장을 막기 위한 최소 보호.
// =====================================================================

const crypto = require('crypto');

// scrypt 파라미터(메모리·연산 비용). N=16384 → 약 16MB, 로그인당 수십 ms 수준.
const N = 16384, r = 8, p = 1, KEYLEN = 32;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, KEYLEN, { N, r, p });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

// 반환: true(일치) | false(불일치) | 'legacy'(구 평문과 일치 → 상위에서 재해시 권장)
function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored) return false;
  if (!stored.startsWith('scrypt$')) {
    // 해싱 도입 이전의 평문 비밀번호(구 DB) 호환.
    return String(plain) === String(stored) ? 'legacy' : false;
  }
  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(plain), salt, expected.length, { N, r, p });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

module.exports = { hashPassword, verifyPassword, isHashed };
