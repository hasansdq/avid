#!/usr/bin/env python3
"""
daemon-launch.py — اجرای دائمی یک فرمان با double-fork daemonization

فرزندهای معمولیِ shell ابزار Bash پس از پایان هر فرمان کشته می‌شوند؛
اما فرایندی که با fork دوم یتیم شود و sid/pgid جدید بگیرد زنده می‌ماند.

usage: daemon-launch.py <cwd> <logfile> <command> [args...]
"""
import os
import sys


def main() -> None:
    if len(sys.argv) < 4:
        sys.stderr.write(__doc__)
        sys.exit(2)

    cwd, logfile, command, args = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[3:]

    # — fork اول: والد فوراً خارج می‌شود (فراخواننده بلاک نمی‌ماند) —
    if os.fork() > 0:
        sys.exit(0)

    # — نشست و گروه فرایند جدید —
    os.setsid()

    # — fork دوم: یتیم شدن فرزند و الحاق به init —
    if os.fork() > 0:
        sys.exit(0)

    # — بازهدایت stdio: خروجی به فایل لاگ، ورودی از /dev/null —
    log = open(logfile, "ab", buffering=0)
    os.dup2(log.fileno(), 1)
    os.dup2(log.fileno(), 2)
    devnull = os.open("/dev/null", os.O_RDONLY)
    os.dup2(devnull, 0)

    os.chdir(cwd)
    os.execvp(command, args)


if __name__ == "__main__":
    main()
