/* Frontal libretro minimal pour le navigateur.
 *
 * Le cœur PUAE parle l'API libretro (pointeurs, structures, rappels). Ce fichier fait le pont
 * et n'expose à JavaScript que des fonctions simples « fe_* » : options, fichiers, une image RGBA
 * prête à afficher, un tampon de son, le clavier, la souris, les joysticks, les LED, les disquettes
 * et les sauvegardes d'état. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <stdint.h>
#include <time.h>
#include <pthread.h>
#include <unistd.h>
#include <emscripten/emscripten.h>
#include <emscripten/threading.h>
#include "libretro.h"

#define API EMSCRIPTEN_KEEPALIVE

/* ---------- options du cœur ---------- */
#define MAX_OPTS 64
static char opt_keys[MAX_OPTS][64], opt_vals[MAX_OPTS][128];
static int opt_count;
static bool opts_changed;

API void fe_set_option(const char *k, const char *v) {
  for (int i = 0; i < opt_count; i++)
    if (!strcmp(opt_keys[i], k)) { snprintf(opt_vals[i], sizeof opt_vals[i], "%s", v); opts_changed = true; return; }
  if (opt_count < MAX_OPTS) {
    snprintf(opt_keys[opt_count], 64, "%s", k); snprintf(opt_vals[opt_count], 128, "%s", v);
    opt_count++; opts_changed = true;
  }
}
static const char *get_opt(const char *k) {
  for (int i = 0; i < opt_count; i++) if (!strcmp(opt_keys[i], k)) return opt_vals[i];
  return NULL;
}

static char sys_dir[256] = "/sys", save_dir[256] = "/save";
API void fe_set_dirs(const char *sys, const char *save) {
  snprintf(sys_dir, sizeof sys_dir, "%s", sys); snprintf(save_dir, sizeof save_dir, "%s", save);
}

/* ---------- image ---------- */
static int pix_fmt = RETRO_PIXEL_FORMAT_0RGB1555;
/* Deux images : le cœur écrit l'une pendant que la page affiche l'autre (l'émulation peut tourner dans son propre fil) */
static uint8_t *vbuf[2]; static size_t vcap[2]; static unsigned vw[2], vh[2];
static volatile int vfront;
static unsigned long frame_count;

static void video_cb(const void *data, unsigned w, unsigned h, size_t pitch) {
  if (!data) return; /* image identique à la précédente */
  int b = vfront ^ 1;
  size_t need = (size_t)w * h * 4;
  if (need > vcap[b]) { vbuf[b] = realloc(vbuf[b], need); vcap[b] = need; }
  uint8_t *rgba = vbuf[b];
  uint8_t *o = rgba;
  if (pix_fmt == RETRO_PIXEL_FORMAT_XRGB8888) {
    /* XRGB → RGBA en mots de 32 bits (WebAssembly est petit-boutiste : octets R, G, B, A en mémoire) */
    uint32_t *o32 = (uint32_t *)rgba;
    for (unsigned y = 0; y < h; y++) {
      const uint32_t *s = (const uint32_t *)((const uint8_t *)data + y * pitch);
      for (unsigned x = 0; x < w; x++) { uint32_t p = s[x]; *o32++ = 0xff000000u | ((p & 0xff) << 16) | (p & 0xff00) | ((p >> 16) & 0xff); }
    }
  } else {
    for (unsigned y = 0; y < h; y++) {
      const uint16_t *s = (const uint16_t *)((const uint8_t *)data + y * pitch);
      for (unsigned x = 0; x < w; x++) {
        uint16_t p = s[x];
        *o++ = ((p >> 11) & 31) * 255 / 31; *o++ = ((p >> 5) & 63) * 255 / 63; *o++ = (p & 31) * 255 / 31; *o++ = 255;
      }
    }
  }
  vw[b] = w; vh[b] = h;
  __atomic_store_n(&vfront, b, __ATOMIC_RELEASE);
  __atomic_add_fetch(&frame_count, 1, __ATOMIC_RELEASE);
}
API uint8_t *fe_video_ptr(void) { return vbuf[vfront]; }
API unsigned fe_video_w(void) { return vw[vfront]; }
API unsigned fe_video_h(void) { return vh[vfront]; }
API unsigned long fe_frame_count(void) { return __atomic_load_n(&frame_count, __ATOMIC_ACQUIRE); }

/* ---------- son : tampon circulaire stéréo 16 bits ---------- */
#define AUD_FRAMES 32768
/* Un seul écrivain (le cœur) et un seul lecteur (la page, ou l'AudioWorklet qui lit la mémoire partagée) :
   chacun ne fait avancer que son propre index */
static int16_t aud[AUD_FRAMES * 2];
static unsigned aud_w, aud_r;
static volatile int emu_warp = 1;
static void aud_push(const int16_t *d, size_t frames) {
  if (emu_warp > 1) return; /* turbo : le son est jeté */
  unsigned w = __atomic_load_n(&aud_w, __ATOMIC_RELAXED);
  for (size_t i = 0; i < frames; i++) {
    unsigned n = (w + 1) % AUD_FRAMES;
    if (n == __atomic_load_n(&aud_r, __ATOMIC_ACQUIRE)) break; /* plein : le lecteur ne suit plus, on jette le reste */
    aud[w * 2] = d[i * 2]; aud[w * 2 + 1] = d[i * 2 + 1]; w = n;
  }
  __atomic_store_n(&aud_w, w, __ATOMIC_RELEASE);
}
static void audio_cb(int16_t l, int16_t r) { int16_t s[2] = { l, r }; aud_push(s, 1); }
static size_t audio_batch_cb(const int16_t *d, size_t frames) { aud_push(d, frames); return frames; }
/* Copie jusqu'à max trames, en flottants entrelacés, dans dst ; renvoie le nombre de trames. */
API unsigned fe_audio_read(float *dst, unsigned max) {
  unsigned n = 0, r = __atomic_load_n(&aud_r, __ATOMIC_RELAXED), w = __atomic_load_n(&aud_w, __ATOMIC_ACQUIRE);
  while (r != w && n < max) {
    if (dst) { dst[n * 2] = aud[r * 2] / 32768.0f; dst[n * 2 + 1] = aud[r * 2 + 1] / 32768.0f; }
    r = (r + 1) % AUD_FRAMES; n++;
  }
  __atomic_store_n(&aud_r, r, __ATOMIC_RELEASE);
  return n;
}
API unsigned fe_audio_available(void) { return (aud_w + AUD_FRAMES - aud_r) % AUD_FRAMES; }
/* Pour l'AudioWorklet : adresses du tampon et de ses deux index dans la mémoire partagée */
API int16_t *fe_audio_buf(void) { return aud; }
API unsigned *fe_audio_rptr(void) { return &aud_r; }
API unsigned *fe_audio_wptr(void) { return &aud_w; }
API unsigned fe_audio_frames(void) { return AUD_FRAMES; }

/* ---------- entrées ---------- */
static int mouse_acc_x, mouse_acc_y, mouse_x, mouse_y, mouse_btn;
static unsigned joy[2];
API void fe_mouse_move(int dx, int dy) { __atomic_add_fetch(&mouse_acc_x, dx, __ATOMIC_RELAXED); __atomic_add_fetch(&mouse_acc_y, dy, __ATOMIC_RELAXED); }
API void fe_mouse_buttons(int mask) { mouse_btn = mask; } /* 1 gauche, 2 droit, 4 milieu */
API void fe_joy(int port, unsigned mask) { if (port >= 0 && port < 2) joy[port] = mask; } /* bits = RETRO_DEVICE_ID_JOYPAD_* */

#ifdef FE_AMIBERRY
/* Amiberry : le clavier passe par le rappel annoncé par le cœur */
static retro_keyboard_event_t kb_cb;
API void fe_key(int down, unsigned retrok) { if (kb_cb) kb_cb(down != 0, retrok, 0, 0); }
#else
extern void retro_keyboard_event(bool down, unsigned keycode, uint32_t character, uint16_t key_modifiers);
API void fe_key(int down, unsigned retrok) { retro_keyboard_event(down != 0, retrok, 0, 0); }
#endif

static void input_poll_cb(void) {
  mouse_x = __atomic_exchange_n(&mouse_acc_x, 0, __ATOMIC_RELAXED); mouse_y = __atomic_exchange_n(&mouse_acc_y, 0, __ATOMIC_RELAXED);
}
static int16_t input_state_cb(unsigned port, unsigned device, unsigned index, unsigned id) {
  (void)index;
  if (device == RETRO_DEVICE_MOUSE && port == 0) {
    switch (id) {
      case RETRO_DEVICE_ID_MOUSE_X: return mouse_x;
      case RETRO_DEVICE_ID_MOUSE_Y: return mouse_y;
      case RETRO_DEVICE_ID_MOUSE_LEFT: return (mouse_btn & 1) != 0;
      case RETRO_DEVICE_ID_MOUSE_RIGHT: return (mouse_btn & 2) != 0;
      case RETRO_DEVICE_ID_MOUSE_MIDDLE: return (mouse_btn & 4) != 0;
    }
    return 0;
  }
  if (device == RETRO_DEVICE_JOYPAD && port < 2) {
    if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return (int16_t)joy[port];
    return (joy[port] >> id) & 1;
  }
  return 0;
}

/* ---------- MIDI (port série de l'Amiga) : deux files d'octets, vidée et remplie par la page (Web MIDI) ---------- */
#define MIDI_Q 8192
static uint8_t midi_out_q[MIDI_Q], midi_in_q[MIDI_Q];
static unsigned midi_out_w, midi_out_r, midi_in_w, midi_in_r;
static bool midi_out_on, midi_in_on;
static bool midi_input_enabled(void) { return midi_in_on; }
static bool midi_output_enabled(void) { return midi_out_on; }
static bool midi_read(uint8_t *b) {
  if (midi_in_r == midi_in_w) return false;
  *b = midi_in_q[midi_in_r]; midi_in_r = (midi_in_r + 1) % MIDI_Q; return true;
}
static bool midi_write(uint8_t b, uint32_t delta) {
  (void)delta;
  unsigned n = (midi_out_w + 1) % MIDI_Q;
  if (n == midi_out_r) return false; /* plein : la page ne vide plus la file */
  midi_out_q[midi_out_w] = b; midi_out_w = n; return true;
}
static bool midi_flush(void) { return true; }
API void fe_midi_enable(int out, int in) { midi_out_on = out != 0; midi_in_on = in != 0; }
/* Octets envoyés par l'Amiga depuis le dernier appel (max octets au plus) */
API unsigned fe_midi_out_read(uint8_t *dst, unsigned max) {
  unsigned n = 0;
  while (midi_out_r != midi_out_w && n < max) { dst[n++] = midi_out_q[midi_out_r]; midi_out_r = (midi_out_r + 1) % MIDI_Q; }
  return n;
}
/* Octets reçus d'un instrument, pour l'Amiga */
API void fe_midi_in_write(const uint8_t *src, unsigned len) {
  for (unsigned i = 0; i < len; i++) {
    unsigned n = (midi_in_w + 1) % MIDI_Q;
    if (n == midi_in_r) break;
    midi_in_q[midi_in_w] = src[i]; midi_in_w = n;
  }
}

/* ---------- LED ---------- */
static int leds[16];
static void led_cb(int led, int state) { if (led >= 0 && led < 16) leds[led] = state; }
API int fe_led(int i) { return i >= 0 && i < 16 ? leds[i] : 0; }

/* ---------- journal, horloge ---------- */
static void log_cb(enum retro_log_level level, const char *fmt, ...) {
  if (level < RETRO_LOG_WARN) return;
  char buf[512]; va_list a; va_start(a, fmt); vsnprintf(buf, sizeof buf, fmt, a); va_end(a);
  fprintf(stderr, "[cœur] %s", buf);
}
static retro_time_t usec(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (retro_time_t)t.tv_sec * 1000000 + t.tv_nsec / 1000; }
static uint64_t cpu_features(void) { return 0; }
static retro_perf_tick_t perf_counter(void) { return (retro_perf_tick_t)usec(); }
static void perf_nop(struct retro_perf_counter *c) { (void)c; }
static void perf_log(void) {}

/* ---------- disquettes ---------- */
static struct retro_disk_control_ext_callback disk;
static bool have_disk_ext;

/* ---------- environnement ---------- */
static bool environ_cb(unsigned cmd, void *data) {
  switch (cmd) {
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: *(const char **)data = sys_dir; return true;
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char **)data = save_dir; return true;
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
      int f = *(enum retro_pixel_format *)data;
      if (f == RETRO_PIXEL_FORMAT_XRGB8888 || f == RETRO_PIXEL_FORMAT_RGB565) { pix_fmt = f; return true; }
      return false;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
      struct retro_variable *v = data; const char *val = get_opt(v->key);
      if (val) { v->value = val; return true; }
      return false;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool *)data = opts_changed; opts_changed = false; return true;
    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned *)data = 0; return true;
    case RETRO_ENVIRONMENT_SET_VARIABLES: return true;
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback *)data)->log = log_cb; return true;
    case RETRO_ENVIRONMENT_GET_PERF_INTERFACE: {
      struct retro_perf_callback *c = data;
      c->get_time_usec = usec; c->get_cpu_features = cpu_features; c->get_perf_counter = perf_counter;
      c->perf_register = perf_nop; c->perf_start = perf_nop; c->perf_stop = perf_nop; c->perf_log = perf_log;
      return true;
    }
    case RETRO_ENVIRONMENT_GET_MIDI_INTERFACE: {
      struct retro_midi_interface *m = data;
      m->input_enabled = midi_input_enabled; m->output_enabled = midi_output_enabled;
      m->read = midi_read; m->write = midi_write; m->flush = midi_flush;
      return true;
    }
    case RETRO_ENVIRONMENT_GET_LED_INTERFACE: ((struct retro_led_interface *)data)->set_led_state = led_cb; return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool *)data = true; return true;
    case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME: return true;
    case RETRO_ENVIRONMENT_GET_DISK_CONTROL_INTERFACE_VERSION: *(unsigned *)data = 1; return true;
    case RETRO_ENVIRONMENT_SET_DISK_CONTROL_EXT_INTERFACE: disk = *(const struct retro_disk_control_ext_callback *)data; have_disk_ext = true; return true;
#ifdef FE_AMIBERRY
    case RETRO_ENVIRONMENT_SET_KEYBOARD_CALLBACK: kb_cb = ((const struct retro_keyboard_callback *)data)->callback; return true;
#else
    case RETRO_ENVIRONMENT_SET_KEYBOARD_CALLBACK: return true; /* on appelle retro_keyboard_event directement */
#endif
    case RETRO_ENVIRONMENT_GET_LANGUAGE: *(unsigned *)data = RETRO_LANGUAGE_FRENCH; return true;
    case RETRO_ENVIRONMENT_SET_GEOMETRY:
    case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO:
    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
    case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
    case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL:
    case RETRO_ENVIRONMENT_SET_MESSAGE:
    case RETRO_ENVIRONMENT_SET_MESSAGE_EXT:
      return true;
    default: return false;
  }
}

/* ---------- démarrage et boucle ---------- */
static struct retro_system_av_info av;
static bool loaded;

/* path = NULL : démarrage sans disquette (Workbench sur disque dur, ou écran d'insertion). */
API int fe_start(const char *path) {
  retro_set_environment(environ_cb);
  retro_set_video_refresh(video_cb);
  retro_set_audio_sample(audio_cb);
  retro_set_audio_sample_batch(audio_batch_cb);
  retro_set_input_poll(input_poll_cb);
  retro_set_input_state(input_state_cb);
  retro_init();
  struct retro_game_info info = { path, NULL, 0, NULL };
  loaded = retro_load_game(path && *path ? &info : NULL);
  if (!loaded) return 0;
  retro_get_system_av_info(&av);
#ifdef FE_AMIBERRY
  /* Amiberry : la souris du port 0 et la manette 0 vont au port souris et au port joystick de l'Amiga */
  retro_set_controller_port_device(0, RETRO_DEVICE_MOUSE);
#else
  retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
#endif
  retro_set_controller_port_device(1, RETRO_DEVICE_JOYPAD);
  return 1;
}
API void fe_run(void) { if (loaded) retro_run(); }
static volatile int emu_running_thread;
static int emu_cmd(int code, const void *p, unsigned n);
API void fe_reset(void) { if (!loaded) return; if (emu_running_thread) emu_cmd(2, NULL, 0); else retro_reset(); }
API double fe_fps(void) { return av.timing.fps; }
API double fe_sample_rate(void) { return av.timing.sample_rate; }

/* ---------- disquettes à chaud : remplace l'image du lecteur DF0: ---------- */
API int fe_disk_count(void) { return have_disk_ext ? (int)disk.get_num_images() : -1; }
API int fe_disk_insert(const char *path) {
  if (!have_disk_ext) return 0;
  disk.set_eject_state(true);
  unsigned idx = disk.get_num_images();
  if (!disk.add_image_index()) return 0;
  struct retro_game_info info = { path, NULL, 0, NULL };
  if (!disk.replace_image_index(idx, &info)) return 0;
  disk.set_image_index(idx);
  return disk.set_eject_state(false);
}
API int fe_disk_eject(void) { return have_disk_ext ? disk.set_eject_state(true) : 0; }

/* Lecteurs DF0: à DF3: pilotés directement (le cœur applique le changement à la trame suivante). */
#ifdef FE_AMIBERRY
/* fonctions C++ d'Amiberry, enveloppées dans amb_glue.cpp */
#define disk_insert amb_disk_insert
#define disk_eject amb_disk_eject
#endif
extern void disk_insert(int num, const char *name);
extern void disk_eject(int num);
API void fe_drive_insert(int num, const char *path) { if (num >= 0 && num < 4) disk_insert(num, path); }
API void fe_drive_eject(int num) { if (num >= 0 && num < 4) disk_eject(num); }

/* Le cœur écrit disquettes et disques durs par fwrite : la dernière écriture peut rester dans le tampon
   de la bibliothèque C. À appeler avant de relire un média depuis JavaScript. */
API void fe_flush(void) { fflush(NULL); }

/* ---------- sauvegardes d'état ---------- */
API unsigned fe_state_size(void) { return (unsigned)retro_serialize_size(); }
API int fe_state_save(void *dst, unsigned size) { return retro_serialize(dst, size); }
static int state_load_now(const void *src, unsigned size) { return retro_unserialize(src, size); }
/* Reprise d'état et réinitialisation : faites par le fil qui fait tourner le cœur (Amiberry y attend ses propres fils) */
API int fe_state_load(const void *src, unsigned size) { return emu_running_thread ? emu_cmd(1, src, size) : state_load_now(src, size); }

/* ---------- émulation dans son propre fil ----------
 * Le fil démarre le cœur (retro_load_game : les coroutines d'Amiberry s'attachent à lui) puis enchaîne les images au
 * rythme de l'Amiga, avec sa propre horloge : la page ne fait plus qu'afficher la dernière image et transmettre les
 * commandes. Ce qui touche à l'état du cœur depuis la page (options, lecteurs, sauvegardes d'état…) passe par
 * fe_lock()/fe_unlock(), pris entre deux images. Les accès aux fichiers du cœur sont relayés vers la page par
 * Emscripten : la page attend le verrou en traitant ces relais, sans blocage mutuel. */
#define KEYQ 256
static unsigned keyq[KEYQ]; static unsigned keyq_w, keyq_r;
static pthread_t emu_thr;
static pthread_mutex_t emu_mtx = PTHREAD_MUTEX_INITIALIZER;
static volatile int emu_state, emu_paused, emu_want, emu_stop;
static char emu_path[1024];
static volatile unsigned emu_frames; static volatile double emu_busy_us;

/* Touche (bit 31 = enfoncée) : le cœur en reçoit une par image, dans l'ordre */
API void fe_key_push(int down, unsigned retrok) {
  unsigned w = __atomic_load_n(&keyq_w, __ATOMIC_RELAXED), n = (w + 1) % KEYQ;
  if (n == __atomic_load_n(&keyq_r, __ATOMIC_ACQUIRE)) return;
  keyq[w] = retrok | (down ? 0x80000000u : 0); __atomic_store_n(&keyq_w, n, __ATOMIC_RELEASE);
}
static void key_pop(void) {
  unsigned r = __atomic_load_n(&keyq_r, __ATOMIC_RELAXED);
  if (r == __atomic_load_n(&keyq_w, __ATOMIC_ACQUIRE)) return;
  unsigned k = keyq[r]; __atomic_store_n(&keyq_r, (r + 1) % KEYQ, __ATOMIC_RELEASE);
  fe_key((k & 0x80000000u) != 0, k & 0x7fffffffu);
}
static void emu_frame(void) {
  double t0 = emscripten_get_now();
  pthread_mutex_lock(&emu_mtx);
  key_pop(); retro_run();
  pthread_mutex_unlock(&emu_mtx);
  emu_busy_us += (emscripten_get_now() - t0) * 1000.0;
  __atomic_add_fetch(&emu_frames, 1, __ATOMIC_RELAXED);
}
/* Commande de la page exécutée par le fil de l'émulation entre deux images ; la page attend le résultat en traitant
   les accès aux fichiers que le cœur lui relaie */
static volatile int cmd_code, cmd_res; static const void *cmd_p; static unsigned cmd_n;
static int emu_cmd(int code, const void *p, unsigned n) {
  cmd_p = p; cmd_n = n; __atomic_store_n(&cmd_code, code, __ATOMIC_RELEASE);
  while (__atomic_load_n(&cmd_code, __ATOMIC_ACQUIRE)) emscripten_main_thread_process_queued_calls();
  return cmd_res;
}
static void cmd_run(void) {
  int c = __atomic_load_n(&cmd_code, __ATOMIC_ACQUIRE); if (!c) return;
  pthread_mutex_lock(&emu_mtx);
  cmd_res = c == 1 ? state_load_now(cmd_p, cmd_n) : (retro_reset(), 1);
  pthread_mutex_unlock(&emu_mtx);
  __atomic_store_n(&cmd_code, 0, __ATOMIC_RELEASE);
}
static void *emu_main(void *arg) {
  (void)arg;
  pthread_mutex_lock(&emu_mtx);
  int ok = fe_start(emu_path[0] ? emu_path : NULL);
  pthread_mutex_unlock(&emu_mtx);
  emu_state = ok ? 2 : -1;
  if (!ok) return NULL;
  emu_running_thread = 1;
  double period = 1000.0 / (av.timing.fps > 0 ? av.timing.fps : 50.0), next = emscripten_get_now();
  while (!emu_stop) {
    cmd_run();
    if (emu_want) { usleep(500); continue; }            /* la page attend le verrou : on lui laisse la place */
    if (emu_paused) { usleep(4000); next = emscripten_get_now(); continue; }
    double now = emscripten_get_now();
    if (emu_warp > 1) {                                   /* turbo : sans attendre l'horloge */
      emu_frame(); next = emscripten_get_now(); continue;
    }
    if (now < next) { double d = next - now; usleep(d > 2.0 ? (useconds_t)((d - 1.0) * 1000) : 200); continue; }
    if (now - next > 250) next = now;                     /* gros retard (onglet en arrière-plan) : on ne rattrape pas tout */
    emu_frame();
    next += period;
  }
  return NULL;
}
/* Démarre le fil ; fe_thread_state() : 1 en démarrage, 2 en marche, -1 refus du cœur, 0 fil impossible */
API int fe_thread_start(const char *path) {
  snprintf(emu_path, sizeof emu_path, "%s", path ? path : "");
  emu_state = 1;
  pthread_attr_t a; pthread_attr_init(&a); pthread_attr_setstacksize(&a, 8u << 20);
  if (pthread_create(&emu_thr, &a, emu_main, NULL)) { emu_state = 0; return 0; }
  return 1;
}
API int fe_thread_state(void) { return emu_state; }
API void fe_thread_pause(int p) { emu_paused = p != 0; }
API void fe_thread_warp(int w) { emu_warp = w > 1 ? w : 1; }
API void fe_thread_stop(void) { emu_stop = 1; }
/* Images calculées et temps passé (µs) depuis le dernier appel */
API unsigned fe_thread_frames(void) { return __atomic_exchange_n(&emu_frames, 0, __ATOMIC_RELAXED); }
API double fe_thread_busy(void) { double b = emu_busy_us; emu_busy_us = 0; return b; }
API void fe_lock(void) { emu_want = 1; pthread_mutex_lock(&emu_mtx); }
API void fe_unlock(void) { pthread_mutex_unlock(&emu_mtx); emu_want = 0; }
