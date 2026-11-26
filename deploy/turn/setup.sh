#!/usr/bin/env bash
# Generates private Coturn config and app env settings; does not start services.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ "$(id -u)" = 0 ] || { echo 'Run this setup as root on the VPS.' >&2; exit 1; }
[ -f .env ] || { echo 'Existing .env is required.' >&2; exit 1; }
[ ! -e deploy/turn/private/turnserver.conf ] || {
  echo 'TURN is already configured; keep the existing secret/config.' >&2; exit 1;
}
python3 - "${1:-}" <<'PY'
import ipaddress, sys
try:
    addr = ipaddress.IPv4Address(sys.argv[1])
    assert addr.is_global
except Exception:
    sys.exit('Usage: bash deploy/turn/setup.sh PUBLIC_IPV4')
PY
# The public address must actually belong to this host (no NAT guessing).
ip -4 addr show | grep -Fq "inet $1/" || {
  echo 'Public IP is not assigned directly to this host. Configure Coturn external-ip mapping manually; see README.' >&2
  exit 1
}
# Refuse to overlap other projects such as Danyar/LiveKit.
if [ -n "$(ss -H -lntu '( sport = :3478 or sport >= :49160 and sport <= :49200 )')" ]; then
  echo 'Ports 3478 or 49160–49200 are in use. Choose a separate TURN host or unused ports; see README.' >&2
  exit 1
fi
umask 077
mkdir -p deploy/turn/private
avid_turn_secret="$(openssl rand -hex 32)"
export AVID_TURN_SETUP_SECRET="$avid_turn_secret" AVID_TURN_SETUP_IP="$1"
python3 - <<'PY'
from pathlib import Path
import os, time
secret=os.environ['AVID_TURN_SETUP_SECRET']; ip=os.environ['AVID_TURN_SETUP_IP']
conf=f'''listening-port=3478
listening-ip={ip}
relay-ip={ip}
realm=avid-turn
fingerprint
use-auth-secret
static-auth-secret={secret}
min-port=49160
max-port=49200
no-tls
no-dtls
no-cli
no-multicast-peers
no-tcp-relay
user-quota=128
total-quota=512
stale-nonce=600
log-file=stdout
simple-log
pidfile=/tmp/turnserver.pid
no-software-attribute
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=224.0.0.0-255.255.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
'''
Path('deploy/turn/private/turnserver.conf').write_text(conf)
p=Path('.env'); before=p.read_text(); backup=Path(f'/root/avid-env-before-turn-{time.time_ns()}')
backup.write_text(before); backup.chmod(0o600)
updates={
 'STREAM_TURN_URLS':f'turn:{ip}:3478?transport=udp,turn:{ip}:3478?transport=tcp',
 'STREAM_TURN_SECRET':secret, 'STREAM_TURN_TTL_SECONDS':'3600', 'STREAM_ICE_TRANSPORT_POLICY':'all',
}
lines=[line for line in before.splitlines() if line.split('=',1)[0].strip() not in updates]
p.write_text('\n'.join(lines)+'\n'+''.join(f'{k}={v}\n' for k,v in updates.items()));p.chmod(0o600)
print(f'Private TURN config created; previous .env saved to {backup}.')
PY
unset avid_turn_secret AVID_TURN_SETUP_SECRET AVID_TURN_SETUP_IP
chown 65534:65534 deploy/turn/private/turnserver.conf
chmod 600 deploy/turn/private/turnserver.conf
echo 'Open 3478 UDP/TCP and 49160–49200 UDP in the VPS/provider firewall.'
echo 'Then: docker compose -f deploy/turn/compose.yaml up -d'
echo 'Recreate the app with the normal deploy/update.sh workflow to load its new env.'
