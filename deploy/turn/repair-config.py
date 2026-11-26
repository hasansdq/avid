#!/usr/bin/env python3
"""Idempotent repair of generated Coturn config; retains the existing secret and owner."""
from pathlib import Path
import re
import shutil
import time


def repair(path: Path) -> bool:
    before = path.read_text()
    after = re.sub(r"(?m)^[ \t]*(?:no-cli|no-dtls)[ \t]*(?:=[^\n]*)?\r?$\n?", "", before)
    if after == before:
        return False
    backup = path.with_name(f"{path.name}.before-418-{time.time_ns()}")
    shutil.copy2(path, backup)
    backup.chmod(0o600)
    # Write in place: a root-owned replacement would be unreadable by Coturn UID 65534.
    path.write_text(after)
    return True


if __name__ == "__main__":
    config = Path(__file__).resolve().parent / "private" / "turnserver.conf"
    if not config.is_file():
        raise SystemExit("TURN config not found; run setup first.")
    changed = repair(config)
    print("Coturn config repaired; secret and ownership preserved." if changed else "Coturn config already compatible.")
