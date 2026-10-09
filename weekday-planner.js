(() => {
  const MODE_KEY = 'kzy-weekly:weekday-mincha-mode';
  const OFFSET_KEY = 'kzy-weekly:weekday-exact-offset';
  const PLAN_PREFIX = 'kzy-weekly:weekday-plan:';
  const rcCache = new Map();
  // Confirmed shul schedule exceptions to automatic legal-holiday minyanim.
  const NO_AUTOMATIC_845 = new Set(['2026-10-12']);

  const DAYS = [
    { add: 2, key: 'sun', label: 'יום א׳', ui: 'Sun', english: 'Sunday' },
    { add: 3, key: 'mon', label: 'יום ב׳', ui: 'Mon', english: 'Monday' },
    { add: 4, key: 'tue', label: 'יום ג׳', ui: 'Tue', english: 'Tuesday' },
    { add: 5, key: 'wed', label: 'יום ד׳', ui: 'Wed', english: 'Wednesday' },
    { add: 6, key: 'thu', label: 'יום ה׳', ui: 'Thu', english: 'Thursday' },
    { add: 7, key: 'fri', label: 'יום ו׳', ui: 'Fri', english: 'Friday' }
  ];

  const getMode = () => localStorage.getItem(MODE_KEY) || 'rounded13';
  const getOffset = () => {
    const n = Number(localStorage.getItem(OFFSET_KEY) || 15);
    return [13,14,15].includes(n) ? n : 15;
  };
  const planKey = () => PLAN_PREFIX + localISO(state.friday);
  const loadPlan = () => {
    try { return JSON.parse(localStorage.getItem(planKey()) || '{"days":{}}'); }
    catch { return { days: {} }; }
  };
  const savePlan = plan => localStorage.setItem(planKey(), JSON.stringify(plan));

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  const sameDate = (a,b) => localISO(a) === localISO(b);

  function observedFixedHoliday(year, month, day, name) {
    const actual = new Date(year, month, day, 12);
    const dow = actual.getDay();
    const observed = new Date(actual);
    if (dow === 6) observed.setDate(observed.getDate() - 1);
    if (dow === 0) observed.setDate(observed.getDate() + 1);
    return [{ date: actual, name }, ...(sameDate(actual, observed) ? [] : [{ date: observed, name: name + ' (observed)' }])];
  }

  function nthWeekday(year, month, weekday, n) {
    const d = new Date(year, month, 1, 12);
    const shift = (weekday - d.getDay() + 7) % 7;
    d.setDate(1 + shift + (n - 1) * 7);
    return d;
  }

  function lastWeekday(year, month, weekday) {
    const d = new Date(year, month + 1, 0, 12);
    d.setDate(d.getDate() - ((d.getDay() - weekday + 7) % 7));
    return d;
  }

  function legalHolidayName(date) {
    const years = [date.getFullYear() - 1, date.getFullYear(), date.getFullYear() + 1];
    const holidays = [];
    for (const y of years) {
      holidays.push(...observedFixedHoliday(y,0,1,"New Year's Day"));
      holidays.push({ date:nthWeekday(y,0,1,3), name:'Martin Luther King Jr. Day' });
      holidays.push({ date:nthWeekday(y,1,1,3), name:"Presidents' Day" });
      holidays.push({ date:lastWeekday(y,4,1), name:'Memorial Day' });
      holidays.push(...observedFixedHoliday(y,5,19,'Juneteenth'));
      holidays.push(...observedFixedHoliday(y,6,4,'Independence Day'));
      holidays.push({ date:nthWeekday(y,8,1,1), name:'Labor Day' });
      holidays.push({ date:nthWeekday(y,9,1,2), name:'Columbus Day' });
      holidays.push(...observedFixedHoliday(y,10,11,'Veterans Day'));
      holidays.push({ date:nthWeekday(y,10,4,4), name:'Thanksgiving' });
      holidays.push(...observedFixedHoliday(y,11,25,'Christmas Day'));
    }
    return holidays.find(h => sameDate(h.date, date))?.name || '';
  }

  async function roshChodeshDates(start, end) {
    const key = localISO(start) + ':' + localISO(end);
    if (rcCache.has(key)) return rcCache.get(key);
    try {
      const items = await window.kzyCalendar.events(localISO(start), localISO(end));
      const set = new Set(items
        .filter(x => x.category === 'roshchodesh' || /Rosh Chodesh/i.test(x.title || ''))
        .map(x => x.date));
      rcCache.set(key, set);
      return set;
    } catch (e) {
      state.diagnostics = [...(state.diagnostics || []), 'Rosh Chodesh lookup: ' + e.message];
      const empty = new Set();
      return empty;
    }
  }

  function fixedFromBoard(rows) {
    const shacharis = rows.filter(r => !r.section && /^שחרית/.test(r.label || '')).map(r => r.time).filter(Boolean);
    const minchaEarly = rows.find(r => !r.section && /מנחה מוקדמת/.test(r.label || ''))?.time || '1:45';
    const maariv = rows.filter(r => !r.section && r.label === 'מעריב').map(r => r.time).filter(Boolean);
    return {
      shacharisA: shacharis[0] || '6:45',
      shacharisB: shacharis[1] || '7:30',
      extraShacharis: shacharis[2] || '8:45',
      minchaEarly,
      maarivB: maariv[0] || '8:15',
      maarivC: maariv[1] || '9:45'
    };
  }

  function localClockParts(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: LOCATION.timeZoneId, hour:'2-digit', minute:'2-digit',
      second:'2-digit', hourCycle:'h23'
    }).formatToParts(d);
    const get = t => Number(parts.find(p => p.type === t)?.value);
    return { h:get('hour'), m:get('minute'), s:get('second') };
  }

  function laterMincha(date) {
    const z = getZmanim(date);
    const sunset = z.SeaLevelSunset;
    if (!sunset) return '';
    const mode = getMode();

    if (mode === 'exact') {
      const shifted = new Date(new Date(sunset).getTime() - getOffset() * 60000);
      return fmtDateTime(shifted.toISOString());
    }

    // Minimum 13 minutes before shkiah, then round DOWN to the prior :05.
    const threshold = new Date(new Date(sunset).getTime() - 13 * 60000);
    const p = localClockParts(threshold);
    if (!p) return '';
    const total = p.h * 60 + p.m;
    return clockFromLocalMinutes(Math.floor(total / 5) * 5);
  }

  function formatDateShort(date) {
    return date.toLocaleDateString('en-US', { month:'numeric', day:'numeric' });
  }

  function neitzMinyanTime(date) {
    const neitz = getZmanim(date).SeaLevelSunrise;
    const neitzMillis = new Date(neitz).getTime();
    if (!neitz || !Number.isFinite(neitzMillis)) throw new Error('Neitz is unavailable');
    // Use the same sea-level neitz as the holiday planner. Round the START
    // upward only, so adding 22 minutes cannot fall before actual neitz.
    const earliestMillis = Math.ceil((neitzMillis - 22 * 60000) / 60000) * 60000;
    const earliest = localClockParts(new Date(earliestMillis).toISOString());
    const earliestMinutes = earliest.h * 60 + earliest.m;
    // Seasonal starts use the nearest :05 of the exact Neitz-minus-22 time.
    const seasonalMillis = Math.round((neitzMillis - 22 * 60000) / (5 * 60000)) * 5 * 60000;
    const seasonal = localClockParts(new Date(seasonalMillis).toISOString());
    const seasonalMinutes = seasonal.h * 60 + seasonal.m;
    return {
      minutes: earliestMinutes, start: clockFromLocalMinutes(earliestMinutes),
      seasonalMinutes, seasonalStart: clockFromLocalMinutes(seasonalMinutes),
      neitz: fmtDateTime(neitz, 'sunrise')
    };
  }

  function shacharisClockMinutes(time) {
    const match = String(time).match(/^\s*(\d{1,2}):([0-5]\d)/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  function sundayNeitzLimit(times, timing) {
    const changedTimes = [];
    const adjusted = times.map(time => String(time).replace(/^\s*(\d{1,2}):([0-5]\d)/, (match, hours, minutes) => {
      const startMinutes = Number(hours) * 60 + Number(minutes);
      if (startMinutes >= timing.minutes) return match;
      const result = timing.start;
      changedTimes.push(result);
      return result;
    }));
    return { times: adjusted, changedTimes, neitz: timing.neitz, earliest: timing.start };
  }

  function addSeasonalNeitzMinyan(times, timing) {
    const clocks = times.map(shacharisClockMinutes);
    // Keep the regular early minyan and require at least five minutes between
    // minyanim. This means 6:50 after a 6:45 start, or 6:35 after RC's 6:30.
    // Sunday's shifted first minyan already serves neitz, so it is not added twice.
    const qualifies = clocks.some(minutes => minutes != null && timing.minutes - minutes >= 5) &&
      clocks.some(minutes => minutes != null && timing.seasonalMinutes - minutes >= 5) &&
      clocks.every(minutes => minutes == null || Math.abs(minutes - timing.seasonalMinutes) >= 5);
    if (!qualifies) return '';
    const insertAt = clocks.findIndex(minutes => minutes != null && minutes > timing.seasonalMinutes);
    times.splice(insertAt < 0 ? times.length : insertAt, 0, timing.seasonalStart);
    return timing.seasonalStart;
  }

  function bundleMatchingDayRows(rows, sourceLabel) {
    const bundled = [];
    for (const row of rows) {
      const last = bundled[bundled.length - 1];
      if (last && last.time === row.time && last.reason === row.reason && JSON.stringify(last.emphasizedTimes) === JSON.stringify(row.emphasizedTimes) && JSON.stringify(last.neitzTimes) === JSON.stringify(row.neitzTimes)) {
        last._days.push(row.label);
        last.dayNames.push(...(row.dayNames || []));
        last.label = last._days.length === 2
          ? `${last._days[0]}–${last._days[1].replace(/^יום\s*/, '')}`
          : `${last._days[0]}–${last._days[last._days.length - 1].replace(/^יום\s*/, '')}`;
        last.source = sourceLabel;
      } else {
        bundled.push({ ...row, _days:[row.label], dayNames:[...(row.dayNames || [])] });
      }
    }
    return bundled.map(({ _days, ...row }) => row);
  }

  function minchaSortMinutes(value) {
    const m = String(value || '').trim().match(/^(1[0-2]|[1-9]):([0-5][0-9])(?:\s*(am|pm))?$/i);
    if (!m) return Number.POSITIVE_INFINITY;
    const h = Number(m[1]) % 12;
    const part = (m[3] || 'pm').toLowerCase();
    return (h + (part === 'pm' ? 12 : 0)) * 60 + Number(m[2]);
  }

  // Calendar defaults, not a claim about this kollel's exact vacation dates.
  // Build a civil-date anchor so Hebrew dates do not depend on the browser zone.
  function kollelCalendar(date) {
    const anchor = new Date(localISO(date) + 'T12:00:00Z');
    const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', {
      timeZone: 'UTC', month: 'long', day: 'numeric'
    }).formatToParts(anchor);
    const month = parts.find(p => p.type === 'month')?.value;
    const day = Number(parts.find(p => p.type === 'day')?.value);
    const winter = ['Heshvan', 'Kislev', 'Tevet', 'Shevat', 'Adar', 'Adar I', 'Adar II'].includes(month);
    const summer = ['Iyar', 'Sivan', 'Tamuz'].includes(month) || (month === 'Av' && day <= 8);
    const elul = month === 'Elul' || (month === 'Tishri' && day >= 3 && day <= 8);
    const yomTov = (month === 'Sivan' && [6, 7].includes(day)) ||
      (month === 'Tishri' && [1, 2, 10, 15, 16, 22, 23].includes(day)) ||
      (month === 'Nisan' && [15, 16, 21, 22].includes(day));
    return { inSession: winter || summer || elul, yomTov };
  }

  function kollelMincha(date, manual = {}) {
    const calendar = kollelCalendar(date);
    const inSession = hasOwn(manual, 'kollelInSession') ? !!manual.kollelInSession : calendar.inSession;
    const base = { inSession, automatic: !hasOwn(manual, 'kollelInSession'), time: '', earliest: '' };
    if ([5, 6].includes(date.getDay())) return { ...base, reason: 'Sunday–Thursday only' };
    if (calendar.yomTov) return { ...base, reason: 'Yom Tov' };
    if (!inSession) return { ...base, reason: 'Kollel out of session' };
    // KosherZmanim's standard GRA Mincha Gedola. Compare unrounded seconds;
    // 1:15:00 qualifies, but 1:15:00.001 does not. Missing data fails closed.
    const earliest = getZmanim(date).MinchaGedola;
    const instant = earliest ? new Date(earliest) : null;
    const clock = instant && Number.isFinite(instant.getTime()) ? localClockParts(instant) : null;
    if (!clock) return { ...base, reason: 'Mincha Gedola unavailable — omitted' };
    const qualifies = clock.h * 3600000 + clock.m * 60000 + clock.s * 1000 + instant.getUTCMilliseconds() <= 13 * 3600000 + 15 * 60000;
    return { ...base, earliest: fmtDateTime(earliest, 'earliest-mincha'),
      time: qualifies ? '1:15' : '',
      reason: qualifies ? 'Kollel 1:15' : '1:15 is before Mincha Gedola' };
  }

  function combinedMinchaTimes(early, added, late) {
    const times = [early, added, late].filter(Boolean).filter((time, index, all) =>
      all.findIndex(other => other === time || (Number.isFinite(minchaSortMinutes(time)) && minchaSortMinutes(other) === minchaSortMinutes(time))) === index);
    // Preserve original order until the optional extra Mincha is set.
    if (!added) return times.join(' · ');
    return times.sort((a, b) => minchaSortMinutes(a) - minchaSortMinutes(b)).join(' · ');
  }

  async function buildWeekdayPlan() {
    const board = fixedFromBoard(state.weekday);
    const plan = loadPlan();
    const dates = DAYS.map(d => ({ ...d, date:addDays(state.friday, d.add) }));
    const rc = await roshChodeshDates(dates[0].date, dates[dates.length - 1].date);

    const shacharisRows = [];
    const minchaRows = [];
    const meta = [];

    for (const d of dates) {
      const dateKey = localISO(d.date);
      const manual = plan.days?.[dateKey] || {};
      const autoRc = rc.has(dateKey);
      const holiday = legalHolidayName(d.date);
      const auto845 = d.key === 'sun' || (!!holiday && !NO_AUTOMATIC_845.has(dateKey));

      const early630 = hasOwn(manual, 'early630') ? !!manual.early630 : autoRc;
      const extra845 = hasOwn(manual, 'extra845') ? !!manual.extra845 : auto845;

      let shacharisTimes = [
        early630 ? '6:30' : board.shacharisA,
        board.shacharisB
      ];
      if (extra845) shacharisTimes.push(board.extraShacharis);
      if (String(manual.shacharisCustom || '').trim()) {
        shacharisTimes = String(manual.shacharisCustom).trim().split(/\s*[·,;]\s*/);
      }
      const neitzTiming = neitzMinyanTime(d.date);
      const sunday = d.key === 'sun' ? sundayNeitzLimit(shacharisTimes, neitzTiming) : null;
      if (sunday) shacharisTimes = sunday.times;
      const firstShacharis = shacharisTimes[0];
      const neitzAdjusted = !!sunday?.changedTimes.length;
      const seasonalNeitz = addSeasonalNeitzMinyan(shacharisTimes, neitzTiming);
      const seasonalNeitzAdded = !!seasonalNeitz;
      const emphasizedTimes = [...new Set([
        ...(autoRc && firstShacharis !== board.shacharisA ? [firstShacharis] : []),
        ...(sunday?.changedTimes || []),
        ...(seasonalNeitzAdded ? [seasonalNeitz] : [])
      ])];
      shacharisTimes = shacharisTimes.join(' · ');

      shacharisRows.push({
        label: d.label,
        time: shacharisTimes,
        dayNames: [d.english],
        reason: autoRc ? 'Rosh Chodesh' : '',
        neitzTimes: [...new Set([...(sunday?.changedTimes || []), ...(seasonalNeitzAdded ? [seasonalNeitz] : [])])],
        emphasizedTimes,
        source: [
          autoRc ? 'Rosh Chodesh' : '',
          holiday || '',
          d.key === 'sun' ? 'Sunday 8:45' : '',
          neitzAdjusted ? 'Sunday: not earlier than 22 minutes before sea-level Neitz, rounded up to a whole minute' : '',
          seasonalNeitzAdded ? 'Additional seasonal Neitz minyan: ' + seasonalNeitz + ', rounded to nearest :05 and at least 5 minutes from other minyanim' : '',
          hasOwn(manual,'early630') || hasOwn(manual,'extra845') || manual.shacharisCustom ? 'manual adjustment' : ''
        ].filter(Boolean).join(' · '),
        weekdayPlanner: true
      });

      const kollel = kollelMincha(d.date, manual);
      if (d.key !== 'fri') {
        const autoMincha = laterMincha(d.date);
        minchaRows.push({
          label: d.label,
          dayNames: [d.english],
          time: combinedMinchaTimes(board.minchaEarly, kollel.time, String(manual.minchaCustom || '').trim() || autoMincha),
          source: 'Early Mincha fixed at ' + board.minchaEarly + ' · ' + kollel.reason + ' · ' + (manual.minchaCustom
            ? 'Manual later Mincha'
            : getMode() === 'exact'
              ? getOffset() + ' min before shkiah'
              : 'Minimum 13 min before shkiah; rounded down to :05'),
          weekdayPlanner: true
        });
      }

      meta.push({
        ...d, dateKey, autoRc, holiday, auto845, early630, extra845,
        neitz: neitzTiming.neitz, earliestSunday: sunday?.earliest || '', neitzAdjusted, firstShacharis,
        seasonalNeitzAdded, seasonalNeitz, kollel,
        shacharisCustom: manual.shacharisCustom || '',
        minchaCustom: manual.minchaCustom || ''
      });
    }

    state.weekday = [
      { section:true, label:'שחרית', time:'', source:'Weekday planner', weekdayPlanner:true },
      ...bundleMatchingDayRows(shacharisRows, 'Matching Shacharis times grouped'),
      ...(shacharisRows.some(row => row.neitzTimes.length) ? [{ footnote:true, label:'*Seasonal Neitz Minyan', time:'', source:'Weekday planner', weekdayPlanner:true }] : []),
      { section:true, label:'מנחה', time:'', source:'Weekday planner', weekdayPlanner:true },
      ...bundleMatchingDayRows(minchaRows, 'Matching Mincha times grouped'),
      { section:true, label:'מעריב', time:'', source:'Weekday planner', weekdayPlanner:true },
      { label:'מעריב', time:['שקיעה', board.maarivB, board.maarivC].filter(Boolean).join(' · '), source:'KZY: at shkiah + fixed minyanim', weekdayPlanner:true }
    ];

    state.weekdayPlannerMeta = meta;
    state.weekdayPlannerBoard = board;
  }

  function injectPlannerUI() {
    if (document.getElementById('weekdayPlannerCard')) return;
    const card = document.createElement('div');
    card.id = 'weekdayPlannerCard';
    card.innerHTML = `
      <style>
        #weekdayPlannerCard{margin:12px 0 4px;padding:14px 16px;border:1px solid #d7dbe2;border-radius:10px;background:#fafaf9}
        #weekdayPlannerCard .wp-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
        #weekdayPlannerCard .wp-title{font-size:11px;font-weight:800;letter-spacing:.08em;color:#8a6b32;text-transform:uppercase;margin-bottom:7px}
        #weekdayPlannerCard .wp-seg{display:flex;gap:6px;flex-wrap:wrap}
        #weekdayPlannerCard button,#weekdayPlannerCard select,#weekdayPlannerCard input{font:inherit}
        #weekdayPlannerCard .wp-btn{padding:7px 10px;border:1px solid #cbd2dc;border-radius:7px;background:white;cursor:pointer}
        #weekdayPlannerCard .wp-btn.active{background:#18263e;color:white;border-color:#18263e}
        #weekdayPlannerCard select,#weekdayPlannerCard input[type=text]{border:1px solid #cbd2dc;border-radius:7px;padding:6px 8px;background:white}
        #weekdayPlannerCard .wp-offset{display:flex;align-items:center;gap:7px;font-size:12px;color:#536070}
        #weekdayPlannerCard .wp-added{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:12px;font-size:12px;color:#536070}
        #weekdayPlannerCard .wp-added input{width:98px}
        #weekdayPlannerCard .wp-added small{font-size:11px;color:#687386}
        #weekdayPlannerCard .wp-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
        #weekdayPlannerCard .wp-table th{text-align:left;color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:6px;border-bottom:1px solid #d7dbe2}
        #weekdayPlannerCard .wp-table td{padding:7px 6px;border-bottom:1px solid #eceff3;vertical-align:middle}
        #weekdayPlannerCard .wp-day{font-weight:700;white-space:nowrap}
        #weekdayPlannerCard .wp-date{font-weight:400;color:#7a8492;margin-left:4px}
        #weekdayPlannerCard .wp-auto{font-size:10px;color:#8a6b32;margin-top:2px}
        #weekdayPlannerCard .wp-small{width:96px}
        #weekdayPlannerCard .wp-wide{width:170px}
        #weekdayPlannerCard .wp-note{margin-top:8px;font-size:11px;color:#687386}
        @media(max-width:900px){
          #weekdayPlannerCard .wp-table{display:block;overflow-x:auto;white-space:nowrap}
        }
      </style>
      <div class="wp-head">
        <div>
          <div class="wp-title">Later weekday Mincha</div>
          <div class="wp-seg">
            <button type="button" class="wp-btn" data-mincha-mode="rounded13">Round to :05 · minimum 13 min</button>
            <button type="button" class="wp-btn" data-mincha-mode="exact">Exact offset</button>
          </div>
        </div>
        <label class="wp-offset">Exact offset
          <select id="weekdayExactOffset">
            <option value="13">13 min</option>
            <option value="14">14 min</option>
            <option value="15">15 min</option>
          </select>
          before shkiah
        </label>
      </div>
      <div class="wp-added"><strong>Kollel Mincha · 1:15 PM · Sun–Thu</strong>
        <small>Only during zman and at or after Mincha Gedola. Use the daily selector for kollel exceptions.</small>
      </div>
      <div class="wp-note">Default zman: 1 Cheshvan–end of Adar; 1 Iyar–8 Av; 1 Elul–8 Tishrei. No Yom Tov. These are estimated kollel dates; override any exception below. Mincha Gedola uses the standard GRA calculation.</div>
      <div id="weekdayAdjustments"></div>
      <div class="wp-note">Rosh Chodesh normally changes the first Shacharis from 6:45 to 6:30. On Sundays, Shacharis starts no earlier than 22 minutes before Neitz, rounded up to a whole minute, including custom times. An additional seasonal Neitz minyan qualifies when the calculated start is at least 5 minutes after an earlier minyan: normally 6:50 or later, or 6:35 or later on Rosh Chodesh. Its start is rounded to the nearest :05 and must remain at least 5 minutes from every other minyan. Matching days are bundled. The regular early minyan remains. Sunday's shifted minyan is never duplicated. Sunday and U.S. federal legal holidays automatically add 8:45, except confirmed shul schedule exceptions (October 12, '26). Any day can be manually changed for Bein Hazmanim or another special schedule.</div>
    `;
    const anchor = document.getElementById('scheduleModeCard') || document.getElementById('weekTitle');
    anchor.insertAdjacentElement('afterend', card);

    card.querySelectorAll('[data-mincha-mode]').forEach(btn => {
      btn.addEventListener('click', async () => {
        localStorage.setItem(MODE_KEY, btn.dataset.minchaMode);
        await window.refresh();
      });
    });
    card.querySelector('#weekdayExactOffset').addEventListener('change', async e => {
      localStorage.setItem(OFFSET_KEY, e.target.value);
      await window.refresh();
    });
  }

  function updatePlannerUI() {
    injectPlannerUI();
    const mode = getMode();
    document.querySelectorAll('#weekdayPlannerCard [data-mincha-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.minchaMode === mode);
    });
    document.getElementById('weekdayExactOffset').value = String(getOffset());
    document.getElementById('weekdayExactOffset').disabled = mode !== 'exact';

    const meta = state.weekdayPlannerMeta || [];
    const wrap = document.getElementById('weekdayAdjustments');
    wrap.innerHTML = `
      <table class="wp-table">
        <thead><tr>
          <th>Day</th><th>6:30 first</th><th>+ 8:45</th><th>Custom Shacharis</th><th>Later Mincha override</th><th>Kollel 1:15</th>
        </tr></thead>
        <tbody>
          ${meta.map(d => {
            const auto = [d.autoRc ? 'Rosh Chodesh' : '', d.holiday || '', d.key === 'sun' ? 'Sunday' : ''].filter(Boolean).join(' · ');
            return `<tr>
              <td class="wp-day">${d.ui}<span class="wp-date">${formatDateShort(d.date)}</span>${auto ? '<div class="wp-auto">'+esc(auto)+'</div>' : ''}${d.earliestSunday ? '<div class="wp-auto">Neitz '+esc(d.neitz)+' · earliest '+esc(d.earliestSunday)+'</div>' : ''}${d.seasonalNeitz ? '<div class="wp-auto">Seasonal Neitz minyan '+esc(d.seasonalNeitz)+'</div>' : ''}</td>
              <td><input type="checkbox" data-day="${d.dateKey}" data-field="early630" ${d.early630 ? 'checked' : ''}></td>
              <td><input type="checkbox" data-day="${d.dateKey}" data-field="extra845" ${d.extra845 ? 'checked' : ''}></td>
              <td><input class="wp-wide" type="text" data-day="${d.dateKey}" data-field="shacharisCustom" value="${esc(d.shacharisCustom)}" placeholder="e.g. 6:30 · 7:30 · 8:45"></td>
              <td>${d.key === 'fri' ? '—' : '<input class="wp-small" type="text" data-day="'+d.dateKey+'" data-field="minchaCustom" value="'+esc(d.minchaCustom)+'" placeholder="auto">'}</td>
              <td>${d.key === 'fri' ? '—' : `<select data-day="${d.dateKey}" data-field="kollelInSession" aria-label="Kollel session ${d.english}">
                <option value="" ${d.kollel.automatic ? 'selected' : ''}>Auto (${d.kollel.inSession ? 'in session' : 'out'})</option>
                <option value="on" ${!d.kollel.automatic && d.kollel.inSession ? 'selected' : ''}>In session</option>
                <option value="off" ${!d.kollel.automatic && !d.kollel.inSession ? 'selected' : ''}>Out of session</option>
              </select><div class="wp-auto">${esc(d.kollel.reason)}${d.kollel.earliest ? ' · Mincha Gedola ' + esc(d.kollel.earliest) : ''}</div>`}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    wrap.querySelectorAll('input[data-day], select[data-day]').forEach(input => {
      const eventName = input.type === 'checkbox' ? 'change' : 'change';
      input.addEventListener(eventName, async () => {
        const plan = loadPlan();
        plan.days ||= {};
        plan.days[input.dataset.day] ||= {};
        if (input.dataset.field === 'kollelInSession') {
          if (input.value === '') delete plan.days[input.dataset.day].kollelInSession;
          else plan.days[input.dataset.day].kollelInSession = input.value === 'on';
        } else if (input.type === 'checkbox') {
          plan.days[input.dataset.day][input.dataset.field] = input.checked;
        } else {
          const value = input.value.trim();
          if (value) plan.days[input.dataset.day][input.dataset.field] = value;
          else delete plan.days[input.dataset.day][input.dataset.field];
        }
        savePlan(plan);
        await window.refresh();
      });
    });
  }

  const baseRefresh = window.refresh;
  window.refresh = async function refreshWithWeekdayPlanner() {
    await baseRefresh();
    await buildWeekdayPlan();
    render();
    updatePlannerUI();
  };

  const refreshButton = document.getElementById('refresh');
  if (refreshButton) refreshButton.onclick = () => window.refresh();

  const clearButton = document.getElementById('clearOverrides');
  if (clearButton) {
    clearButton.onclick = async () => {
      localStorage.removeItem(storageKey());
      localStorage.removeItem(planKey());
      await window.refresh();
    };
  }

  window.refresh();
})();
