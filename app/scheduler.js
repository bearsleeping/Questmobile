// app/scheduler.js
import { AppState } from './sync.js';

const POLLING_INTERVAL_MS = 60 * 1000; // 60 sekund
let pollingId = null;

export const Scheduler = {
  init() {
    // 1. Uruchomienie przy starcie
    this.startPolling();

    // 2. Obsługa Visibility API (iOS/Android)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Aplikacja schowana - ZATRZYMAJ polling (oszczędzanie baterii)
        this.stopPolling();
        console.log('Aplikacja w tle - polling wstrzymany');
      } else {
        // Aplikacja widoczna - WZNÓW polling i odśwież natychmiast
        console.log('Aplikacja wybudzona - odświeżanie danych...');
        AppState.sync(); // Natychmiastowy "fresh"
        this.startPolling(); // Restart zegara
      }
    });

    // 3. Obsługa powrotu sieci (gdy użytkownik odzyska zasięg)
    window.addEventListener('online', () => {
      console.log('Odzyskano połączenie - synchronizacja');
      AppState.sync();
    });
  },

  startPolling() {
    if (pollingId) clearInterval(pollingId);
    
    pollingId = setInterval(() => {
      // Synchronizuj tylko jeśli strona jest widoczna (dodatkowe zabezpieczenie)
      if (!document.hidden) {
        console.log('Polling: Automatyczne odświeżanie...');
        AppState.sync();
      }
    }, POLLING_INTERVAL_MS);
  },

  stopPolling() {
    if (pollingId) {
      clearInterval(pollingId);
      pollingId = null;
    }
  }
};
