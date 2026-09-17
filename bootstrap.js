(() => {
  const liveKzyApi = 'https://kzy.zmanimscreens.com/api/data';
  const originalFetch = window.fetch.bind(window);

  // GitHub Pages is a different origin from ZmanimScreens, and the KZY API
  // does not allow browser CORS requests. The deploy workflow therefore
  // snapshots that public API into kzy-data.json on our own Pages site.
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (url === liveKzyApi) {
      return originalFetch(`./kzy-data.json?v=${Date.now()}`, {
        ...init,
        cache: 'no-store'
      });
    }
    return originalFetch(input, init);
  };
})();
