#!/usr/bin/env python3
"""Open only Avid TURN traffic, without reloading CSF or touching Docker chains."""
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


def rule_specs(address, uid):
    # UID follows the real host process, including Docker user-namespace mapping.
    if uid <= 0:
        raise ValueError("TURN must run as a non-root user")
    incoming = ["-d", address]
    owner = ["-m", "owner", "--uid-owner", str(uid)]
    live = [
        ("INPUT", ["-p", "tcp", *incoming, "--dport", "3478"]),
        ("INPUT", ["-p", "udp", *incoming, "-m", "multiport", "--dports", "3478,49160:49200"]),
        ("OUTPUT", ["-p", "udp", "--sport", "3478", *owner]),
        ("OUTPUT", ["-p", "udp", "--sport", "49160:49200", *owner]),
    ]
    live = [(chain, args + ["-m", "comment", "--comment", "avid-turn-media", "-j", "ACCEPT"])
            for chain, args in live]
    persistent = [
        f"tcp|in|d=3478|d={address}",
        f"udp|in|d=3478,49160_49200|d={address}",
        f"udp|out|s=3478||u={uid}",
        f"udp|out|s=49160_49200||u={uid}",
    ]
    return live, persistent


def install_rules(binary, rules, runner=subprocess.run):
    added = []
    try:
        for chain, args in rules:
            check = runner([binary, "-w", "10", "-C", chain, *args], capture_output=True)
            if check.returncode == 0:
                continue
            runner([binary, "-w", "10", "-I", chain, "1", *args], check=True, capture_output=True)
            added.append((chain, args))
    except Exception:
        remove_rules(binary, added, runner)
        raise
    return added


def remove_rules(binary, rules, runner=subprocess.run):
    for chain, args in reversed(rules):
        runner([binary, "-w", "10", "-D", chain, *args], capture_output=True)


def configure():
    if os.geteuid() != 0:
        raise RuntimeError("Run as root on the VPS")
    config = Path(__file__).resolve().parent / "private" / "turnserver.conf"
    match = re.search(r"(?m)^listening-ip=([^\r\n]+)", config.read_text())
    if not match:
        raise RuntimeError("TURN listening-ip is missing")
    address = ipaddress.IPv4Address(match[1].strip())
    if not address.is_global:
        raise RuntimeError("Expected the public IPv4 configured by TURN setup")
    container = json.loads(subprocess.check_output(
        ["docker", "inspect", "avid-turn-turn-1"], text=True))[0]
    if not container["State"]["Running"] or container["HostConfig"]["NetworkMode"] != "host":
        raise RuntimeError("Avid TURN must be running with host networking first")
    uid = os.stat(f'/proc/{int(container["State"]["Pid"])}').st_uid
    live, persistent = rule_specs(str(address), uid)
    csf = Path("/etc/csf/csf.conf").read_text()
    executable = re.search(r'(?m)^IPTABLES\s*=\s*"([^"]+)"', csf)
    if not executable or not Path(executable[1]).is_file():
        raise RuntimeError("Cannot locate CSF's configured iptables executable")
    binary = executable[1]
    allow = Path("/etc/csf/csf.allow")
    before = allow.read_text()
    missing = [rule for rule in persistent if rule not in before.splitlines()]
    for chain in ("INPUT", "OUTPUT"):
        subprocess.run([binary, "-w", "10", "-S", chain], check=True, capture_output=True)
    backup_dir = Path(tempfile.mkdtemp(prefix="avid-turn-csf-", dir="/root"))
    backup = backup_dir / "csf.allow"
    shutil.copy2(allow, backup)
    backup.chmod(0o600)
    added = install_rules(binary, live)
    try:
        if missing:
            # In-place write preserves CSF file ownership and permissions.
            allow.write_text(before.rstrip("\n") + "\n\n# Avid TURN media: scoped ports and process UID\n"
                             + "\n".join(missing) + "\n")
    except Exception:
        allow.write_text(before)
        remove_rules(binary, added)
        raise
    print(f"OK: TURN IPv4 {address}, host UID {uid}; {len(added)} live rules added.")
    print(f"CSF allow rules saved. Backup: {backup}")
    print("No CSF reload, Docker restart, or existing rule deletion was performed.")
    print("Provider firewall must also allow TCP/UDP 3478 and UDP 49160-49200.")


if __name__ == "__main__":
    try:
        configure()
    except Exception as error:
        raise SystemExit(f"TURN firewall setup failed: {error}")
