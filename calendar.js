/* Calendar labels only. Astronomical times continue to use KosherZmanim. */
(() => {
  const requests = new Map();
  let bundled = null;
  function getBundle() {
    if (!bundled) bundled = fetch('calendar-data.json', { cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw new Error('Calendar snapshot unavailable');
      return response.json();
    }).catch(() => null);
    return bundled;
  }
  async function events(start, end) {
    const snapshot = await getBundle();
    if (snapshot && start >= snapshot.start && end <= snapshot.end) {
      return snapshot.items.filter(item => item.date >= start && item.date <= end);
    }
    const key = start + ':' + end;
    if (!requests.has(key)) {
      const url = 'https://www.hebcal.com/hebcal?v=1&cfg=json&s=on&nx=on&mvch=on&i=off&lg=s&leyning=off&hdp=1&start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end);
      const pending = fetch(url, { cache: 'force-cache' }).then(async response => {
        if (!response.ok) throw new Error('Calendar lookup failed (' + response.status + ')');
        return (await response.json()).items || [];
      }).catch(error => { requests.delete(key); throw error; });
      requests.set(key, pending);
    }
    return requests.get(key);
  }
  window.kzyCalendar = { events };
})();
