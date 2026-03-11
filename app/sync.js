// app/sync.js
import { Api } from '../api/supabase.js';
import { LocalCache } from '../cache/storage.js';

// Prosty State Management (można zastąpić czymś bardziej zaawansowanym)
export const AppState = {
  data: null,
  userId: null,
  isSyncing: false,
  isOffline: false,
  listeners: [],

  // Subskrypcja zmian w UI
  subscribe(fn) {
    this.listeners.push(fn);
  },

  notify() {
    this.listeners.forEach(fn => fn(this.data, { isOffline: this.isOffline, isSyncing: this.isSyncing }));
  },

  // Główna funkcja synchronizacji
  async sync(force = false) {
    if (this.isSyncing) return; // Zapobieganie nakładaniu się zapytań
    this.isSyncing = true;
    this.notify(); // Poinformuj UI (np. pokaż spinner)

    // 1. Najpierw załaduj z Cache (jeśli aplikacja startuje)
    if (!this.data) {
      const cached = LocalCache.getData();
      if (cached) {
        this.data = cached;
        this.notify(); // Natychmiastowe wyświetlenie danych
      }
    }

    // 2. Pobierz z sieci
    const response = await Api.fetchAllData(this.userId);

    if (response.error) {
      if (response.isNetworkError) {
        this.isOffline = true;
        console.log('Tryb offline - używam danych lokalnych');
      } else {
        console.error('Błąd API:', response.error);
      }
    } else {
      // 3. Sukces - aktualizuj stan i cache
      this.isOffline = false;
      this.data = response.data;
      LocalCache.saveData(this.data);
    }

    this.isSyncing = false;
    this.notify(); // Odśwież UI nowymi danymi
  },

  // Wywoływane, gdy użytkownik wykona akcję (np. doda zadanie)
  triggerAction() {
    // Tutaj normalnie byłaby logika wysyłki (POST)
    // Po wysyłce, wymuszamy odświeżenie:
    this.sync(true);
  },

  // Dodawanie wpisu i auto-odświeżanie
  async addEntry(entryPayload) {
    if (!this.userId) return { error: 'Nie jesteś zalogowany' };

    // Dodajemy ID użytkownika do payloadu
    const payload = { ...entryPayload, user_id: this.userId };
    
    const response = await Api.addEntry(payload);
    
    if (!response.error) {
      // Sukces: wymuś pobranie świeżych danych z serwera
      await this.sync(true); 
      return { success: true };
    }
    
    return { success: false, error: response.error };
  }
};
