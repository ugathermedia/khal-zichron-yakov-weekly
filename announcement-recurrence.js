/* Weekly recurrence copies previous-week announcements without linking edits. */
(function (root) {
  'use strict';
  function fingerprint(a) {
    return JSON.stringify([String(a.title || ''), String(a.subtitle || ''), String(a.body || ''),
      String(a.names || ''), a.visible !== false]);
  }
  function copyFields(a) {
    return {
      title: String(a.title || ''), subtitle: String(a.subtitle || ''),
      body: String(a.body || ''), names: String(a.names || ''),
      visible: a.visible !== false, repeatWeekly: a.repeatWeekly === true,
      ...(a.recurrenceId ? { recurrenceId: String(a.recurrenceId) } : {})
    };
  }
  function carryOver(currentDraft, previousDraft) {
    const seenIds = new Set([...(currentDraft.dismissedRecurrenceIds || []),
      ...currentDraft.announcements.map(a => a.recurrenceId).filter(Boolean)]);
    // Suppress exact duplicates that were manually copied before this feature.
    // Compare against existing content only; preserve distinct past entries.
    const alreadyPresent = new Set(currentDraft.announcements
      .filter(a => !a.bookingWeek).map(fingerprint));
    let count = 0;
    for (const a of previousDraft.announcements) {
      if (!a.repeatWeekly || a.bookingWeek || !a.recurrenceId) continue;
      if (seenIds.has(a.recurrenceId) || alreadyPresent.has(fingerprint(a))) continue;
      currentDraft.announcements.push(copyFields(a));
      seenIds.add(a.recurrenceId);
      count++;
    }
    return count;
  }
  function copyPrevious(currentDraft, previousDraft) {
    const existingIds = new Set(currentDraft.announcements.map(a => a.recurrenceId).filter(Boolean));
    let count = 0;
    for (const a of previousDraft.announcements) {
      if (a.bookingWeek) continue;
      if (a.recurrenceId && existingIds.has(a.recurrenceId)) continue;
      const copy = copyFields(a);
      currentDraft.announcements.push(copy);
      if (copy.recurrenceId) {
        existingIds.add(copy.recurrenceId);
        currentDraft.dismissedRecurrenceIds = (currentDraft.dismissedRecurrenceIds || [])
          .filter(id => id !== copy.recurrenceId);
      }
      count++;
    }
    return count;
  }
  const api = Object.freeze({ carryOver, copyPrevious });
  root.AnnouncementRecurrence = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
