#!/usr/bin/env python3
"""Construit sae/index.html : l'ancienne version, un seul fichier autonome (cœur SAE minifié + ROM AROS intégrées).
La version principale (cœur PUAE) est construite par wasm/build.sh.

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
page = page.replace("<title>Amiga 1200</title>", "<title>Amiga 1200 · SAE</title>", 1)
note = "Vos fichiers restent dans ce navigateur (stockage local) et ne sont envoyés nulle part."
assert page.count(note) == 1
page = page.replace(note, note + '\n    <br>Ancienne version, conservée pour comparer. <a href="../">Revenir à la version principale</a> (cœur PUAE, plus fidèle).')
out = ROOT / "sae" / "index.html"; out.parent.mkdir(exist_ok=True)
out.write_text(page, encoding="utf-8")
print(f"sae/index.html : {len(page.encode()) / 1048576:.2f} Mo")
