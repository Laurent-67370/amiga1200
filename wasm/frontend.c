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
#include <emscripten/emscripten.h>
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
static uint8_t *rgba; static size_t rgba_cap;
static unsigned vid_w, vid_h;
static unsigned long frame_count;

static void video_cb(const void *data, unsigned w, unsigned h, size_t pitch) {
  if (!data) return; /* image identique à la précédente */
  size_t need = (size_t)w * h * 4;
  if (need > rgba_cap) { rgba = realloc(rgba, need); rgba_cap = need; }
  vid_w = w; vid_h = h; frame_count++;
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
}
API uint8_t *fe_video_ptr(void) { return rgba; }
API unsigned fe_video_w(void) { return vid_w; }
API unsigned fe_video_h(void) { return vid_h; }
API unsigned long fe_frame_count(void) { return frame_count; }

/* ---------- son : tampon circulaire stéréo 16 bits ---------- */
#define AUD_FRAMES 32768
static int16_t aud[AUD_FRAMES * 2];
static unsigned aud_w, aud_r;
static void aud_push(const int16_t *d, size_t frames) {
  for (size_t i = 0; i < frames; i++) {
    unsigned n = (aud_w + 1) % AUD_FRAMES;
    if (n == aud_r) aud_r = (aud_r + 1) % AUD_FRAMES; /* plein : on jette le plus ancien */
    aud[aud_w * 2] = d[i * 2]; aud[aud_w * 2 + 1] = d[i * 2 + 1]; aud_w = n;
  }
}
static void audio_cb(int16_t l, int16_t r) { int16_t s[2] = { l, r }; aud_push(s, 1); }
static size_t audio_batch_cb(const int16_t *d, size_t frames) { aud_push(d, frames); return frames; }
/* Copie jusqu'à max trames, en flottants entrelacés, dans dst ; renvoie le nombre de trames. */
API unsigned fe_audio_read(float *dst, unsigned max) {
  unsigned n = 0;
  while (aud_r != aud_w && n < max) {
    dst[n * 2] = aud[aud_r * 2] / 32768.0f; dst[n * 2 + 1] = aud[aud_r * 2 + 1] / 32768.0f;
    aud_r = (aud_r + 1) % AUD_FRAMES; n++;
  }
  return n;
}
API unsigned fe_audio_available(void) { return (aud_w + AUD_FRAMES - aud_r) % AUD_FRAMES; }

/* ---------- entrées ---------- */
static int mouse_acc_x, mouse_acc_y, mouse_x, mouse_y, mouse_btn;
static unsigned joy[2];
API void fe_mouse_move(int dx, int dy) { mouse_acc_x += dx; mouse_acc_y += dy; }
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
  mouse_x = mouse_acc_x; mouse_y = mouse_acc_y; mouse_acc_x = mouse_acc_y = 0;
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
API void fe_reset(void) { if (loaded) retro_reset(); }
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
API int fe_state_load(const void *src, unsigned size) { return retro_unserialize(src, size); }
