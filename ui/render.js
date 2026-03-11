export const Render = {
  // Renderowanie listy wpisow czasu pracy
  entriesList(entries) {
    const listEl = document.getElementById('entriesList');
    if (!listEl) return;

    if (!entries || entries.length === 0) {
      listEl.innerHTML = '<li class="entries-v3-empty">Brak wpisow. Dodaj pierwszy czas pracy.</li>';
      return;
    }

    listEl.innerHTML = entries.map(entry => {
      // Obliczanie czasu trwania (jesli nie jest podany wprost)
      const duration = entry.duration_minutes
        ? (entry.duration_minutes / 60).toFixed(2)
        : calculateDuration(entry.start, entry.end);

      return `
        <li class="entries-v3-item" data-id="${entry.id}">
          <div class="entries-v3-main">
            <div class="entries-v3-top">
              <span class="entries-v3-date">${formatDate(entry.date)}</span>
              <span class="entries-v3-day">${getDayName(entry.date)}</span>
            </div>
            <div class="entries-v3-time">${entry.start || '--:--'} - ${entry.end || '--:--'}</div>
          </div>
          <div class="entries-v3-side">
            <span class="entries-v3-hours">${duration} h</span>
          </div>
        </li>
      `;
    }).join('');
  }
};

// Pomocnicze funkcje formatujace
function formatDate(isoDate) {
  if (!isoDate) return '-';
  return new Date(isoDate).toLocaleDateString('pl-PL');
}

function getDayName(isoDate) {
  if (!isoDate) return '-';
  const date = new Date(isoDate);
  const day = date.toLocaleDateString('pl-PL', { weekday: 'long' });
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function calculateDuration(start, end) {
  // Prosta kalkulacja dla celow wyswietlania, jesli brak pola duration_minutes
  if (!start || !end) return '0.00';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return '0.00';
  const minutes = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  return (minutes / 60).toFixed(2);
}
