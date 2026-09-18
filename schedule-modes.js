(() => {
  const SEASON_KEY = 'kzy-weekly:season-mode';
  const SPECIAL_PREFIX = 'kzy-weekly:special-mode:';
  const SPECIAL_TIMES_PREFIX = 'kzy-weekly:special-times:';

  const getWeekKey = () => localISO(state.friday);
  const getSeason = () => {
    const saved = localStorage.getItem(SEASON_KEY);
    // Migrate the original two-mode control to the new three-season model.
    if (saved === 'shalosh') return 'winter';
    if (saved === 'no-shalosh') return 'summer-no-ss';
    return saved || 'winter';
  };
  const seasonHasShaloshSeudos = season =>
    season === 'winter' || season === 'summer-ss';
  const getSpecial = () => {
    const saved = localStorage.getItem(SPECIAL_PREFIX + getWeekKey());
    if (saved) return saved;
    // Known Shabbos Shuva for the current 5787 sheet.
    return getWeekKey() === '2026-09-18' ? 'shabbos-shuva' : 'normal';
  };
  const getSpecialTimes = () => {
    try {
      return JSON.parse(localStorage.getItem(SPECIAL_TIMES_PREFIX + getWeekKey()) || '{}');
    } catch {
      return {};
    }
  };
  const setSpecialTimes = data =>
    localStorage.setItem(SPECIAL_TIMES_PREFIX + getWeekKey(), JSON.stringify(data));
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

  const SPECIAL_ROWS = [
    { key: 'men', label: 'דרשת שבת שובה – אנשים', ui: 'Men’s drasha' },
    { key: 'ladies', label: 'דרשת שבת שובה – נשים', ui: 'Ladies’ drasha' },
    { key: 'children', label: 'דרשת שבת שובה – ילדים', ui: 'Children’s drasha' }
  ];

  function stableRowKey(row, group) {
    const id = row?.raw?.id ?? row?.raw?.uuid ?? row?.raw?._id;
    if (id != null) return `${group}:id:${id}`;
    return `${group}:calc:${row?.label || ''}|${row?.source || ''}`;
  }

  // Replace index-based overrides with stable row keys so schedule modes can
  // insert/remove special rows without shifting saved manual edits.
  window.saveOverrides = function saveOverridesStable() {
    const data = { version: 2, shabbos: {}, weekday: {} };
    state.shabbos.forEach(r => {
      if (!r.modeOwned) data.shabbos[stableRowKey(r, 'shabbos')] = r.time;
    });
    state.weekday.forEach(r => {
      if (!r.modeOwned) data.weekday[stableRowKey(r, 'weekday')] = r.time;
    });
    localStorage.setItem(storageKey(), JSON.stringify(data));
  };

  window.applyOverrides = function applyOverridesStable() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(storageKey()) || '{}'); } catch {}

    if (o?.version === 2) {
      state.shabbos.forEach(r => {
        const v = o.shabbos?.[stableRowKey(r, 'shabbos')];
        if (v != null) r.time = v;
      });
      state.weekday.forEach(r => {
        const v = o.weekday?.[stableRowKey(r, 'weekday')];
        if (v != null) r.time = v;
      });
      return;
    }

    // Read legacy index-based saves, but future saves use stable keys.
    if (Array.isArray(o.shabbos)) {
      o.shabbos.forEach((v, i) => { if (state.shabbos[i] && v != null) state.shabbos[i].time = v; });
    }
    if (Array.isArray(o.weekday)) {
      o.weekday.forEach((v, i) => { if (state.weekday[i] && v != null) state.weekday[i].time = v; });
    }
  };

  function lastIndex(rows, predicate, before = rows.length) {
    for (let i = Math.min(before - 1, rows.length - 1); i >= 0; i--) {
      if (predicate(rows[i], i)) return i;
    }
    return -1;
  }

  function clockMinutes(value) {
    const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 12) h += 12;
    return h * 60 + min;
  }

  function seasonalMinchaTime() {
    const shkia = state.engine?.shabbos?.SeaLevelSunset;
    const shown = fmtDateTime(shkia);
    const mins = clockMinutes(shown);
    if (mins == null) return '';
    // At least 35 minutes before shkiah, rounded DOWN to the prior :05.
    // This produces a 35–39 minute buffer (e.g. 6:58 shkiah -> 6:20).
    return clockFromLocalMinutes(Math.floor((mins - 35) / 5) * 5);
  }

  function shabbosShuvaDefaultTimes() {
    const lateMinchaIndex = lastIndex(state.shabbos, r => !r.section && r.label === 'מנחה ב׳');
    const minchaTime = lateMinchaIndex >= 0 ? state.shabbos[lateMinchaIndex].time : '';
    const minchaMinutes = clockMinutes(minchaTime);
    if (minchaMinutes == null) return { men:'', ladies:'', children:'' };

    const menMinutes = minchaMinutes - 50;
    return {
      men: clockFromLocalMinutes(menMinutes),
      ladies: clockFromLocalMinutes(menMinutes - 70),
      children: ''
    };
  }

  function effectiveShabbosShuvaTimes(saved) {
    const defaults = shabbosShuvaDefaultTimes();
    const men = hasOwn(saved, 'men') ? saved.men : defaults.men;
    const menMinutes = clockMinutes(men);
    const ladiesDefault = menMinutes == null ? '' : clockFromLocalMinutes(menMinutes - 70);
    return {
      men,
      ladies: hasOwn(saved, 'ladies') ? saved.ladies : ladiesDefault,
      children: hasOwn(saved, 'children') ? saved.children : ''
    };
  }

  function applyScheduleModes() {
    // Remove previously injected special rows before recalculating.
    state.shabbos = state.shabbos.filter(r => !r.modeOwned);
    state.shabbos.forEach(r => {
      delete r.hiddenByMode;
      if (r.modeCalculated) {
        delete r.modeCalculated;
      }
    });

    const season = getSeason();
    const special = getSpecial();

    // Winter omits Pirkei Avos entirely. Summer modes keep it if the KZY
    // board supplies it.
    if (season === 'winter') {
      state.shabbos.forEach(r => {
        if (!r.section && r.label === 'פרקי אבות') r.hiddenByMode = true;
      });
    }

    const minchaBIndex = lastIndex(state.shabbos, r => !r.section && r.label === 'מנחה ב׳');
    if (seasonHasShaloshSeudos(season) && minchaBIndex >= 0) {
      const minchaTime = seasonalMinchaTime();
      if (minchaTime) {
        const mincha = state.shabbos[minchaBIndex];
        mincha.time = minchaTime;
        mincha.source = 'Seasonal: 35–40 min before Shkia, rounded down to :05';
        mincha.modeCalculated = true;

        // Regular weekly afternoon shiur = 30 minutes before the late Mincha.
        const shiurIndex = lastIndex(
          state.shabbos,
          r => !r.section && r.label === 'שיעור',
          minchaBIndex
        );
        if (shiurIndex >= 0) {
          if (special === 'shabbos-shuva') {
            state.shabbos[shiurIndex].hiddenByMode = true;
          } else {
            const m = clockMinutes(minchaTime);
            if (m != null) {
              state.shabbos[shiurIndex].time = clockFromLocalMinutes(m - 30);
              state.shabbos[shiurIndex].source = 'Seasonal: 30 min before late Mincha';
              state.shabbos[shiurIndex].modeCalculated = true;
            }
          }
        }
      }
    } else if (special === 'shabbos-shuva' && minchaBIndex >= 0) {
      // Even outside the Shalosh Seudos rule, Shabbos Shuva suppresses only
      // the regular afternoon shiur, not the earlier Shabbos-morning shiur.
      const shiurIndex = lastIndex(
        state.shabbos,
        r => !r.section && r.label === 'שיעור',
        minchaBIndex
      );
      if (shiurIndex >= 0) state.shabbos[shiurIndex].hiddenByMode = true;
    }

    if (special === 'shabbos-shuva') {
      const times = getSpecialTimes();
      const effective = effectiveShabbosShuvaTimes(times);
      const lateMinchaIndex = lastIndex(state.shabbos, r => !r.section && r.label === 'מנחה ב׳');
      const specialRows = SPECIAL_ROWS.map(item => ({
        label: item.label,
        time: effective[item.key],
        source: item.key === 'men'
          ? 'Shabbos Shuva: 50 min before Mincha'
          : item.key === 'ladies'
            ? 'Shabbos Shuva: 1:10 before men’s drasha'
            : 'Shabbos Shuva special schedule',
        modeOwned: true
      }));

      // Put the special drashos immediately before the late Mincha. Their
      // actual clock times are entered above and can be adjusted week-by-week.
      const insertAt = lateMinchaIndex >= 0 ? lateMinchaIndex : state.shabbos.length;
      state.shabbos.splice(insertAt, 0, ...specialRows);
    }
  }

  const baseRowsHTML = window.rowsHTML;
  window.rowsHTML = function rowsHTMLWithModes(rows) {
    return baseRowsHTML(rows.filter(r => !r.hiddenByMode));
  };

  const baseEditorRows = window.editorRows;
  window.editorRows = function editorRowsWithModes() {
    baseEditorRows();
    const all = [
      ...state.shabbos.map(r => ({ group: 'shabbos', r })),
      ...state.weekday.map(r => ({ group: 'weekday', r }))
    ];
    const fields = [...document.querySelectorAll('#fields > .field')];
    all.forEach((x, i) => {
      if (!fields[i]) return;
      if (x.r.hiddenByMode || x.r.modeOwned) fields[i].style.display = 'none';
    });
  };

  const baseBuildSVG = window.buildSVG;
  window.buildSVG = function buildSVGWithModes() {
    const original = state.shabbos;
    state.shabbos = original.filter(r => !r.hiddenByMode);
    try {
      return baseBuildSVG();
    } finally {
      state.shabbos = original;
    }
  };

  function injectUI() {
    if (document.getElementById('scheduleModeCard')) return;
    const card = document.createElement('div');
    card.id = 'scheduleModeCard';
    card.innerHTML = `
      <style>
        #scheduleModeCard{margin:14px 0 4px;padding:14px 16px;border:1px solid #d7dbe2;border-radius:10px;background:#fafaf9}
        #scheduleModeCard .mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        #scheduleModeCard .mode-title{font-size:11px;font-weight:800;letter-spacing:.08em;color:#8a6b32;margin-bottom:7px;text-transform:uppercase}
        #scheduleModeCard .seg{display:flex;gap:6px;flex-wrap:wrap}
        #scheduleModeCard button,#scheduleModeCard select,#scheduleModeCard input{font:inherit}
        #scheduleModeCard .mode-btn{padding:7px 10px;border:1px solid #cbd2dc;border-radius:7px;background:white;cursor:pointer}
        #scheduleModeCard .mode-btn.active{background:#18263e;color:white;border-color:#18263e}
        #scheduleModeCard select,#scheduleModeCard input{border:1px solid #cbd2dc;border-radius:7px;padding:7px 9px;background:white}
        #scheduleModeCard .special-times{display:grid;grid-template-columns:repeat(3,minmax(110px,1fr));gap:8px;margin-top:10px}
        #scheduleModeCard .special-times label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:#536070}
        #scheduleModeCard .mode-note{margin-top:8px;font-size:11px;color:#687386}
        @media(max-width:760px){#scheduleModeCard .mode-grid{grid-template-columns:1fr}#scheduleModeCard .special-times{grid-template-columns:1fr}}
      </style>
      <div class="mode-grid">
        <div>
          <div class="mode-title">Season</div>
          <div class="seg">
            <button type="button" class="mode-btn" data-season="winter">Winter season</button>
            <button type="button" class="mode-btn" data-season="summer-ss">Summer season · with SS</button>
            <button type="button" class="mode-btn" data-season="summer-no-ss">Summer season · without SS</button>
          </div>
          <div class="mode-note" id="seasonRuleNote"></div>
        </div>
        <div>
          <div class="mode-title">This Shabbos</div>
          <select id="specialSchedule">
            <option value="normal">Regular schedule</option>
            <option value="shabbos-shuva">Shabbos Shuva</option>
          </select>
          <div id="specialTimes" class="special-times"></div>
          <div class="mode-note" id="specialRuleNote"></div>
        </div>
      </div>`;
    document.getElementById('weekTitle').insertAdjacentElement('afterend', card);

    card.querySelectorAll('[data-season]').forEach(btn => {
      btn.addEventListener('click', async () => {
        localStorage.setItem(SEASON_KEY, btn.dataset.season);
        await window.refresh();
      });
    });

    card.querySelector('#specialSchedule').addEventListener('change', async e => {
      localStorage.setItem(SPECIAL_PREFIX + getWeekKey(), e.target.value);
      await window.refresh();
    });
  }

  function updateModeUI() {
    injectUI();
    const season = getSeason();
    const special = getSpecial();

    document.querySelectorAll('#scheduleModeCard [data-season]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.season === season);
    });

    const select = document.getElementById('specialSchedule');
    select.value = special;

    const seasonNote = document.getElementById('seasonRuleNote');
    if (season === 'winter') {
      seasonNote.textContent = 'Shalosh Seudos in shul. Late Mincha: 35–40 min before shkiah, to the prior :05. Regular shiur: 30 min before Mincha. Pirkei Avos removed.';
    } else if (season === 'summer-ss') {
      seasonNote.textContent = 'Shalosh Seudos in shul. Late Mincha: 35–40 min before shkiah, to the prior :05. Regular shiur: 30 min before Mincha. Pirkei Avos remains.';
    } else {
      seasonNote.textContent = 'No Shalosh Seudos in shul. Uses the normal KZY board times for late Mincha and the regular shiur. Pirkei Avos remains.';
    }

    const wrap = document.getElementById('specialTimes');
    if (special === 'shabbos-shuva') {
      const times = getSpecialTimes();
      const effective = effectiveShabbosShuvaTimes(times);
      wrap.innerHTML = SPECIAL_ROWS.map(item => {
        const value = effective[item.key];
        const auto = item.key === 'men'
          ? 'auto: 50 min before Mincha'
          : item.key === 'ladies'
            ? 'auto: 1:10 before men'
            : 'manual';
        return `<label>${item.ui}<input data-special-time="${item.key}" value="${value || ''}" placeholder="time"><span style="font-size:10px;color:#8a6b32">${auto}</span></label>`;
      }).join('');
      wrap.querySelectorAll('[data-special-time]').forEach(input => {
        input.addEventListener('input', () => {
          const next = getSpecialTimes();
          next[input.dataset.specialTime] = input.value;
          setSpecialTimes(next);
          applyScheduleModes();
          render();
          updateModeUI();
        });
      });
      document.getElementById('specialRuleNote').textContent =
        'The regular afternoon shiur is omitted. Men’s drasha auto-calculates 50 minutes before Mincha; ladies auto-calculates 1:10 before the men. Children remains manual. Any field can be overridden for this week.';
    } else {
      wrap.innerHTML = '';
      document.getElementById('specialRuleNote').textContent = 'No special-week override.';
    }
  }

  injectUI();

  const baseRefresh = window.refresh;
  window.refresh = async function refreshWithModes() {
    await baseRefresh();
    applyScheduleModes();
    render();
    updateModeUI();
  };

  // The original Refresh button was bound before this script loaded.
  const refreshButton = document.getElementById('refresh');
  if (refreshButton) refreshButton.onclick = () => window.refresh();

  // Re-run once so the active season/special-week rules are applied to the
  // schedule that app.js already loaded.
  window.refresh();
})();