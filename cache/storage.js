const CACHE_KEYS = {
  DATA: 'app_data_v1',
  LAST_SYNC: 'app_last_sync',
  PENDING_ACTIONS: 'app_pending_actions' // Opcjonalnie: do kolejki offline
};

export const LocalCache = {
  // Pobieranie danych z cache (natychmiastowy odczyt)
  getData() {
    try {
      const raw = localStorage.getItem(CACHE_KEYS.DATA);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Błąd odczytu cache:', e);
      return null;
    }
  },

  // Zapisywanie danych do cache
  saveData(data) {
    try {
      localStorage.setItem(CACHE_KEYS.DATA, JSON.stringify(data));
      localStorage.setItem(CACHE_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (e) {
      console.error('Błąd zapisu cache (możliwy brak miejsca):', e);
    }
  },

  getLastSyncTime() {
    return localStorage.getItem(CACHE_KEYS.LAST_SYNC);
  }
};
