#!/usr/bin/env python3
"""Builds nexus-ai.zip (source only: no node_modules, virtualenvs, caches, secrets or databases)."""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "nexus-ai.zip"
SKIP_DIRS = {"node_modules", ".venv", "__pycache__", ".pytest_cache", "dist", ".git", "coverage", ".mypy_cache", ".vite"}
SKIP_NAMES = {".env", ".DS_Store", "nexus-ai.zip"}
SKIP_SUFFIX = {".pyc", ".db", ".db-wal", ".db-shm", ".log", ".zip"}
EXEC = {"start.sh"}


def included(p: Path) -> bool:
    rel = p.relative_to(ROOT)
    if any(part in SKIP_DIRS for part in rel.parts):
        return False
    if p.name in SKIP_NAMES or (p.name.startswith(".env.") and p.name != ".env.example"):
        return False
    if p.suffix in SKIP_SUFFIX:
        return False
    if rel.parts[0] == "data" and p.name != ".gitkeep":
        return False
    return p.is_file()


def main() -> int:
    files = sorted(p for p in ROOT.rglob("*") if included(p))
    if OUT.exists():
        OUT.unlink()
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for p in files:
            info = zipfile.ZipInfo.from_file(p, Path("nexus-ai") / p.relative_to(ROOT))
            info.compress_type = zipfile.ZIP_DEFLATED
            if p.name in EXEC or p.suffix == ".sh":
                info.external_attr = (0o755 & 0xFFFF) << 16
            z.writestr(info, p.read_bytes())
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KiB, {len(files)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
