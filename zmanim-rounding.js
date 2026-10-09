/* Minute-only astronomical zmanim use ordinary half-up display rounding.
 * Keep the exact instant for halachic eligibility, cutoffs, and shul scheduling.
 * Independent minyan rules (including explicit :05 modes) remain separate.
 */
(function (root) {
  'use strict';

  function roundZmanInstant(value) {
    if (value == null || value === '' || value === 'N/A') return null;
    const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (!Number.isFinite(millis)) return null;
    return new Date(Math.round(millis / 60000) * 60000);
  }

  // An earlier version saved every displayed time, including auto times.
  // Correct an old directional-rounding snapshot only when its clock matches
  // the former auto value; leave other saved times and minyan entries alone.
  function correctLegacyZmanClock(savedClock, exactInstant, timeZoneId, formerDirection) {
    if (typeof savedClock !== 'string' || !timeZoneId || !['up', 'down'].includes(formerDirection)) return savedClock;
    const exact = exactInstant instanceof Date ? exactInstant.getTime() : new Date(exactInstant).getTime();
    if (!Number.isFinite(exact)) return savedClock;
    const oldMillis = (formerDirection === 'up' ? Math.ceil : Math.floor)(exact / 60000) * 60000;
    const current = roundZmanInstant(exact);
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
