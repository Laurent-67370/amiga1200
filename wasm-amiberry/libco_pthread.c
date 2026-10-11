/* libco pour WebAssembly : chaque « coroutine » est un fil d'exécution (pthread).
 *
 * WebAssembly ne permet pas de changer de pile comme le font les versions natives de libco (assembleur, ucontext).
 * Ici, un seul fil tourne à la fois : co_switch(cible) réveille la cible puis endort le fil courant. Le cœur
 * Amiberry fait tourner l'émulation dans une coroutine et rend la main à chaque image : cela devient un passage
 * de témoin entre le fil de la page et le fil de l'émulation, deux fois par image. */
#include <pthread.h>
#include <semaphore.h>
#include <stdlib.h>
#include <emscripten/threading.h>
#include <emscripten/proxying.h>
#include "libco.h"

typedef struct cothread {
  sem_t go;                 /* posté quand ce fil doit reprendre */
  void (*entry)(void);
  pthread_t thread;
  int started;
  unsigned int stack;
} cothread;

static __thread cothread *current;

static cothread *self_handle(void) {
  if (!current) {
    current = calloc(1, sizeof(cothread));
    sem_init(&current->go, 0, 0);
    current->started = 1;
  }
  return current;
}

cothread_t co_active(void) { return self_handle(); }

static void *trampoline(void *arg) {
  cothread *co = arg;
  current = co;
  sem_wait(&co->go); /* attend le premier co_switch vers lui */
  co->entry();
  /* Une coroutine libco ne doit pas revenir : on reste endormi */
  for (;;) sem_wait(&co->go);
  return NULL;
}

cothread_t co_create(unsigned int size, void (*entry)(void)) {
  cothread *co = calloc(1, sizeof(cothread));
  if (!co) return NULL;
  sem_init(&co->go, 0, 0);
  co->entry = entry;
  co->stack = size < (8u << 20) ? (8u << 20) : size; /* la pile du cœur : large, l'émulation est profonde */
  return co;
}

cothread_t co_derive(void *memory, unsigned int size, void (*entry)(void)) { (void)memory; return co_create(size, entry); }

void co_delete(cothread_t handle) { (void)handle; /* le fil reste endormi ; la page est rechargée pour rallumer */ }

void co_switch(cothread_t handle) {
  cothread *to = handle, *from = self_handle();
  if (to == from) return;
  if (!to->started) {
    pthread_attr_t a;
    pthread_attr_init(&a);
    pthread_attr_setstacksize(&a, to->stack);
    to->started = 1;
    pthread_create(&to->thread, &a, trampoline, to);
    pthread_attr_destroy(&a);
  }
  sem_post(&to->go);
  /* Le fil principal traite pendant l'attente ce que les autres fils lui confient (accès aux fichiers…) :
     sinon le fil d'émulation, qui attend une réponse, et lui, qui attend le fil d'émulation, se bloquent */
  if (emscripten_is_main_runtime_thread()) {
    while (sem_trywait(&from->go)) emscripten_main_thread_process_queued_calls();
  } else sem_wait(&from->go);
}

int co_serializable(void) { return 0; }
