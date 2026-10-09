#!/usr/bin/env python3
"""Construit index.html : un seul fichier autonome (cœur SAE minifié + ROM AROS intégrées).

Prérequis : Python 3 et Node.js (pour terser, récupéré via npx).
Usage : python3 build.py
"""
import base64, gzip, subprocess, pathlib

ROOT = pathlib.Path(__file__).parent
ORDER = ["prototypes", "utils", "dms", "config", "roms", "memory", "autoconf", "expansion",
         "events", "gayle", "ide", "filesys", "hardfile", "dongle", "input", "serpar", "custom",
         "blitter", "copper", "playfield", "video", "audio", "cia", "disk", "rtc", "m68k", "cpu", "amiga"]

build = ROOT / "build"; build.mkdir(exist_ok=True)
core = "\n".join((ROOT / "vendor/sae" / f"{n}.js").read_text(encoding="utf-8") for n in ORDER)
(build / "sae.js").write_text(core, encoding="utf-8")
subprocess.run(["npx", "--yes", "terser@5", str(build / "sae.js"),
                "-c", "passes=1,unsafe=false,keep_fargs=true,keep_fnames=true",
                "-m", "--comments", "false", "-o", str(build / "sae.min.js")], check=True)
core_min = (build / "sae.min.js").read_text(encoding="utf-8")
assert "</script" not in core_min.lower()

def gz64(path):
    return base64.b64encode(gzip.compress((ROOT / path).read_bytes(), 9, mtime=0)).decode()

page = (ROOT / "src/template.html").read_text(encoding="utf-8")
page = page.replace("/*__SAE_CORE__*/", core_min)
page = page.replace("__AROS_ROM__", gz64("vendor/aros/aros-amiga-m68k-rom.bin"))
page = page.replace("__AROS_EXT__", gz64("vendor/aros/aros-amiga-m68k-ext.bin"))
(ROOT / "index.html").write_text(page, encoding="utf-8")
print(f"index.html : {len(page.encode()) / 1048576:.2f} Mo")
