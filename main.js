// main.js
import { Api } from './api/supabase.js';
import { AppState } from './app/sync.js';
import { Scheduler } from './app/scheduler.js';
import { Render } from './ui/render.js?v=12';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicjalizacja API
  const isApiInitialized = Api.init();
  
  if (!isApiInitialized) {
    const status = document.getElementById('authStatus');
    const authScreen = document.getElementById('authScreen');
    if (authScreen) authScreen.classList.remove('is-hidden');
    if (status) {
      const diag = Api.getInitDiagnostics ? Api.getInitDiagnostics() : {};
      status.textContent =
        'BŁĄD KRYTYCZNY: Nie można połączyć się z bazą danych. Sprawdź plik supabase.config.js i połączenie z internetem.\n' +
        `online=${diag.online} libraryLoaded=${diag.libraryLoaded} configLoaded=${diag.configLoaded} urlPresent=${diag.urlPresent} anonKeyPresent=${diag.anonKeyPresent} origin=${diag.origin}`;
    }
    // Zatrzymaj dalsze wykonywanie skryptu, ponieważ aplikacja nie może działać.
    return;
  }

  // 2. Obsługa autentykacji i start aplikacji
  await initAuth();

  // 3. Subskrypcja renderowania UI
  AppState.subscribe((data, status) => {
    const statusEl = document.getElementById('connectionStatus');

    // Aktualizacja wskaźnika statusu
    if (statusEl) {
      if (status.isOffline) statusEl.textContent = 'Offline';
      else if (status.isSyncing) statusEl.textContent = 'Sync...';
      else statusEl.textContent = ''; // Hide when online and not syncing
    }

    // Renderowanie danych (jeśli są)
    if (data) {
        // Renderowanie listy wpisów przy użyciu nowego modułu UI
        Render.entriesList(data.entries);
    }
  });

  // 6. Obsługa formularza dodawania (workForm)
  const form = document.getElementById('workForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const dateVal = document.getElementById('workDate')?.value;
      const startVal = document.getElementById('startTime')?.value;
      const endVal = document.getElementById('endTime')?.value;

      if (!dateVal || !startVal || !endVal) {
        alert('Uzupełnij wszystkie pola!');
        return;
      }

      // Proste obliczenie minut (można przenieść do helpera)
      // Zakładamy format HH:MM
      const startMin = parseInt(startVal.split(':')[0]) * 60 + parseInt(startVal.split(':')[1]);
      const endMin = parseInt(endVal.split(':')[0]) * 60 + parseInt(endVal.split(':')[1]);
      const duration = Math.max(0, endMin - startMin);

      const payload = {
        date: dateVal,
        start: startVal,
        end: endVal,
        duration_minutes: duration,
        source: 'manual_pwa'
      };

      const result = await AppState.addEntry(payload);
      if (result.success) {
        form.reset();
        // Ustawienie domyślnych wartości daty itp. (opcjonalnie)
      } else {
        alert('Błąd zapisu: ' + (result.error?.message || 'Nieznany błąd'));
      }
    });
  }
});

// Funkcja inicjalizująca autentykację
async function initAuth() {
  const authScreen = document.getElementById('authScreen');
  const authForm = document.getElementById('authForm');
  const authStatus = document.getElementById('authStatus');

  try {
    // Sprawdź istniejącą sesję
    const { data, error } = await Api.getSession();
    
    if (data?.session?.user) {
      // Zalogowany
      startApp(data.session.user.id);
      if (authScreen) authScreen.classList.add('is-hidden');
    } else {
      // Niezalogowany - pokaż ekran logowania
      if (authScreen) authScreen.classList.remove('is-hidden');
      if (authStatus) authStatus.textContent = error ? `Błąd połączenia: ${error.message || error}` : 'Zaloguj się, aby kontynuować';
    }
  } catch (err) {
    console.error("Błąd initAuth:", err);
    // W razie błędu krytycznego, pokaż ekran logowania, żeby nie blokować usera
    if (authScreen) authScreen.classList.remove('is-hidden');
    if (authStatus) authStatus.textContent = 'Błąd inicjalizacji. Zaloguj się ponownie.';
  }

  // Obsługa logowania
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('authEmailInput').value;
      const password = document.getElementById('authPasswordInput').value;
      const btn = document.getElementById('authLoginBtn');

      if (btn) btn.disabled = true;
      if (authStatus) authStatus.textContent = 'Logowanie...';

      const result = await Api.signIn(email, password);

      if (result.error) {
        if (authStatus) authStatus.textContent = 'Błąd: ' + result.error.message;
        if (btn) btn.disabled = false;
      } else {
        if (authStatus) authStatus.textContent = 'Zalogowano!';
        // Ukryj ekran logowania
        if (authScreen) authScreen.classList.add('is-hidden');
        // Uruchom aplikację
        startApp(result.data.user.id);
      }
    });
  }
}

// Funkcja startująca właściwą aplikację po zalogowaniu
async function startApp(userId) {
  console.log('Start aplikacji dla ID:', userId);
  
  // Ustawienie usera w stanie
  AppState.userId = userId;

  // Pierwsza synchronizacja (Cache -> potem Network)
  await AppState.sync();

  // Uruchomienie "strażnika" (Scheduler)
  Scheduler.init();
}
