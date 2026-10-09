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

  const api = Object.freeze({ roundZmanInstant });
  root.ZmanimRounding = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
