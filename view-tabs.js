(() => {
  const KEY = 'kzy-weekly:active-view';

  function setView(view) {
    const next = view === 'holiday' ? 'holiday' : 'weekly';
    document.querySelectorAll('[data-app-view]').forEach(el => {
      el.hidden = el.dataset.appView !== next;
    });
    document.querySelectorAll('[data-view-tab]').forEach(btn => {
      const active = btn.dataset.viewTab === next;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    localStorage.setItem(KEY, next);
    if (next === 'holiday' && typeof window.renderSuccosPlanner === 'function') {
      window.renderSuccosPlanner();
    }
  }

  document.querySelectorAll('[data-view-tab]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.viewTab));
  });

  setView(localStorage.getItem(KEY) || 'weekly');
})();