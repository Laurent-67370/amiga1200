/* Ajouté au module (--post-js) : la page détruit le cœur éteint avant d'en créer un nouveau (rallumage sans
   recharger la page). Il faut arrêter tous ses fils, et défaire l'attente que le fil principal garde sur sa boîte
   aux lettres (Atomics.waitAsync, réarmée à chaque message) : sans cela, cette attente retient le module et sa
   mémoire (256 Mo et plus) pour toujours. */
Module["terminateAllThreads"] = () => {
  PThread.terminateAllThreads();
  try {
    __emscripten_thread_mailbox_await = () => {};
    checkMailbox = () => {};
    const self = _pthread_self();
    if (self) Atomics.notify((growMemViews(), HEAP32), self >> 2);
  } catch (e) {}
};
