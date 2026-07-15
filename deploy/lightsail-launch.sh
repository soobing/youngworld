#!/bin/bash
# 영월드 Lightsail 부팅 자동설치 스크립트 (Ubuntu 22.04)
# Node 20 + 빌드툴 설치 → repo clone → npm install → systemd 등록 → Caddy(HTTP 80 리버스 프록시)
set -e
exec > /var/log/youngworld-setup.log 2>&1
echo "=== youngworld setup start: $(date) ==="

export DEBIAN_FRONTEND=noninteractive
apt-get update -y

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs build-essential python3 git

# 앱 배포 (ubuntu 사용자 홈)
cd /home/ubuntu
sudo -u ubuntu git clone https://github.com/soobing/youngworld.git
cd youngworld
sudo -u ubuntu npm install --no-audit --no-fund

# systemd 서비스 (HOST=127.0.0.1, Caddy만 접근)
cp deploy/youngworld.service /etc/systemd/system/youngworld.service
systemctl daemon-reload
systemctl enable --now youngworld

# Caddy 설치
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

# 도메인이 없으므로 우선 HTTP(:80) 리버스 프록시. (도메인 붙이면 이 파일만 도메인으로 바꾸면 자동 HTTPS)
cat > /etc/caddy/Caddyfile <<'CADDY'
:80 {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
CADDY
systemctl reload caddy || systemctl restart caddy

echo "=== youngworld setup done: $(date) ==="
