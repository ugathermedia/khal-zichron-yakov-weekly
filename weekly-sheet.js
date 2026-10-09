(() => {
  'use strict';
  const PREFIX = 'kzy-weekly:sheet:';
  const ORIGINAL_BACKGROUND = 'assets/weekly-zmanim-background.png';
  const SPONSORSHIP_ORIGIN = 'https://kzy-shalosh-seudos.starrydune2.chatgpt.site';
  const sheet = document.getElementById('weeklySheet');
  const background = document.getElementById('sheetBackground');
  const editor = document.getElementById('announcementFields');
  const status = document.getElementById('announcementSaveStatus');
  const fitStatus = document.getElementById('sheetFitStatus');
  const exportStatus = document.getElementById('sheetExportStatus');
  const outputHint = document.getElementById('sheetOutputHint');
  const outputButtons = ['printWeeklySheet', 'exportWeeklyPng', 'exportWeeklyJpeg'].map(id => document.getElementById(id));
  const disableOutputs = disabled => outputButtons.forEach(button => { button.disabled = disabled; });
  let currentWeek = '';
  let draft = { title: '', announcements: [] };
  let backgroundUrl = null;
  let fitFrame = null;
  let backgroundPending = false;
  let exportPending = false;
  let calendarInfo = null;
  let calendarLoading = false;
  let calendarError = '';
  let sponsorRequest = 0;
  let announcementDrag = null;

  const weekKey = () => state.friday ? localISO(state.friday) : '';
  const emptyDraft = () => ({ title: '', announcements: [] });
  function validDraft(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.announcements)) throw new Error('Invalid announcement backup');
    return {
      title: String(value.title || ''),
      announcements: value.announcements.map(a => ({
        title: String(a.title || ''), body: String(a.body || ''),
        subtitle: String(a.subtitle || ''), names: String(a.names || ''), visible: a.visible !== false,
        ...(typeof a.bookingWeek === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.bookingWeek) ? {
          bookingWeek: a.bookingWeek,
          bookingTopDefault: a.bookingTopDefault === true,
          bookingValues: { title: String(a.bookingValues?.title || ''), body: String(a.bookingValues?.body || ''), names: String(a.bookingValues?.names || '') }
        } : {})
      }))
    };
  }
  function loadDraft(key) {
    try {
      const saved = localStorage.getItem(PREFIX + key);
      return saved ? validDraft(JSON.parse(saved)) : emptyDraft();
    } catch { return emptyDraft(); }
  }
  function save() {
    try {
      localStorage.setItem(PREFIX + currentWeek, JSON.stringify(draft));
      status.textContent = 'Saved for this week in this browser.';
    } catch {
      status.textContent = 'Could not save in this browser. Download a backup before leaving.';
    }
    renderSheet();
  }
  function drawEditor() {
    finishAnnouncementDrag(false);
    document.getElementById('sheetTitleInput').value = draft.title;
    editor.innerHTML = draft.announcements.map((a, i) => `
      <div class="announcement-card" data-announcement="${i}">
        <div class="announcement-card-head">
          <label><input type="checkbox" data-property="visible" ${a.visible ? 'checked' : ''}> Show on sheet</label>
          <div class="announcement-card-tools">
            <button type="button" class="announcement-drag-handle" aria-label="Reorder announcement ${i + 1}. Drag or use Up and Down arrow keys." title="Drag to reorder · keyboard: ↑ / ↓" ${draft.announcements.length < 2 ? 'disabled' : ''}><span aria-hidden="true">⠿</span> Move</button>
            <button type="button" data-action="delete" aria-label="Delete announcement ${i + 1}">Delete</button>
          </div>
        </div>
        <label class="sheet-field">Title<input data-property="title" dir="auto" value="${esc(a.title)}"></label>
        <label class="sheet-field">Time / location / subtitle (optional)<input data-property="subtitle" dir="auto" value="${esc(a.subtitle)}"></label>
        <label class="sheet-field">Announcement<textarea data-property="body" dir="auto">${esc(a.body)}</textarea></label>
        <label class="sheet-field">Names (optional)<input data-property="names" dir="auto" value="${esc(a.names)}"></label>
      </div>`).join('');
    if (!draft.announcements.length) status.textContent = 'No announcements for this week. Add one below.';
  }
  function syncWeek() {
    const next = weekKey();
    if (!next || next === currentWeek) return;
    currentWeek = next;
    draft = loadDraft(next);
    calendarInfo = null;
    calendarLoading = true;
    calendarError = '';
    const saturdayKey = localISO(addDays(state.friday, 1));
    window.kzyCalendar.events(saturdayKey, saturdayKey).then(items => {
      if (currentWeek !== next) return;
      calendarInfo = {
        parsha: items.find(item => item.category === 'parashat'),
        mevorchim: items.find(item => item.category === 'mevarchim')
      };
      calendarLoading = false;
      renderSheet();
    }).catch(error => {
      if (currentWeek !== next) return;
      calendarLoading = false;
      calendarError = error.message;
      renderSheet();
    });
    drawEditor();
    if (draft.announcements.length) status.textContent = 'Loaded this week’s saved announcements.';
    refreshSponsorship();
  }
  async function refreshSponsorship() {
    const requestedWeek = currentWeek;
    if (!requestedWeek) return;
    const requestNumber = ++sponsorRequest;
    const saturday = localISO(addDays(state.friday, 1));
    const sponsorStatus = document.getElementById('sponsorBookingStatus');
    sponsorStatus.textContent = 'Checking Shalosh Seudos sponsorship…';
    sponsorStatus.classList.remove('error');
    try {
      const response = await fetch(SPONSORSHIP_ORIGIN + '/api/sponsorship?week=' + encodeURIComponent(saturday), { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('Sponsorship lookup failed');
      const data = await response.json();
      if (!Object.prototype.hasOwnProperty.call(data, 'sponsorship')) throw new Error('Invalid sponsorship response');
      if (requestedWeek !== currentWeek || requestNumber !== sponsorRequest) return;
      const booking = data.sponsorship;
      let index = draft.announcements.findIndex(a => a.bookingWeek === saturday);
      if (!booking) {
        if (index >= 0) { draft.announcements.splice(index, 1); drawEditor(); save(); }
        sponsorStatus.textContent = 'No sponsor booked for this Shabbos.';
        return;
      }
      if (booking.week !== saturday || typeof booking.sponsorName !== 'string' || typeof booking.dedication !== 'string') throw new Error('Invalid sponsorship response');
      if (index < 0) index = draft.announcements.findIndex(a => !a.bookingWeek && /^(?:shalosh|sholosh)\s+seudos$/i.test(a.title.trim()));
      const previous = index >= 0 ? draft.announcements[index] : null;
      const values = { title: 'SHALOSH SEUDOS', body: booking.dedication, names: booking.sponsorName };
      const announcement = previous ? { ...previous } : { title: '', subtitle: '', body: '', names: '', visible: true };
      for (const field of Object.keys(values)) {
        if (!previous?.bookingWeek || announcement[field] === previous.bookingValues?.[field]) announcement[field] = values[field];
      }
      if (/sponsorship available/i.test(announcement.subtitle)) announcement.subtitle = '';
      announcement.bookingWeek = saturday;
      announcement.bookingTopDefault = true;
      announcement.bookingValues = values;
      if (index >= 0) draft.announcements[index] = announcement;
      else index = draft.announcements.push(announcement) - 1;
      // Apply the top position once, then respect the editor's saved order.
      if (!previous?.bookingTopDefault && index > 0) draft.announcements.unshift(...draft.announcements.splice(index, 1));
      drawEditor(); save();
      sponsorStatus.textContent = 'Sponsor synced from the signup form. Local edits and visibility are kept.';
    } catch {
      if (requestedWeek !== currentWeek || requestNumber !== sponsorRequest) return;
      sponsorStatus.textContent = 'Could not refresh the sponsor. Saved announcements were kept. Try Refresh sponsor again.';
      sponsorStatus.classList.add('error');
    }
  }
  function scheduleHTML(rows) {
    const visible = rows.filter(r => !r.hiddenByMode);
    const mga = visible.find(r => !r.section && /קריאת שמע.*מג״א/.test(r.label || ''));
    const gra = visible.find(r => !r.section && /קריאת שמע.*גר״א/.test(r.label || ''));
    return visible.map(r => {
      if (r.section) return `<div class="sheet-section">${esc(r.label)}</div>`;
      if (r.footnote) return `<div class="sheet-footnote" dir="ltr">${esc(r.label)}</div>`;
      if (mga && gra && r === gra) return '';
      if (mga && gra && r === mga) {
        return `<div class="sheet-row"><span class="sheet-row-label">סו״ז ק״ש</span><span class="sheet-row-rule" aria-hidden="true"></span><span class="sheet-row-time sheet-ks-time"><span dir="rtl">מג״א <bdi dir="ltr">${esc(mga.time || '—')}</bdi></span><span aria-hidden="true">·</span><span dir="rtl">גר״א <bdi dir="ltr">${esc(gra.time || '—')}</bdi></span></span></div>`;
      }
      // Keep a group of minyan times together on one row, in reading order.
      const time = String(r.time || '—').split(/\s*[·,]\s*/).map(part => {
        const text = `<bdi dir="auto">${esc(part)}${(r.neitzTimes || []).includes(part.trim()) ? '*' : ''}</bdi>`;
        return (r.emphasizedTimes || []).includes(part.trim()) ? `<strong>${text}</strong>` : text;
      }).join(', ');
      const names = r.dayNames || [];
      const label = names.length > 1 ? `${names[0]}–${names[names.length - 1]}` : names[0] || scheduleDisplayLabel(r.label);
      const reason = r.reason ? `<span class="sheet-row-note">(${esc(r.reason)})</span>` : '';
      return `<div class="sheet-row"><span class="sheet-row-label ${names.length ? 'sheet-day-label' : ''}">${esc(label)}${reason}</span><span class="sheet-row-rule" aria-hidden="true"></span><span class="sheet-row-time">${time}</span></div>`;
    }).join('');
  }
  function renderSheet() {
    syncWeek();
    if (!state.friday) return;
    document.getElementById('sheetTitle').textContent = draft.title || calendarInfo?.parsha?.hebrew || (calendarLoading ? '' : 'שבת קודש');
    const mevorchim = calendarInfo?.mevorchim;
    document.getElementById('sheetMevorchim').textContent = mevorchim ? 'מברכים החודש · ' + String(mevorchim.hebrew || '').replace(/^מברכים\s+חודש\s+/, '') : '';
    const saturday = addDays(state.friday, 1);
    const fmt = { month: 'short', day: 'numeric' };
    document.getElementById('sheetDates').textContent = `${state.friday.toLocaleDateString('en-US', fmt)} – ${englishDateShortYear(saturday, fmt)}`;
    try {
      document.getElementById('sheetHebrewDate').textContent = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).format(saturday);
    } catch { document.getElementById('sheetHebrewDate').textContent = ''; }
    const hebrewParts = calendarInfo?.parsha?.heDateParts || mevorchim?.heDateParts;
    if (hebrewParts) document.getElementById('sheetHebrewDate').textContent = `${hebrewParts.d} ${hebrewParts.m} ${hebrewParts.y}`;
    document.getElementById('sheetWeekOf').textContent = 'Week of ' + addDays(state.friday, 2).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    document.getElementById('sheetShabbosRows').innerHTML = scheduleHTML(state.shabbos);
    document.getElementById('sheetWeekdayRows').innerHTML = scheduleHTML(state.weekday);
    document.getElementById('sheetAnnouncementContent').innerHTML = draft.announcements.filter(a => a.visible).map(a => `
      <section class="sheet-announcement" dir="auto">
        ${a.title ? `<h3 dir="auto">${esc(a.title)}</h3>` : ''}
        ${a.subtitle.trim() ? `<div class="sheet-announcement-subtitle" dir="auto">${esc(a.subtitle)}</div>` : ''}
        ${announcementDetailsHTML(a)}
      </section>`).join('');
    requestFit();
  }
  function announcementDetailsHTML(a) {
    const body = a.body ? `<div class="sheet-announcement-body" dir="auto">${esc(a.body)}</div>` : '';
    const name = a.names.trim();
    const sponsored = a.bookingWeek || /^(?:shalosh|sholosh)\s+seudos$/i.test(a.title.trim());
    const nameText = sponsored && name && !/^sponsored\s+by\b/i.test(name) ? `Sponsored by ${name}` : name;
    const names = nameText ? `<div class="sheet-announcement-names" dir="auto">${esc(nameText)}</div>` : '';
    return sponsored ? names + body : body + names;
  }
  function fitZone(zone, maximum, minimum) {
    const content = zone.firstElementChild;
    let size = maximum;
    content.style.fontSize = `${size}px`;
    while (content.scrollHeight > zone.clientHeight + 1 && size > minimum) {
      size = Math.max(minimum, size - 0.25);
      content.style.fontSize = `${size}px`;
    }
    return content.scrollHeight <= zone.clientHeight + 1 && content.scrollWidth <= zone.clientWidth + 1;
  }
  function fitSheet() {
    if (!sheet.offsetWidth) return false;
    const announcements = sheet.querySelector('.sheet-announcements');
    announcements.classList.remove('sheet-announcements-compact');
    let announcementsFit = fitZone(announcements, 15, 12);
    if (!announcementsFit) {
      // Recover space between announcements before reducing type further.
      announcements.classList.add('sheet-announcements-compact');
      announcementsFit = fitZone(announcements, 15, 11);
    }
    const scheduleFits = fitZone(sheet.querySelector('.sheet-zmanim'), 15.5, 12.5);
    const header = sheet.querySelector('.sheet-header-info');
    const title = document.getElementById('sheetTitle');
    let titleSize = 36;
    title.style.fontSize = `${titleSize}px`;
    while (header.scrollHeight > header.clientHeight + 1 && titleSize > 24) {
      titleSize -= 1;
      title.style.fontSize = `${titleSize}px`;
    }
    const headerFits = header.scrollHeight <= header.clientHeight + 1 && header.scrollWidth <= header.clientWidth + 1;
    const ready = !!state.raw && !!state.engine && document.getElementById('status').textContent === 'KZY loaded' && !calendarLoading && !calendarError;
    const ok = announcementsFit && scheduleFits && headerFits;
    const overflowing = [!announcementsFit && 'Announcements', !scheduleFits && 'Zmanim', !headerFits && 'Header'].filter(Boolean);
    fitStatus.classList.toggle('error', !ok || !!calendarError);
    fitStatus.textContent = calendarError ? `Parsha / Mevorchim calendar unavailable: ${calendarError}. Reload the page to retry.` : !ready ? 'Waiting for the complete weekly schedule and calendar. Refresh if it does not load.' : ok ? 'One-page preview. All content fits above the footer.' : `The ${overflowing.join(' and ')} section${overflowing.length === 1 ? '' : 's'} ${overflowing.length === 1 ? 'does' : 'do'} not fit on one page, even after automatic fitting. Shorten the text or uncheck an announcement’s “Show on sheet” box. Your saved text is kept.`;
    outputHint.hidden = ready && ok;
    outputHint.textContent = ready && ok ? '' : fitStatus.textContent;
    outputHint.classList.toggle('error', !ok || !!calendarError);
    if (ready && ok && /^Cannot (print|export) yet:/.test(exportStatus.textContent)) {
      exportStatus.hidden = true;
      exportStatus.textContent = '';
      exportStatus.classList.remove('error');
    }
    // A click must explain why output is blocked, rather than silently doing nothing.
    // Disable only while an actual operation is in progress.
    disableOutputs(backgroundPending || exportPending);
    return ready && ok;
  }
  function scalePreview() {
    const viewport = document.getElementById('sheetPreviewViewport');
    const parentWidth = viewport.parentElement.clientWidth - parseFloat(getComputedStyle(viewport.parentElement).paddingLeft) - parseFloat(getComputedStyle(viewport.parentElement).paddingRight);
    const scale = Math.min(1, Math.max(0, parentWidth) / 816);
    sheet.style.transform = `scale(${scale})`;
    viewport.style.width = `${816 * scale}px`;
    viewport.style.height = `${1056 * scale}px`;
  }
  function requestFit() {
    if (fitFrame) cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => { fitFrame = null; scalePreview(); fitSheet(); });
  }

  editor.addEventListener('input', e => {
    const property = e.target.dataset.property;
    const card = e.target.closest('[data-announcement]');
    if (!property || !card) return;
    draft.announcements[Number(card.dataset.announcement)][property] = property === 'visible' ? e.target.checked : e.target.value;
    save();
  });
  editor.addEventListener('click', e => {
    const button = e.target.closest('[data-action]');
    if (!button || button.dataset.action !== 'delete') return;
    const i = Number(button.closest('[data-announcement]').dataset.announcement);
    draft.announcements.splice(i, 1);
    drawEditor(); save();
  });

  function moveAnnouncement(from, to) {
    if (from === to || to < 0 || to >= draft.announcements.length) return;
    draft.announcements.splice(to, 0, ...draft.announcements.splice(from, 1));
    drawEditor(); save();
    editor.children[to].querySelector('.announcement-drag-handle').focus({ preventScroll: true });
  }
  function clearDropMarkers() {
    editor.querySelectorAll('.drop-before,.drop-after').forEach(card => card.classList.remove('drop-before', 'drop-after'));
  }
  function updateAnnouncementDrop() {
    const drag = announcementDrag;
    if (!drag?.active) return;
    clearDropMarkers();
    const cards = [...editor.children].filter(card => card !== drag.card);
    const next = cards.find(card => {
      const rect = card.getBoundingClientRect();
      return drag.y < rect.top + rect.height / 2;
    });
    drag.to = next ? cards.indexOf(next) : cards.length;
    drag.over = drag.x >= editor.getBoundingClientRect().left - 24 && drag.x <= editor.getBoundingClientRect().right + 24;
    if (drag.over && drag.to !== drag.from) {
      (next || cards[cards.length - 1])?.classList.add(next ? 'drop-before' : 'drop-after');
    }
    drag.badge.style.left = Math.min(window.innerWidth - drag.badge.offsetWidth - 8, Math.max(8, drag.x + 14)) + 'px';
    drag.badge.style.top = Math.max(8, Math.min(window.innerHeight - 50, drag.y + 14)) + 'px';
  }
  function scrollAnnouncementDrag() {
    const drag = announcementDrag;
    if (!drag?.active) return;
    if (drag.over) {
      const speed = drag.y < 70 ? -12 : drag.y > window.innerHeight - 70 ? 12 : 0;
      if (speed) window.scrollBy(0, speed);
    }
    updateAnnouncementDrop();
    drag.frame = requestAnimationFrame(scrollAnnouncementDrag);
  }
  function finishAnnouncementDrag(commit) {
    const drag = announcementDrag;
    if (!drag) return;
    announcementDrag = null;
    cancelAnimationFrame(drag.frame);
    drag.badge?.remove();
    drag.card.classList.remove('is-dragging');
    document.body.classList.remove('announcement-dragging');
    clearDropMarkers();
    if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
    if (commit && drag.active && drag.over && drag.week === currentWeek) moveAnnouncement(drag.from, drag.to);
  }
  editor.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.announcement-drag-handle');
    if (!handle || handle.disabled || e.button !== 0 || !e.isPrimary) return;
    finishAnnouncementDrag(false);
    const card = handle.closest('[data-announcement]');
    announcementDrag = { handle, card, pointerId: e.pointerId, from: Number(card.dataset.announcement),
      week: currentWeek, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false };
    handle.setPointerCapture(e.pointerId);
  });
  editor.addEventListener('pointermove', e => {
    const drag = announcementDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 5) {
      drag.active = true;
      drag.badge = document.createElement('div');
      drag.badge.className = 'announcement-drag-badge';
      drag.badge.textContent = draft.announcements[drag.from].title || 'Announcement ' + (drag.from + 1);
      document.body.appendChild(drag.badge);
      drag.card.classList.add('is-dragging');
      document.body.classList.add('announcement-dragging');
      updateAnnouncementDrop();
      scrollAnnouncementDrag();
    }
    updateAnnouncementDrop();
  });
  editor.addEventListener('pointerup', e => {
    if (e.pointerId === announcementDrag?.pointerId) finishAnnouncementDrag(true);
  });
  for (const event of ['pointercancel', 'lostpointercapture']) editor.addEventListener(event, e => {
    if (e.pointerId === announcementDrag?.pointerId) finishAnnouncementDrag(false);
  });
  window.addEventListener('blur', () => finishAnnouncementDrag(false));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && announcementDrag) finishAnnouncementDrag(false);
  });
  editor.addEventListener('keydown', e => {
    if (!e.target.matches('.announcement-drag-handle') || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    finishAnnouncementDrag(false);
    const from = Number(e.target.closest('[data-announcement]').dataset.announcement);
    moveAnnouncement(from, from + (e.key === 'ArrowUp' ? -1 : 1));
  });
  document.getElementById('sheetTitleInput').addEventListener('input', e => { draft.title = e.target.value; save(); });
  document.getElementById('addAnnouncement').onclick = () => {
    syncWeek();
    draft.announcements.push({ title: '', subtitle: '', body: '', names: '', visible: true });
    drawEditor(); save();
    editor.lastElementChild.querySelector('[data-property="title"]').focus();
  };
  document.getElementById('copyPreviousAnnouncements').onclick = () => {
    syncWeek();
    const previous = loadDraft(localISO(addDays(state.friday, -7)));
    // Append so existing work is never overwritten by a copy operation.
    draft.announcements.push(...previous.announcements.filter(a => !a.bookingWeek));
    drawEditor(); save();
    if (!previous.announcements.length) status.textContent = 'No saved announcements in the previous week.';
  };
  document.getElementById('backupAnnouncements').onclick = () => {
    syncWeek();
    const blob = new Blob([JSON.stringify({ version: 1, week: currentWeek, ...draft }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `KZY-Announcements-${currentWeek}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document.getElementById('refreshSponsorBooking').onclick = () => refreshSponsorship();
  window.addEventListener('focus', () => { if (!document.querySelector('.workspace').hidden) refreshSponsorship(); });
  document.getElementById('restoreAnnouncements').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const restored = validDraft(parsed);
      syncWeek();
      draft.title = restored.title;
      draft.announcements.push(...restored.announcements);
      drawEditor(); save();
      status.textContent = 'Backup imported into the selected week. Existing announcements were kept.';
    } catch (error) { status.textContent = `Could not restore: ${error.message}`; }
    e.target.value = '';
  };

  // IndexedDB keeps an original-size image without localStorage's small quota.
  function backgroundStore(mode, operation) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('kzy-weekly-stationery', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('assets', mode);
        const result = operation(tx.objectStore('assets'));
        tx.oncomplete = () => { db.close(); resolve(result.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Background save canceled')); };
      };
    });
  }
  function showBackground(blob) {
    if (backgroundUrl) URL.revokeObjectURL(backgroundUrl);
    backgroundUrl = blob ? URL.createObjectURL(blob) : null;
    background.src = backgroundUrl || ORIGINAL_BACKGROUND;
  }
  document.getElementById('sheetBackgroundUpload').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    backgroundPending = true;
    disableOutputs(true);
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Choose a PNG or JPEG');
      const probe = new Image();
      const url = URL.createObjectURL(file);
      try {
        probe.src = url;
        await probe.decode();
        if (Math.abs(probe.naturalWidth / probe.naturalHeight - 8.5 / 11) > 0.01) throw new Error('The image must have 8.5 × 11 portrait proportions');
      } finally { URL.revokeObjectURL(url); }
      await backgroundStore('readwrite', store => store.put(file, 'background'));
      showBackground(file);
      status.textContent = 'Background saved in this browser.';
    } catch (error) { status.textContent = `Could not replace background: ${error.message}`; }
    finally { backgroundPending = false; requestFit(); e.target.value = ''; }
  };
  document.getElementById('resetSheetBackground').onclick = async () => {
    try {
      await backgroundStore('readwrite', store => store.delete('background'));
      showBackground(null);
      status.textContent = 'Original background restored.';
    } catch (error) { status.textContent = `Could not reset background: ${error.message}`; }
  };
  backgroundStore('readonly', store => store.get('background')).then(blob => { if (blob) showBackground(blob); }).catch(() => {});

  const printMount = document.createElement('div');
  printMount.id = 'printSheetMount';
  document.body.appendChild(printMount);
  function mountPrintSheet() {
    const clone = sheet.cloneNode(true);
    clone.style.transform = 'none';
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    printMount.replaceChildren(clone);
  }
  document.getElementById('printWeeklySheet').onclick = async () => {
    if (backgroundPending || exportPending) return;
    exportStatus.hidden = false;
    exportStatus.classList.remove('error');
    exportStatus.textContent = 'Preparing Print / Save PDF…';
    renderSheet();
    try {
      if (document.fonts) await document.fonts.ready;
      await background.decode();
      if (!fitSheet()) {
        exportStatus.textContent = 'Cannot print yet: ' + fitStatus.textContent;
        exportStatus.classList.add('error');
        return;
      }
      mountPrintSheet();
      await printMount.querySelector('img').decode();
      exportStatus.textContent = 'Opening the print dialog. Choose “Save as PDF” to download a PDF.';
      window.print();
    } catch (error) { exportStatus.textContent = `Could not prepare printing: ${error.message}`; exportStatus.classList.add('error'); }
  };
  async function exportSheet(format) {
    if (backgroundPending || exportPending) return;
    exportPending = true;
    disableOutputs(true);
    exportStatus.hidden = false;
    exportStatus.classList.remove('error');
    exportStatus.textContent = `Preparing ${format.toUpperCase()}…`;
    let captureHost;
    let canvas;
    try {
      renderSheet();
      if (document.fonts) await document.fonts.ready;
      await background.decode();
      if (!fitSheet()) {
        exportStatus.textContent = 'Cannot export yet: ' + fitStatus.textContent;
        exportStatus.classList.add('error');
        return;
      }
      if (!window.htmlToImage?.toCanvas) throw new Error('Image exporter did not load. Refresh the page and retry.');
      const filename = `KZY-Weekly-${currentWeek}.${format === 'jpeg' ? 'jpg' : 'png'}`;
      // Freeze the complete sheet independently of preview scaling and later edits.
      const capture = sheet.cloneNode(true);
      capture.removeAttribute('id');
      capture.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      Object.assign(capture.style, { transform: 'none', width: '816px', height: '1056px', boxShadow: 'none', margin: '0' });
      captureHost = document.createElement('div');
      Object.assign(captureHost.style, { position: 'fixed', left: '-100000px', top: '0', width: '816px', height: '1056px', pointerEvents: 'none' });
      captureHost.setAttribute('aria-hidden', 'true');
      captureHost.appendChild(capture);
      document.body.appendChild(captureHost);
      canvas = await window.htmlToImage.toCanvas(capture, {
        width: 816, height: 1056, pixelRatio: 2550 / 816,
        backgroundColor: '#ffffff', style: { transform: 'none', boxShadow: 'none' }
      });
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not encode the image.')), mime, 0.95);
      });
      if (blob.type !== mime) throw new Error('This browser could not encode the requested image format.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      exportStatus.textContent = `Downloaded ${filename} · 2550 × 3300 pixels.`;
    } catch (error) {
      exportStatus.textContent = `Could not export ${format.toUpperCase()}: ${error.message}`;
      exportStatus.classList.add('error');
    } finally {
      captureHost?.remove();
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      exportPending = false;
      requestFit();
    }
  }
  document.getElementById('exportWeeklyPng').onclick = () => exportSheet('png');
  document.getElementById('exportWeeklyJpeg').onclick = () => exportSheet('jpeg');
  window.addEventListener('beforeprint', () => { fitSheet(); mountPrintSheet(); });
  window.addEventListener('resize', requestFit);
  new MutationObserver(requestFit).observe(document.querySelector('.workspace'), { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(requestFit).observe(document.getElementById('status'), { childList: true });
  if (window.ResizeObserver) new ResizeObserver(requestFit).observe(document.getElementById('sheetPreviewViewport').parentElement);
  background.addEventListener('load', requestFit);
  if (document.fonts) document.fonts.addEventListener('loadingdone', requestFit);

  // Every calculation, seasonal mode and manual time edit uses the existing renderer.
  const originalRenderPanel = window.renderPanel;
  window.renderPanel = function renderPanelWithSheet() { originalRenderPanel(); renderSheet(); };
  const originalRenderTitle = window.renderTitle;
  window.renderTitle = function renderTitleWithSheet() { originalRenderTitle(); renderSheet(); };
  renderSheet();
})();
