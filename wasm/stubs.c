/* Symboles que RetroArch fournit d'habitude au cœur, à fournir ici. */
#include <unistd.h>

int MAX(int a, int b) { return a > b ? a : b; }

/* Sous Emscripten, libretro-common attend que le frontal définisse retro_sleep. */
void retro_sleep(unsigned msec) { usleep(msec * 1000); }
