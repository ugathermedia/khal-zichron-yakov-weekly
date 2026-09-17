(() => {
  // ZmanimScreens applies offsets to the exact astronomical instant and only
  // then formats/rounds the result. The first implementation rounded each
  // source zman to the nearest minute before applying its offset, which could
  // shift rows by one minute (for example Fri. Plag 5:42:xx became 5:43,
  // making Mincha A 5:28 instead of 5:27).
  window.timeMinutes = function timeMinutesPrecise(value) {
    if (!value || value === 'N/A') return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.getTime() / 60000;
  };

  // app.js has already rendered once; recompute with preserved seconds.
  if (typeof window.refresh === 'function') window.refresh();
})();
