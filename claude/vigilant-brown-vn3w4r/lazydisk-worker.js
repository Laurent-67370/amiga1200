/* Lecteur des disques durs lus sur place (voir wasm-amiberry/lazy_disk.cpp).
   Reçoit les fichiers choisis (File) et la mémoire du cœur, puis sert ses demandes : le cœur dépose une demande
   dans sa mémoire partagée et attend ; ce fil lit le morceau voulu dans le fichier, de façon synchrone
   (FileReaderSync, permis dans un worker), le recopie dans la zone d'échange et réveille le cœur. */
let files = [], i32 = null, u8 = null, req = 0, buf = 0;
const reader = new FileReaderSync();

onmessage = e => {
  const d = e.data;
  if (d.files) files = d.files;
  if (d.memory) {
    i32 = new Int32Array(d.memory); u8 = new Uint8Array(d.memory); req = d.req >> 2; buf = d.buf;
    serve();
  }
};

function serve() {
  for (;;) {
    /* Attente bornée : entre deux attentes, le fil reprend la main et reçoit les messages de la page */
    if (Atomics.wait(i32, req, 0, 50) === "timed-out") { setTimeout(serve, 0); return; }
    if (Atomics.load(i32, req) !== 1) continue;
    const op = i32[req + 1], f = files[i32[req + 2]], len = i32[req + 3];
    const off = (i32[req + 5] >>> 0) * 4294967296 + (i32[req + 4] >>> 0);
    let res = -1;
    try {
      if (f && op === 1) { i32[req + 4] = f.size % 4294967296 | 0; i32[req + 5] = Math.floor(f.size / 4294967296); res = 0; }
      else if (f && op === 0) {
        const data = new Uint8Array(reader.readAsArrayBuffer(f.slice(off, off + len)));
        u8.set(data, buf); res = data.length;
      }
    } catch (x) { console.warn("disque sur place : lecture impossible", x); }
    i32[req + 6] = res;
    Atomics.store(i32, req, 2);
    Atomics.notify(i32, req);
  }
}
