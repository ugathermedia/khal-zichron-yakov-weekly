/* Shared MyZmanim convention for minute-only astronomical zmanim displays.
 * Do not use this for shul schedule/minyan rounding or before applying offsets.
 * The exact instant remains unchanged in all calculation inputs.
 */
(function (root) {
  'use strict';
  const ROUND_LATER = new Set(['sunrise', 'earliest-talis', 'earliest-mincha', 'nightfall']);

  function roundZmanInstant(value, zmanType = 'other') {
    if (value == null || value === '' || value === 'N/A') return null;
    const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isFinite(millis)) return null;
    const round = ROUND_LATER.has(zmanType) ? Math.ceil : Math.floor;
    return new Date(round(millis / 60000) * 60000);
  }

  // Old full-week snapshots can preserve the floor-rounded astronomical Tzeis.
  // Upgrade only that precise automatic display; leave other manual times alone.
  function correctLegacyNightfallClock(savedClock, exactInstant, timeZoneId) {
    if (typeof savedClock !== 'string' || !timeZoneId) return savedClock;
    const earlier = roundZmanInstant(exactInstant, 'other');
    const later = roundZmanInstant(exactInstant, 'nightfall');
    if (!earlier || !later || earlier.getTime() === later.getTime()) return savedClock;
    const format = date => new Intl.DateTimeFormat('en-US', {
      timeZone: timeZoneId, hour: 'numeric', minute: '2-digit', hour12: true
    }).format(date).replace(/ (AM|PM)$/, '');
    return savedClock.trim() === format(earlier) ? format(later) : savedClock;
  }

  const api = Object.freeze({ roundZmanInstant, correctLegacyNightfallClock });
  root.ZmanimRounding = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
