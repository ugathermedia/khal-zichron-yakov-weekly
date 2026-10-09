/* Minute-only astronomical display: Shkiah and Plag always round down;
 * all other zmanim round to the nearest minute (half-up).
 * Exact instants remain unchanged for eligibility, offsets and minyan rules.
 */
(function (root) {
  'use strict';

  const ROUND_EARLIER = new Set(['shkiah', 'shkia', 'sunset', 'sea-level-sunset', 'sealevelsunset', 'plag', 'plag-hamincha', 'plaghamincha']);

  function roundZmanInstant(value, zmanType = 'other') {
    if (value == null || value === '' || value === 'N/A') return null;
    const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isFinite(millis)) return null;
    const round = ROUND_EARLIER.has(String(zmanType).toLowerCase()) ? Math.floor : Math.round;
    return new Date(round(millis / 60000) * 60000);
  }

  // An earlier version saved every displayed time, including auto times.
  // Correct an old auto-rounding snapshot only when its clock matches the
  // previous automatic display; leave other saved times and minyan entries alone.
  function correctLegacyZmanClock(savedClock, exactInstant, timeZoneId, formerDirection, zmanType = 'other') {
    if (typeof savedClock !== 'string' || !timeZoneId || !['up', 'down', 'nearest'].includes(formerDirection)) return savedClock;
    const exact = exactInstant instanceof Date ? exactInstant.getTime() : new Date(exactInstant).getTime();
    if (!Number.isFinite(exact)) return savedClock;
    const previousRound = formerDirection === 'up' ? Math.ceil : formerDirection === 'down' ? Math.floor : Math.round;
    const oldMillis = previousRound(exact / 60000) * 60000;
    const current = roundZmanInstant(exact, zmanType);
    if (!current || oldMillis === current.getTime()) return savedClock;
    const format = date => new Intl.DateTimeFormat('en-US', {
      timeZone: timeZoneId, hour: 'numeric', minute: '2-digit', hour12: true
    }).format(date).replace(/ (AM|PM)$/, '');
    return savedClock.trim() === format(new Date(oldMillis)) ? format(current) : savedClock;
  }

  const api = Object.freeze({ roundZmanInstant, correctLegacyZmanClock });
  root.ZmanimRounding = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
