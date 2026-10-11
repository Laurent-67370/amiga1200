/* Banc d'essai minimal : un « frontal » libretro sans écran pour mesurer
   la vitesse du cœur Amiberry (Amiga 1200, AROS intégré), en natif ou en WebAssembly. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <stdint.h>
#include <time.h>
#include "libretro.h"

static const char *SYSDIR = "sys";
static const char *model = "A1200OG";
static int verbose; /* journal complet : 7e argument « v » */
static int fmt = RETRO_PIXEL_FORMAT_0RGB1555;
static unsigned fw, fh; static size_t fpitch;
static uint8_t *last;
static unsigned long frames;

static struct { const char *k, *v; } OPTS[] = {
  { "amiberry_model", NULL }, /* rempli depuis argv */
  { "amiberry_video_standard", "pal" },
  { "amiberry_crop_overscan", NULL }, /* rempli depuis argv */
  { NULL, NULL }
};

static void logfn(enum retro_log_level l, const char *f, ...) {
  if (l < RETRO_LOG_WARN && !verbose) return;
  va_list a; va_start(a, f); vfprintf(stderr, f, a); va_end(a);
}

static retro_time_t usec(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return (retro_time_t)t.tv_sec * 1000000 + t.tv_nsec / 1000; }
static uint64_t cpufeat(void) { return 0; }
static retro_perf_tick_t perfctr(void) { return (retro_perf_tick_t)usec(); }
static void pnop(struct retro_perf_counter *c) { (void)c; }
static void plog(void) {}
static bool env(unsigned cmd, void *data) {
  switch (cmd) {
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
      *(const char **)data = SYSDIR; return true;
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT:
      fmt = *(enum retro_pixel_format *)data; return true;
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE:
      ((struct retro_log_callback *)data)->log = logfn; return true;
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
      struct retro_variable *v = data;
      for (int i = 0; OPTS[i].k; i++) if (!strcmp(v->key, OPTS[i].k) && OPTS[i].v) { v->value = OPTS[i].v; return true; }
      return false;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool *)data = false; return true;
    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned *)data = 0; return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool *)data = true; return true;
    case RETRO_ENVIRONMENT_GET_PERF_INTERFACE: {
      struct retro_perf_callback *c = data;
      c->get_time_usec = usec; c->get_cpu_features = cpufeat; c->get_perf_counter = perfctr;
      c->perf_register = pnop; c->perf_start = pnop; c->perf_stop = pnop; c->perf_log = plog;
      return true;
    }
    default: return false;
  }
}
static void video(const void *d, unsigned w, unsigned h, size_t pitch) {
  frames++;
  if (!d) return;
  fw = w; fh = h; fpitch = pitch;
  last = realloc(last, pitch * h); memcpy(last, d, pitch * h);
}
static void audio(int16_t l, int16_t r) { (void)l; (void)r; }
static size_t audio_batch(const int16_t *d, size_t n) { (void)d; return n; }
static void input_poll(void) {}
static int16_t input_state(unsigned p, unsigned dev, unsigned i, unsigned id) { (void)p; (void)dev; (void)i; (void)id; return 0; }

static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec + t.tv_nsec / 1e9; }

static void dump_ppm(const char *path) {
  if (!last) return;
  FILE *f = fopen(path, "wb"); if (!f) return;
  fprintf(f, "P6\n%u %u\n255\n", fw, fh);
  for (unsigned y = 0; y < fh; y++) for (unsigned x = 0; x < fw; x++) {
    uint8_t rgb[3];
    if (fmt == RETRO_PIXEL_FORMAT_XRGB8888) { uint32_t p = ((uint32_t *)(last + y * fpitch))[x]; rgb[0] = p >> 16; rgb[1] = p >> 8; rgb[2] = p; }
    else { uint16_t p = ((uint16_t *)(last + y * fpitch))[x]; rgb[0] = (p >> 11) << 3; rgb[1] = ((p >> 5) & 63) << 2; rgb[2] = (p & 31) << 3; }
    fwrite(rgb, 1, 3, f);
  }
  fclose(f);
}

int main(int argc, char **argv) {
  int warm = argc > 1 ? atoi(argv[1]) : 250;
  int run = argc > 2 ? atoi(argv[2]) : 500;
  model = argc > 3 ? argv[3] : "A1200OG";
  OPTS[0].v = model;
  verbose = argc > 7 && argv[7][0] == 'v';
  OPTS[2].v = argc > 5 ? argv[5] : "disabled";
  retro_set_environment(env);
  retro_set_video_refresh(video);
  retro_set_audio_sample(audio);
  retro_set_audio_sample_batch(audio_batch);
  retro_set_input_poll(input_poll);
  retro_set_input_state(input_state);
  double t0 = now();
  retro_init();
  struct retro_game_info gi = { argc > 6 ? argv[6] : NULL, NULL, 0, NULL };
  if (!retro_load_game(argc > 6 ? &gi : NULL)) { fprintf(stderr, "load_game a échoué\n"); return 1; }
  double t1 = now();
  for (int i = 0; i < warm; i++) retro_run();
  double t2 = now();
  unsigned long f0 = frames;
  for (int i = 0; i < run; i++) retro_run();
  double t3 = now();
  double fps = (frames - f0) / (t3 - t2);
  printf("init %.2fs | %d images de chauffe %.2fs | %lu images en %.2fs => %.1f images/s (%.1fx le temps réel PAL) | modèle %s | %ux%u\n",
         t1 - t0, warm, t2 - t1, frames - f0, t3 - t2, fps, fps / 50.0, model, fw, fh);
  {
    size_t n = retro_serialize_size(); void *buf = malloc(n ? n : 1);
    double a = now(); bool ok = n && retro_serialize(buf, n); double b = now();
    bool ok2 = ok && retro_unserialize(buf, n);
    for (int i = 0; i < 50; i++) retro_run();
    printf("sauvegarde d'état : %s, %zu octets, %.1f ms | restauration : %s\n", ok ? "OK" : "échec", n, (b - a) * 1000, ok2 ? "OK" : "échec");
  }
  fflush(stdout);
  dump_ppm(argc > 4 ? argv[4] : "frame.ppm");
  _Exit(0); /* sans retro_deinit : le fil d'émulation reste endormi */
}
