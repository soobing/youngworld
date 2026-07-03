// =====================================================================
// index.js — 서버 시작점
// Express 로 public/ 정적 파일을 서빙하고, 같은 서버에 Socket.io 를 붙인다.
// 클라이언트를 같은 서버에서 서빙하므로 CORS 설정이 필요 없다(same-origin).
// =====================================================================

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { Sessions } = require('./db'); // DB 열기 + 스키마 생성(첫 실행 시 테이블 만듦)
const { ensureSeed } = require('./seed');
const { mountAuthRoutes } = require('./auth');
const { setup: setupSockets } = require('./socket');

// 첫 실행이면 초기 아바타 7명 + 맵/강의자료를 넣는다(이미 있으면 무시).
ensureSeed();
Sessions.purgeExpired(); // 만료된 로그인 세션 정리

const app = express();
app.use(express.json());

// 로그인/비밀번호 HTTP API (/api/...)
mountAuthRoutes(app);

// 정적 파일: public/ 을 웹 루트로.
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const io = new Server(server);
setupSockets(io);

// 0.0.0.0 으로 열어야 같은 Wi-Fi 의 다른 노트북에서 접속할 수 있다.
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('=================================================');
  console.log('  영월드 서버 시작!');
  console.log(`  내 컴퓨터:   http://localhost:${PORT}`);
  console.log('  같은 Wi-Fi 의 다른 기기: http://<내 IP>:' + PORT);
  console.log('  (내 IP 확인 - mac:  ipconfig getifaddr en0)');
  console.log('=================================================');
});
