(() => {
  const MODE_KEY = 'kzy-weekly:weekday-mincha-mode';
  const OFFSET_KEY = 'kzy-weekly:weekday-exact-offset';
  const PLAN_PREFIX = 'kzy-weekly:weekday-plan:';
  const rcCache = new Map();

  const DAYS = [
    { add: 2, key: 'sun', label: 'יום א׳', ui: 'Sun' },
    { add: 3, key: 'mon', label: 'יום ב׳', ui: 'Mon' },
    { add: 4, key: 'tue', label: 'יום ג׳', ui: 'Tue' },
    { add: 5, key: 'wed', label: 'יום ד׳', ui: 'Wed' },
    { add: 6, key: 'thu', label: 'יום ה׳', ui: 'Thu' },
    { add: 7, key: 'fri', label: 'יום ו׳', ui: 'Fri' }
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
      const url = 'https://www.hebcal.com/hebcal?v=1&cfg=json&nx=on&i=off&start=' +
        encodeURIComponent(localISO(start)) + '&end=' + encodeURIComponent(localISO(end));
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error('Hebcal ' + res.status);
      const json = await res.json();
      const set = new Set((json.items || [])
        .filter(x => x.category === 'roshchodesh' || /Rosh Chodesh/i.test(x.title || ''))
        .map(x => x.date));
      rcCache.set(key, set);
      return set;
    } catch (e) {
      state.diagnostics = [...(state.diagnostics || []), 'Rosh Chodesh lookup: ' + e.message];
      const empty = new Set();
      rcCache.set(key, empty);
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
      const auto845 = d.key === 'sun' || !!holiday;

      const early630 = hasOwn(manual, 'early630') ? !!manual.early630 : autoRc;
      const extra845 = hasOwn(manual, 'extra845') ? !!manual.extra845 : auto845;

      let shacharisTimes = [
        early630 ? '6:30' : board.shacharisA,
        board.shacharisB
      ];
      if (extra845) shacharisTimes.push(board.extraShacharis);
      if (String(manual.shacharisCustom || '').trim()) {
        shacharisTimes = String(manual.shacharisCustom).trim();
      } else {
        shacharisTimes = shacharisTimes.join(' · ');
      }

      shacharisRows.push({
        label: d.label,
        time: shacharisTimes,
        source: [
          autoRc ? 'Rosh Chodesh' : '',
          holiday || '',
          d.key === 'sun' ? 'Sunday 8:45' : '',
          hasOwn(manual,'early630') || hasOwn(manual,'extra845') || manual.shacharisCustom ? 'manual adjustment' : ''
        ].filter(Boolean).join(' · '),
        weekdayPlanner: true
      });

      if (d.key !== 'fri') {
        const autoMincha = laterMincha(d.date);
        minchaRows.push({
          label: d.label,
          time: String(manual.minchaCustom || '').trim() || autoMincha,
          source: manual.minchaCustom
            ? 'Manual later Mincha'
            : getMode() === 'exact'
              ? getOffset() + ' min before shkiah'
              : 'Minimum 13 min before shkiah; rounded down to :05',
          weekdayPlanner: true
        });
      }

      meta.push({
        ...d, dateKey, autoRc, holiday, auto845, early630, extra845,
        shacharisCustom: manual.shacharisCustom || '',
        minchaCustom: manual.minchaCustom || ''
      });
    }

    state.weekday = [
      { section:true, label:'שחרית', time:'', source:'Weekday planner', weekdayPlanner:true },
      ...shacharisRows,
      { section:true, label:'מנחה', time:'', source:'Weekday planner', weekdayPlanner:true },
      { label:'מנחה מוקדמת', time:board.minchaEarly, source:'KZY fixed', weekdayPlanner:true },
      ...minchaRows,
      { section:true, label:'מעריב', time:'', source:'Weekday planner', weekdayPlanner:true },
      { label:'בשקיעה', time:'שקיעה', source:'KZY: at shkiah', weekdayPlanner:true },
      { label:'מעריב', time:[board.maarivB, board.maarivC].filter(Boolean).join(' · '), source:'KZY fixed', weekdayPlanner:true }
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
      <div id="weekdayAdjustments"></div>
      <div class="wp-note">Rosh Chodesh automatically changes the first Shacharis from 6:45 to 6:30. Sunday and U.S. federal legal holidays automatically add 8:45. Any day can be manually changed for Bein Hazmanim or another special schedule.</div>
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
          <th>Day</th><th>6:30 first</th><th>+ 8:45</th><th>Custom Shacharis</th><th>Later Mincha override</th>
        </tr></thead>
        <tbody>
          ${meta.map(d => {
            const auto = [d.autoRc ? 'Rosh Chodesh' : '', d.holiday || '', d.key === 'sun' ? 'Sunday' : ''].filter(Boolean).join(' · ');
            return `<tr>
              <td class="wp-day">${d.ui}<span class="wp-date">${formatDateShort(d.date)}</span>${auto ? '<div class="wp-auto">'+esc(auto)+'</div>' : ''}</td>
              <td><input type="checkbox" data-day="${d.dateKey}" data-field="early630" ${d.early630 ? 'checked' : ''}></td>
              <td><input type="checkbox" data-day="${d.dateKey}" data-field="extra845" ${d.extra845 ? 'checked' : ''}></td>
              <td><input class="wp-wide" type="text" data-day="${d.dateKey}" data-field="shacharisCustom" value="${esc(d.shacharisCustom)}" placeholder="e.g. 6:30 · 7:30 · 8:45"></td>
              <td>${d.key === 'fri' ? '—' : '<input class="wp-small" type="text" data-day="'+d.dateKey+'" data-field="minchaCustom" value="'+esc(d.minchaCustom)+'" placeholder="auto">'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    wrap.querySelectorAll('input[data-day]').forEach(input => {
      const eventName = input.type === 'checkbox' ? 'change' : 'change';
      input.addEventListener(eventName, async () => {
        const plan = loadPlan();
        plan.days ||= {};
        plan.days[input.dataset.day] ||= {};
        if (input.type === 'checkbox') {
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