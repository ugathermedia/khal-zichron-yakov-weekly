(() => {
  const SUCCOS_YEAR = '5787 / 2026';
  const RANGE_LABEL = 'Sep 25 – Oct 4, 2026';
  const OVERRIDE_KEY = 'kzy-weekly:succos-5787-overrides';

  const isoDate = iso => new Date(`${iso}T12:00:00`);
  const zmanimFor = iso => getZmanim(isoDate(iso));
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

  function shift(value, minutes) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return fmtDateTime(new Date(d.getTime() + minutes * 60000).toISOString());
  }

  function localParts(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: LOCATION.timeZoneId,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(d);
    const pick = type => Number(parts.find(p => p.type === type)?.value);
    return { h: pick('hour'), m: pick('minute'), s: pick('second') };
  }

  function roundedWeekdayMincha(sunset) {
    if (!sunset) return '';
    const threshold = new Date(new Date(sunset).getTime() - 13 * 60000);
    const p = localParts(threshold);
    if (!p) return '';
    return clockFromLocalMinutes(Math.floor((p.h * 60 + p.m) / 5) * 5);
  }

  function roundedOffset(value, minutes, step = 5) {
    if (!value) return '';
    const shifted = new Date(new Date(value).getTime() + minutes * 60000);
    const p = localParts(shifted);
    if (!p) return '';
    const total = p.h * 60 + p.m + p.s / 60;
    return clockFromLocalMinutes(Math.round(total / step) * step);
  }

  function fmtRaw(value) {
    return value ? fmtDateTime(value) : '—';
  }

  function loadOverrides() {
    try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveOverrides(data) {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(data));
  }

  function row(dayKey, rowKey, label, autoTime, basis, confidence = 'rule') {
    const overrides = loadOverrides();
    const id = `${dayKey}:${rowKey}`;
    return {
      id,
      label,
      autoTime,
      time: hasOwn(overrides, id) ? overrides[id] : autoTime,
      basis,
      confidence
    };
  }

  function textRow(dayKey, rowKey, label, basis) {
    return row(dayKey, rowKey, label, '', basis, 'fixed');
  }

  function buildDay(def) {
    const z = zmanimFor(def.date);
    const sunset = z.SeaLevelSunset;
    const sunrise = z.SeaLevelSunrise || z.Sunrise;
    const ksMga72 = z.SofZmanShmaMGA72Minutes;
    const ksGra = z.SofZmanShmaGRA;
    const tzais50 = sunset ? new Date(new Date(sunset).getTime() + 50 * 60000).toISOString() : null;
    const tzais72 = z.Tzais72 || z.Tzais72Minutes;
    const plag = z.PlagHamincha || z.PlagHaminchaGRA;

    const exact = (key, label, value, basis) => row(def.key, key, label, fmtRaw(value), basis || 'KosherZmanim 0.9.0 / KosherJava port', 'astronomical');
    const shifted = (key, label, value, mins, basis) => row(def.key, key, label, shift(value, mins), basis, 'rule');
    const fixed = (key, label, value, basis) => row(def.key, key, label, value, basis, 'fixed');

    let rows = [];

    if (def.kind === 'erev-sukkos-friday') {
      rows = [
        fixed('shacharis', 'שחרית', '6:45 · 7:35 · 8:45', '2025 master; same fixed Shacharis in 2023 Friday configuration'),
        shifted('candles', 'הדלקת נרות', sunset, -18, 'Astronomical: 18 min before sea-level shkiah; matches 2025 + 2023'),
        shifted('mincha', 'מנחה', sunset, -15, '2023 Friday/Shabbos precedent: 15 min before shkiah; also matches 2025'),
        textRow(def.key, 'shiur', 'שיעור מאת הרב שליט״א', '2025 master; untimed'),
        exact('shkiah', 'שקיעה', sunset),
        shifted('maariv', 'מעריב', sunset, 40, '2023 Friday/Shabbos precedent: 40 min after shkiah')
      ];
    }

    if (def.kind === 'sukkos-day1-shabbos') {
      rows = [
        fixed('shacharis', 'שחרית', '8:30', '2023 Shabbos override'),
        row(def.key, 'ks', 'ס״ז קריאת שמע', `${fmtRaw(ksMga72)} / ${fmtRaw(ksGra)}`, 'Astronomical: MGA fixed 72 / GRA', 'astronomical'),
        shifted('tiferes', 'תפארת בחורים', sunset, -75, '2023 Shabbos precedent: 75 min before shkiah'),
        shifted('mincha', 'מנחה', sunset, -25, '2023 Shabbos precedent: 25 min before shkiah'),
        textRow(def.key, 'shiur', 'שיעור מאת הרב שליט״א', '2023 Shabbos override; untimed'),
        exact('shkiah', 'שקיעה', sunset),
        exact('maariv', 'מעריב', tzais50, '2023 Motzei Shabbos precedent: Maariv at exact shkiah + 50 minutes'),
        exact('candles72', 'הדלקת נרות (72)', tzais72, 'Motzei Shabbos: candle lighting waits for the 72-minute zman'),
        fixed('simchas', 'שמחת בית השואבה', '10:00', '2023 Shabbos override; 2025 non-Shabbos time was 9:45')
      ];
    }

    if (def.kind === 'sukkos-day2-sunday') {
      rows = [
        fixed('shacharis', 'שחרית', '8:30', '2023 Sunday-after-Shabbos override'),
        row(def.key, 'ks', 'ס״ז קריאת שמע', `${fmtRaw(ksMga72)} / ${fmtRaw(ksGra)}`, 'Astronomical: MGA fixed 72 / GRA', 'astronomical'),
        shifted('tiferes', 'תפארת בחורים', sunset, -74, '2023 Sunday precedent: 74 min before shkiah'),
        shifted('mincha', 'מנחה', sunset, -24, '2023 Sunday precedent: 24 min before shkiah'),
        textRow(def.key, 'shiur', 'שיעור בעניני דיומא', '2023 matching Sunday configuration; untimed'),
        exact('shkiah', 'שקיעה', sunset),
        shifted('maariv', 'מעריב', sunset, 55, '2023 + 2025 Day 2 rule: 55 min after shkiah'),
        exact('tzais72', 'צה״כ (72)', tzais72)
      ];
    }

    if (def.kind === 'chol-hamoed') {
      rows = [
        fixed('shacharis', 'שחרית', '6:45 · 8:10 · 8:45', '2025 master'),
        fixed('mincha-early', 'מנחה מוקדמת', '1:45', '2025 master'),
        row(def.key, 'mincha-late', 'מנחה מאוחרת', roundedWeekdayMincha(sunset), 'Current GitHub weekday rule: minimum 13 min before exact shkiah, rounded down to prior :05', 'rule'),
        fixed('maariv', 'מעריב', 'שקיעה · 8:15 · 9:45', '2025 master'),
        ...(def.hoshanaNight ? [
          fixed('seder', 'סדר לימוד לכבוד הושענא רבה', '10:00', '2025 master'),
          fixed('divrei', 'דברי תורה והתעוררות', '11:00', '2025 master'),
          textRow(def.key, 'allnight', 'ALL-NIGHT SEDER', '2025 master; moved to Thursday night in 2026')
        ] : [])
      ];
    }

    if (def.kind === 'hoshana-rabba-friday') {
      rows = [
        row(def.key, 'shacharis-a', 'שחרית א׳', roundedOffset(sunrise, -45), '2025 + 2023 pattern: approximately 45 min before Haneitz, rounded to nearest :05', 'rule'),
        exact('netz', 'הנץ', sunrise, 'Astronomical: sea-level sunrise'),
        fixed('shacharis-b', 'שחרית ב׳', '8:45', '2025 + 2023'),
        shifted('candles', 'הדלקת נרות', sunset, -18, 'Astronomical: 18 min before sea-level shkiah; exact pattern in 2025 + 2023'),
        shifted('mincha', 'מנחה', sunset, -15, '2025 + 2023: 15 min before shkiah'),
        textRow(def.key, 'drasha', 'דרשה מאת הרב שליט״א', '2023 Friday wording; untimed'),
        exact('shkiah', 'שקיעה', sunset),
        shifted('maariv', 'מעריב', sunset, 30, '2025 + 2023: 30 min after shkiah')
      ];
    }

    if (def.kind === 'shemini-atzeres-shabbos') {
      rows = [
        fixed('shacharis', 'שחרית', '8:30', '2023 Shabbos override'),
        row(def.key, 'ks', 'ס״ז קריאת שמע', `${fmtRaw(ksMga72)} / ${fmtRaw(ksGra)}`, 'Astronomical: MGA fixed 72 / GRA', 'astronomical'),
        fixed('yizkor', 'יזכור', 'Not before 10:45', '2025 master; 2023 used older 10:05 rule'),
        shifted('tiferes', 'תפארת בחורים', sunset, -99, '2023 Shabbos precedent: 99 min before shkiah'),
        shifted('shiur', 'שיעור בעניני דיומא', sunset, -74, '2023 Shabbos precedent: 74 min before shkiah'),
        shifted('farewell', 'תפילה לפרידה מן הסוכה', sunset, -44, '2023 Shabbos precedent: 44 min before shkiah'),
        shifted('mincha', 'מנחה', sunset, -24, '2023 Shabbos precedent: 24 min before shkiah'),
        exact('shkiah', 'שקיעה', sunset),
        exact('maariv', 'מעריב', tzais50, '2023 Motzei Shabbos precedent: Maariv at exact shkiah + 50 minutes'),
        exact('candles72', 'הדלקת נרות (72)', tzais72, 'Motzei Shabbos: candle lighting waits for the 72-minute zman')
      ];
    }

    if (def.kind === 'simchas-torah-sunday') {
      const minchaOffset = def.afterShabbos ? -27 : -15;
      const minchaBasis = def.afterShabbos
        ? '2023 matching Shabbos configuration: 27 min before shkiah'
        : '2025 non-Shabbos configuration: 15 min before shkiah';
      rows = [
        fixed('shacharis', 'שחרית', '8:15', '2025 + 2023'),
        row(def.key, 'ks', 'ס״ז קריאת שמע', `${fmtRaw(ksMga72)} / ${fmtRaw(ksGra)}`, 'Astronomical: MGA fixed 72 / GRA', 'astronomical'),
        shifted('mincha', 'מנחה', sunset, minchaOffset, minchaBasis),
        textRow(def.key, 'neila', 'נעילת החג', '2025 + 2023'),
        exact('shkiah', 'שקיעה', sunset),
        shifted('maariv', 'מעריב', sunset, 55, '2025 + 2023: 55 min after shkiah'),
        exact('tzais72', 'צה״כ (72)', tzais72)
      ];
    }

    return {
      ...def,
      raw: {
        sunrise: fmtRaw(sunrise),
        plag: fmtRaw(plag),
        sunset: fmtRaw(sunset),
        ksMga72: fmtRaw(ksMga72),
        ksGra: fmtRaw(ksGra),
        tzais50: fmtRaw(tzais50),
        tzais72: fmtRaw(tzais72)
      },
      rows
    };
  }

  const DAY_DEFS = [
    { key:'erev-sukkos', date:'2026-09-25', english:'Fri 9/25', hebrew:'ערב סוכות', kind:'erev-sukkos-friday' },
    { key:'day1', date:'2026-09-26', english:'Shabbos 9/26', hebrew:'א׳ דסוכות – אום נצורה', kind:'sukkos-day1-shabbos', isShabbos:true },
    { key:'day2', date:'2026-09-27', english:'Sun 9/27', hebrew:'ב׳ דסוכות – למען אמיתך', kind:'sukkos-day2-sunday' },
    { key:'ch-mon', date:'2026-09-28', english:'Mon 9/28', hebrew:'חול המועד', kind:'chol-hamoed' },
    { key:'ch-tue', date:'2026-09-29', english:'Tue 9/29', hebrew:'חול המועד', kind:'chol-hamoed' },
    { key:'ch-wed', date:'2026-09-30', english:'Wed 9/30', hebrew:'חול המועד', kind:'chol-hamoed' },
    { key:'ch-thu', date:'2026-10-01', english:'Thu 10/1', hebrew:'חול המועד / ליל הושענא רבה', kind:'chol-hamoed', hoshanaNight:true },
    { key:'hr', date:'2026-10-02', english:'Fri 10/2', hebrew:'הושענא רבה', kind:'hoshana-rabba-friday' },
    { key:'shemini', date:'2026-10-03', english:'Shabbos 10/3', hebrew:'שמיני עצרת', kind:'shemini-atzeres-shabbos', isShabbos:true },
    { key:'st', date:'2026-10-04', english:'Sun 10/4', hebrew:'שמחת תורה', kind:'simchas-torah-sunday', afterShabbos:true }
  ];

  function buildPlanner() {
    return DAY_DEFS.map(buildDay);
  }

  function confidenceLabel(c) {
    if (c === 'astronomical') return 'ASTRO';
    if (c === 'fixed') return 'FIXED';
    return 'RULE';
  }

  function copyText(days) {
    return days.map(day => {
      const lines = day.rows.map(r => `${r.label}: ${r.time || ''}`.trim());
      return `${day.english} — ${day.hebrew}\n${lines.join('\n')}`;
    }).join('\n\n');
  }


  function succosRow(day, key) {
    return day?.rows?.find(r => r.id === `${day.key}:${key}`) || null;
  }

  function flyerTime(day, key) {
    return succosRow(day, key)?.time || '';
  }

  function flyerSection(day, title = day.hebrew, subtitle = day.english) {
    return {
      title,
      subtitle,
      rows: day.rows.map(r => ({ label: r.label, time: r.time || '' }))
    };
  }

  function buildAffinityColumns(days) {
    const byKey = Object.fromEntries(days.map(d => [d.key, d]));
    const mon = byKey['ch-mon'];
    const tue = byKey['ch-tue'];
    const wed = byKey['ch-wed'];
    const thu = byKey['ch-thu'];

    const cholHamoed = {
      title: 'חול המועד',
      subtitle: 'Mon–Thu 9/28–10/1',
      rows: [
        { label: 'שחרית', time: flyerTime(mon, 'shacharis') },
        { label: 'מנחה מוקדמת', time: flyerTime(mon, 'mincha-early') },
        { label: 'מנחה מאוחרת — Monday', time: flyerTime(mon, 'mincha-late') },
        { label: 'מנחה מאוחרת — Tues–Thurs', time: flyerTime(tue, 'mincha-late') },
        { label: 'מעריב', time: flyerTime(mon, 'maariv') }
      ]
    };

    const hoshanaNight = {
      title: 'ליל הושענא רבה',
      subtitle: 'Thursday 10/1',
      rows: [
        { label: 'סדר לימוד לכבוד הושענא רבה', time: flyerTime(thu, 'seder') },
        { label: 'דברי תורה והתעוררות', time: flyerTime(thu, 'divrei') },
        { label: 'ALL-NIGHT SEDER', time: '' }
      ]
    };

    return [
      [
        flyerSection(byKey['erev-sukkos']),
        flyerSection(byKey['day1']),
        flyerSection(byKey['day2'])
      ],
      [
        cholHamoed,
        hoshanaNight,
        flyerSection(byKey['hr'])
      ],
      [
        flyerSection(byKey['shemini']),
        flyerSection(byKey['st'])
      ]
    ];
  }

  function buildSuccosAffinitySVG(days) {
    const W = 612;
    const H = 792;
    const margin = 26;
    const gap = 12;
    const colW = (W - margin * 2 - gap * 2) / 3;
    const topY = 78;
    const bottomY = 755;
    const rowH = 17;
    const headH = 23;
    const sectionGap = 8;
    const columns = buildAffinityColumns(days);

    const text = (x, y, value, cls, anchor = 'start') =>
      `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(value || '')}</text>`;

    let body = '';
    columns.forEach((sections, col) => {
      const x = margin + col * (colW + gap);
      let y = topY;

      sections.forEach((section, sectionIndex) => {
        if (sectionIndex) y += sectionGap;
        body += `<rect x="${x}" y="${y}" width="${colW}" height="${headH}" rx="2" class="section-bg"/>`;
        body += text(x + colW - 7, y + 15, section.title, 'section-title', 'end');
        body += text(x + 7, y + 15, section.subtitle, 'section-date', 'start');
        y += headH;

        section.rows.forEach(r => {
          body += `<line x1="${x}" x2="${x + colW}" y1="${y + rowH}" y2="${y + rowH}" class="rule"/>`;
          body += text(x + colW - 7, y + 12, r.label, 'row-label', 'end');
          if (r.time) body += text(x + 7, y + 12, r.time.replaceAll(' · ', ', '), 'row-time', 'start');
          y += rowH;
        });
      });

      body += `<line x1="${x}" x2="${x + colW}" y1="${bottomY}" y2="${bottomY}" class="column-end"/>`;
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="8.5in" height="11in" viewBox="0 0 ${W} ${H}">
      <style>
        .title,.section-title,.row-label{font-family:Arial,'Noto Sans Hebrew',sans-serif;direction:rtl;unicode-bidi:plaintext}
        .title{font-size:25px;font-weight:700;fill:#18263e}
        .subtitle{font-family:Arial,sans-serif;font-size:9px;letter-spacing:.6px;fill:#6c7480}
        .section-bg{fill:#18263e}
        .section-title{font-size:10.4px;font-weight:700;fill:#fff}
        .section-date{font-family:Arial,sans-serif;font-size:7.4px;fill:#dfe6f0}
        .row-label{font-size:8.8px;font-weight:600;fill:#1e293b}
        .row-time{font-family:Arial,sans-serif;font-size:8.8px;font-weight:700;fill:#111827}
        .rule{stroke:#d9dde3;stroke-width:.6}
        .column-end{stroke:#18263e;stroke-width:1}
        .footer{font-family:Arial,sans-serif;font-size:7.2px;fill:#5f6875}
      </style>
      <rect width="${W}" height="${H}" fill="#fff"/>
      ${text(W / 2, 36, 'סוכות תשפ״ז', 'title', 'middle')}
      ${text(W / 2, 54, 'KHAL ZICHRON YAKOV  •  SEPTEMBER 25 – OCTOBER 4, 2026', 'subtitle', 'middle')}
      <line x1="${margin}" x2="${W - margin}" y1="65" y2="65" stroke="#18263e" stroke-width="1.2"/>
      ${body}
      ${text(W / 2, 777, 'Khal Zichron Yakov  •  8 Roxbury Court  •  Chestnut Ridge, NY 10977', 'footer', 'middle')}
    </svg>`;
  }

  function downloadSuccosAffinitySVG(days) {
    const svg = buildSuccosAffinitySVG(days);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'KZY-Succos-5787-One-Page.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function injectUI() {
    if (document.getElementById('succosPlannerCard')) return;
    const card = document.createElement('details');
    card.id = 'succosPlannerCard';
    card.open = true;
    card.innerHTML = `
      <style>
        #succosPlannerCard{margin:12px 0 4px;border:1px solid #d7dbe2;border-radius:10px;background:#fff;overflow:hidden}
        #succosPlannerCard>summary{cursor:pointer;padding:14px 16px;background:#f8f7f3;font-weight:800;color:#18263e;list-style:none}
        #succosPlannerCard>summary::-webkit-details-marker{display:none}
        #succosPlannerCard .sp-body{padding:14px 16px}
        #succosPlannerCard .sp-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
        #succosPlannerCard .sp-kicker{font-size:11px;font-weight:800;letter-spacing:.08em;color:#8a6b32;text-transform:uppercase}
        #succosPlannerCard .sp-note{font-size:11px;color:#687386;max-width:900px;line-height:1.45;margin-top:4px}
        #succosPlannerCard button{font:inherit;padding:7px 10px;border:1px solid #cbd2dc;border-radius:7px;background:white;cursor:pointer}
        #succosPlannerCard .sp-days{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:14px}
        #succosPlannerCard .sp-day{border:1px solid #e1e4e9;border-radius:9px;overflow:hidden;background:#fff}
        #succosPlannerCard .sp-day-head{padding:9px 11px;background:#18263e;color:#fff;display:flex;justify-content:space-between;gap:10px;align-items:center}
        #succosPlannerCard .sp-day-head strong{font-size:13px}
        #succosPlannerCard .sp-day-head span{font-size:11px;opacity:.8}
        #succosPlannerCard .sp-row{display:grid;grid-template-columns:minmax(120px,1fr) 88px;gap:8px;padding:7px 10px;border-top:1px solid #eef0f3;align-items:center}
        #succosPlannerCard .sp-row:first-child{border-top:0}
        #succosPlannerCard .sp-label{font-size:12px;font-weight:700;color:#283548}
        #succosPlannerCard .sp-basis{font-size:9px;color:#7a8492;margin-top:2px;line-height:1.3}
        #succosPlannerCard .sp-tag{display:inline-block;font-size:8px;font-weight:800;letter-spacing:.05em;color:#8a6b32;margin-right:4px}
        #succosPlannerCard .sp-row input{width:100%;box-sizing:border-box;border:1px solid #cbd2dc;border-radius:6px;padding:5px 6px;font:inherit;font-size:12px;text-align:center}
        #succosPlannerCard .sp-raw-wrap{margin-top:14px;overflow-x:auto}
        #succosPlannerCard .sp-raw{width:100%;border-collapse:collapse;font-size:11px;white-space:nowrap}
        #succosPlannerCard .sp-raw th{text-align:left;color:#6b7280;font-size:9px;text-transform:uppercase;letter-spacing:.05em;padding:6px;border-bottom:1px solid #d7dbe2}
        #succosPlannerCard .sp-raw td{padding:6px;border-bottom:1px solid #eceff3}
        #succosPlannerCard .sp-foot{margin-top:10px;font-size:10px;color:#687386}
      </style>
      <summary>Succos ${SUCCOS_YEAR} planner · ${RANGE_LABEL}</summary>
      <div class="sp-body">
        <div class="sp-head">
          <div>
            <div class="sp-kicker">Holiday calculation mode</div>
            <div class="sp-note">2025 is the schedule master. 2023 is used only where the Friday/Shabbos/Sunday configuration changes the program. Every astronomical value comes from the same KosherZmanim 0.9.0 / KosherJava calculation layer used by this app, at KZY's saved coordinates and sea-level shkiah. Offsets are applied to the exact instant before display rounding.</div>
          </div>
          <div>
            <button type="button" id="succosCopy">Copy schedule</button>
            <button type="button" id="succosAffinity">Export one-page Affinity SVG</button>
            <button type="button" id="succosReset">Reset Succos overrides</button>
          </div>
        </div>
        <div id="succosDays" class="sp-days"></div>
        <div class="sp-raw-wrap">
          <table class="sp-raw">
            <thead><tr><th>Date</th><th>Haneitz</th><th>Plag</th><th>Shkiah</th><th>KS MGA72</th><th>KS GRA</th><th>+50 min</th><th>Tzais 72</th></tr></thead>
            <tbody id="succosRaw"></tbody>
          </table>
        </div>
        <div class="sp-foot">ASTRO = direct KosherZmanim output. RULE = clock time derived from an established prior-year relationship to an astronomical zman. FIXED = shul/program time carried from the selected precedent. The +50 column is a diagnostic offset from exact shkiah. On Motzei Shabbos it is used for Maariv only; candle lighting waits until +72. On non-Shabbos Yom Tov transitions, +50 remains the earlier candle-lighting option. Every schedule field remains manually overrideable.</div>
      </div>`;
    const anchor = document.getElementById('weekdayPlannerCard') || document.getElementById('scheduleModeCard') || document.getElementById('weekTitle');
    anchor.insertAdjacentElement('afterend', card);
  }

  function renderPlanner() {
    injectUI();
    let days;
    try {
      days = buildPlanner();
    } catch (e) {
      document.getElementById('succosDays').innerHTML = `<div class="sp-note">Succos planner could not calculate: ${esc(e.message)}</div>`;
      return;
    }

    document.getElementById('succosDays').innerHTML = days.map(day => `
      <section class="sp-day">
        <div class="sp-day-head"><strong>${esc(day.hebrew)}</strong><span>${esc(day.english)}</span></div>
        ${day.rows.map(r => `
          <div class="sp-row">
            <div>
              <div class="sp-label"><span class="sp-tag">${confidenceLabel(r.confidence)}</span>${esc(r.label)}</div>
              <div class="sp-basis">${esc(r.basis)}</div>
            </div>
            <input data-succos-id="${esc(r.id)}" value="${esc(r.time || '')}" placeholder="—">
          </div>`).join('')}
      </section>`).join('');

    document.getElementById('succosRaw').innerHTML = days.map(day => `
      <tr><td>${esc(day.english)}</td><td>${esc(day.raw.sunrise)}</td><td>${esc(day.raw.plag)}</td><td>${esc(day.raw.sunset)}</td><td>${esc(day.raw.ksMga72)}</td><td>${esc(day.raw.ksGra)}</td><td>${esc(day.raw.tzais50)}</td><td>${esc(day.raw.tzais72)}</td></tr>`).join('');

    document.querySelectorAll('[data-succos-id]').forEach(input => {
      input.addEventListener('change', () => {
        const overrides = loadOverrides();
        const id = input.dataset.succosId;
        if (input.value.trim()) overrides[id] = input.value.trim();
        else delete overrides[id];
        saveOverrides(overrides);
        renderPlanner();
      });
    });

    const copy = document.getElementById('succosCopy');
    copy.onclick = async () => {
      const text = copyText(days);
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copied';
        setTimeout(() => { copy.textContent = 'Copy schedule'; }, 1200);
      } catch {
        window.prompt('Copy Succos schedule:', text);
      }
    };

    document.getElementById('succosAffinity').onclick = () => downloadSuccosAffinitySVG(days);

    document.getElementById('succosReset').onclick = () => {
      localStorage.removeItem(OVERRIDE_KEY);
      renderPlanner();
    };
  }

  injectUI();
  renderPlanner();

  const previousRefresh = window.refresh;
  window.refresh = async function refreshWithSuccosPlanner() {
    await previousRefresh();
    renderPlanner();
  };

  const refreshButton = document.getElementById('refresh');
  if (refreshButton) refreshButton.onclick = () => window.refresh();
})();