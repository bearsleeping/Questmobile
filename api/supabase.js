// api/supabase.js
// Zakładamy, że biblioteka supabase-js jest załadowana w index.html (CDN)

let client = null;

export const Api = {
  init() {
    // Pobieramy konfigurację w momencie wywołania init(), a nie ładowania pliku
    // To zapobiega błędom, gdy plik konfiguracyjny ładuje się wolniej
    const config = window.__SUPABASE_CONFIG__;
    const hasLibrary = !!(window.supabase && typeof window.supabase.createClient === 'function');
    const hasConfig = !!(config && typeof config.url === 'string' && config.url && typeof config.anonKey === 'string' && config.anonKey);

    if (hasLibrary && hasConfig) {
      console.log('✅ Supabase: Inicjalizacja klienta z URL:', config.url);
      client = window.supabase.createClient(config.url, config.anonKey);
      return true;
    } else {
      console.error('❌ Supabase: BŁĄD INICJALIZACJI.', {
        libraryLoaded: hasLibrary,
        configLoaded: !!config,
        urlPresent: !!config?.url,
        anonKeyPresent: !!config?.anonKey
      });
      return false;
    }
  },

  getInitDiagnostics() {
    const config = window.__SUPABASE_CONFIG__;
    const hasLibrary = !!(window.supabase && typeof window.supabase.createClient === 'function');
    return {
      origin: window.location?.origin || '',
      online: navigator.onLine,
      libraryLoaded: hasLibrary,
      configLoaded: !!config,
      urlPresent: !!config?.url,
      anonKeyPresent: !!config?.anonKey
    };
  },

  // Pobieranie wszystkich danych (Zadania, Profil, Historia)
  // Używamy Promise.all, aby pobrać wszystko w jednym rzucie (mniej wybudzeń radia na mobile)
  async fetchAllData(userId) {
    if (!client) return { error: { message: 'Klient Supabase nie został zainicjowany.' }, isNetworkError: true };
    if (!userId) return { error: 'Brak ID użytkownika' };
    
    // Sprawdzenie sieci przed zapytaniem (oszczędność czasu)
    if (!navigator.onLine) {
      return { error: 'Brak połączenia internetowego', isNetworkError: true };
    }

    try {
      const [tasks, entries, profile] = await Promise.all([
        client.from('tasks').select('*').eq('user_id', userId),
        client.from('work_entries').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
        client.from('profiles').select('*').eq('id', userId).single()
      ]);

      if (tasks.error) throw tasks.error;
      if (entries.error) throw entries.error;
      // Profile może nie istnieć, to nie zawsze błąd krytyczny

      return {
        data: {
          tasks: tasks.data || [],
          entries: entries.data || [],
          profile: profile.data || {}
        },
        error: null
      };

    } catch (err) {
      console.error('Supabase fetch error:', err);
      // Rozróżnienie błędu sieci od błędu bazy danych
      const isNetworkError = err.message === 'Failed to fetch' || err.status === 0;
      return { error: err, isNetworkError };
    }
  },

  // Dodawanie nowego wpisu czasu pracy
  async addEntry(entryData) {
    if (!client) return { error: { message: 'Klient Supabase nie został zainicjowany.' }, isNetworkError: true };
    if (!navigator.onLine) return { error: 'Brak internetu', isNetworkError: true };

    try {
      const { data, error } = await client.from('work_entries').insert(entryData).select();
      return { data, error };
    } catch (err) {
      console.error('Supabase insert error:', err);
      const isNetworkError = err.message === 'Failed to fetch';
      return { error: err, isNetworkError };
    }
  },

  // Metody autentykacji
  async getSession() {
    if (!client) return { data: { session: null }, error: { message: 'Klient Supabase nie został zainicjowany.' } };
    
    try {
      // Timeout 2 sekundy na sprawdzenie sesji, żeby aplikacja nie wisiała
      const sessionPromise = client.auth.getSession();
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ data: { session: null }, error: { message: 'Timeout sprawdzania sesji.' } }), 2000));
      return await Promise.race([sessionPromise, timeoutPromise]);
    } catch (err) {
      return { data: { session: null }, error: err };
    }
  },

  async signIn(email, password) {
    if (!client) return { error: { message: 'Klient Supabase nie został zainicjowany.' } };
    return await client.auth.signInWithPassword({ email, password });
  },

  async signOut() {
    if (client) await client.auth.signOut();
  }
};
