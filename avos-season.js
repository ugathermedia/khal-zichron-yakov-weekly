(() => {
  'use strict';
  const START = '2026-10-31', END = '2027-03-06';
  const API = 'https://zichronyakov.ugathermedia.com/avos-ubanim';
  const $ = id => document.getElementById(id);
  const status = $('avosSeasonStatus');
  const rowsRoot = $('avosSeasonRows');
  const sheet = $('avosSeasonSheet');
  const preview = $('avosSeasonPreview');
  const bg = $('avosSeasonBackground');
  const buttons = ['avosSeasonRefresh','avosSeasonJpeg','avosSeasonPrint'].map($);
  let dataReady = false, busy = false;
  const dateUTC = s => new Date(s + 'T12:00:00Z');
  const iso = d => d.toISOString().slice(0,10);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parshaNames = {Bereshit:'Bereishis',Shemot:'Shemos',Vayechi:'Vayechi',Toldot:'Toldos',Yitro:'Yisro',Vayigash:'Vayigash',Beshalach:'Beshalach',Terumah:'Terumah',Tetzaveh:'Tetzaveh',Vayakhel:'Vayakhel',Pekudei:'Pekudei',Shmini:'Shmini',Vayikra:'Vayikra',Miketz:'Miketz',Vayeshev:'Vayeshev',Tazria:'Tazria',Metzora:'Metzora',Ki:'Ki',Tisa:'Sisa'};
  const monthNames = {'Cheshvan':'Cheshvan','Kislev':'Kislev','Tevet':'Teves','Sh’vat':'Shevat','Sh\'vat':'Shevat','Adar I':'Adar Alef','Adar II':'Adar Beis','Nisan':'Nisan'};
  function parsha(s) {return s.replace(/^Parashat /,'').replace(/\b[A-Za-z]+/g,w=>parshaNames[w]||w);}
  function specials(day, events) {
    const list = events.filter(e => e.category==='mevarchim').map(e => 'Mevorchim ' + (monthNames[e.title.replace(/^Mevarchim Chodesh /,'')] || e.title.replace(/^Mevarchim Chodesh /,'')));
    events.filter(e=>e.category==='roshchodesh').forEach(e=> { const month=e.title.replace(/^Rosh Chodesh /,''); list.push('Rosh Chodesh '+(monthNames[month]||month)); });
    const special = {
      '2026-12-05':'Chanukah', '2026-12-12':'Chanukah', '2027-01-23':'Tu B’Shevat · Shabbos Shirah',
      '2027-03-06':'Shekalim', '2027-03-20':'Zachor', '2027-03-27':'Parah',
      '2027-04-03':'HaChodesh', '2027-03-06':'Shabbos HaGadol'
    }[day];
    if(special) list.push(special);
    return list;
  }
  function setStatus(message, error=false) { status.textContent=message;status.classList.toggle('error',error); }
  function setBusy(value) {busy=value;buttons.forEach(b=>b.disabled=value);}
  async function calendarRows() {
    const response=await fetch(API+'/api/season',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('Season lookup failed');
    const data=await response.json();
    if(!Array.isArray(data.weeks)||data.weeks.length!==19)throw new Error('Incomplete season');
    return data.weeks.map((w,i)=>{
      const expected=new Date(START+'T12:00:00Z');expected.setUTCDate(expected.getUTCDate()+i*7);
      if(w.week!==iso(expected)||typeof w.parsha!=='string'||typeof w.hebrewDate!=='string')throw new Error('Invalid season row');
      return {day:w.week,date:new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(expected),parsha:w.parsha.replace('Parshas ',''),special:[w.hebrewDate],sponsor:publicSponsor(w,w.week)};
    });
  }
  async function getSponsor(row) {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),15000);
    let r;
    try {
      r=await fetch(API+'/api/sponsorship?week='+encodeURIComponent(row.day),{cache:'no-store',credentials:'omit',signal:controller.signal});
      const x=await r.json();
      if(!r.ok) throw new Error('Sponsor lookup failed for '+row.day+' ('+r.status+')');
      return publicSponsor(x,row.day);
    } finally { clearTimeout(timeout); }
  }
  function publicSponsor(x,day) {
    if(!Object.prototype.hasOwnProperty.call(x,'sponsorship')) throw new Error('Invalid sponsor response for '+day);
    const s=x.sponsorship;
    if(s === null) return null;
    if(s.week!==day || typeof s.sponsorName!=='string'||typeof s.dedication!=='string') throw new Error('Invalid sponsor record for '+day);
    return {name:s.anonymous === true ? 'Anonymous' : (s.sponsorName.trim()||'Anonymous'),dedication:s.dedication.trim()};
  }
  function shrinkText() {
    rowsRoot.querySelectorAll('.avos-cell').forEach(cell=>{
      cell.style.fontSize='';
      const span=cell.firstElementChild;
      if(!span) return;
      let size=parseFloat(getComputedStyle(cell).fontSize);
      while((span.scrollWidth>cell.clientWidth+1 || span.getBoundingClientRect().height > cell.getBoundingClientRect().height+1) && size>10.5) {size=Math.max(10.5,size-.25);cell.style.fontSize=size+'px';}
      cell.classList.toggle('overflow',span.scrollWidth>cell.clientWidth+1 || span.getBoundingClientRect().height>cell.getBoundingClientRect().height+1);
    });
    const problems=rowsRoot.querySelectorAll('.overflow').length;
    if(problems) setStatus(problems+' row(s) contain text too long to fit legibly in its row. Shorten the dedication on the sponsorship form before exporting.',true);
    return !problems;
  }
  function render(rows) {
    rowsRoot.innerHTML=rows.map(row=>{
      const detail = row.sponsor ? row.sponsor.name + (row.sponsor.dedication ? ' · '+row.sponsor.dedication : '') : 'Available';
      const sub = row.special.length ? ' · '+row.special.join(' · ') : '';
      return '<div class="avos-row"><div class="avos-cell avos-date"><span>'+escapeHTML(row.date)+'</span></div><div class="avos-cell avos-parsha"><span>'+escapeHTML(row.parsha+sub)+'</span></div><div class="avos-cell avos-sponsor'+(row.sponsor?'':' avos-available')+'"><span dir="auto">'+escapeHTML(detail)+'</span></div></div>';
    }).join('');
    shrinkText();resizePreview();
  }
  async function refresh() {
    if(busy) return;
    setBusy(true);dataReady=false;rowsRoot.replaceChildren();setStatus('Loading season calendar and 19 sponsorships…');
    try {
      const rows=await calendarRows();
      if(document.fonts) await document.fonts.ready;
      await bg.decode();
      render(rows);dataReady=true;
      if(!rowsRoot.querySelector('.overflow')) setStatus('Live sponsorship data loaded · '+rows.filter(r=>r.sponsor).length+' reserved · '+rows.filter(r=>!r.sponsor).length+' available.');
    }catch(e) {
      dataReady=false;setStatus('Could not load the complete season: '+e.message+'. Export is blocked until all 19 weeks load.',true);
    }finally{setBusy(false);}
  }
  function resizePreview(){
    const width=preview.clientWidth||816;
    const ratio=Math.min(1,width/816);
    sheet.style.transform='scale('+ratio+')';
    preview.style.height=(1056*ratio)+'px';
  }
  // Draw the verified layout directly to canvas. This avoids SVG foreignObject
  // restrictions in Firefox/Safari while retaining the exact supplied artwork.
  function wrapCanvasText(context,text,width) {
    const lines=[];
    let line='';
    for(const word of text.split(/\s+/)) {
      const candidate=line ? line+' '+word : word;
      if(context.measureText(candidate).width<=width) {line=candidate;continue;}
      if(line) {lines.push(line);line='';}
      for(const char of word) {
        if(line && context.measureText(line+char).width>width) {lines.push(line);line='';}
        line+=char;
      }
    }
    if(line) lines.push(line);
    return lines;
  }
  function captureCanvas() {
    const canvas=document.createElement('canvas');
    canvas.width=2550;canvas.height=3300;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('This browser cannot create the export canvas.');
    ctx.scale(2550/816,3300/1056);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,816,1056);
    ctx.fillStyle='#ffdf63';ctx.fillRect(0,0,816,234);
    ctx.drawImage(bg,93,12,630,210);
    const bounds=sheet.getBoundingClientRect(),scale=816/bounds.width;
    const box=el=>{const r=el.getBoundingClientRect();return {x:(r.left-bounds.left)*scale,y:(r.top-bounds.top)*scale,width:r.width*scale,height:r.height*scale};};
    const title=sheet.querySelector('.avos-sheet-title'),t=box(title);
    ctx.fillStyle='#351369';ctx.font='750 14px Heebo,Arial';ctx.textBaseline='middle';ctx.textAlign='center';
    ctx.fillText(title.textContent,408,t.y+t.height/2);
    const head=sheet.querySelector('.avos-table-head'),h=box(head);
    ctx.fillStyle='#351369';ctx.fillRect(h.x,h.y,h.width,h.height);
    ctx.fillStyle='#fff';ctx.font='700 10px Heebo,Arial';ctx.textAlign='left';
    for(const label of head.children){const c=box(label);ctx.fillText(label.textContent,c.x,c.y+c.height/2);}
    for(const row of rowsRoot.children) {
      const r=box(row),style=getComputedStyle(row);
      ctx.fillStyle=style.backgroundColor;ctx.fillRect(r.x,r.y,r.width,r.height);
      if(parseFloat(style.borderBottomWidth)>0) {
        ctx.strokeStyle=style.borderBottomColor;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(r.x,r.y+r.height-.5);ctx.lineTo(r.x+r.width,r.y+r.height-.5);ctx.stroke();
      }
      for(const cell of row.children) {
        const c=box(cell),font=getComputedStyle(cell);
        let size=parseFloat(font.fontSize);
        const applyFont=()=>{ctx.font=font.fontStyle+' '+font.fontWeight+' '+size+'px '+font.fontFamily;};
        applyFont();
        ctx.fillStyle=font.color;ctx.textBaseline='middle';ctx.textAlign='left';
        const text=cell.textContent.trim();
        ctx.direction=/^[\u0590-\u05ff]/.test(text)?'rtl':'ltr';
        let lines=wrapCanvasText(ctx,text,c.width),lineHeight=size*1.2;
        // Canvas and DOM font metrics vary slightly between browser engines.
        while(lines.length*lineHeight>c.height+1 && size>10.5) {
          size=Math.max(10.5,size-.25);applyFont();
          lines=wrapCanvasText(ctx,text,c.width);lineHeight=size*1.2;
        }
        if(lines.length*lineHeight>c.height+1)throw new Error('Text does not fit the export for '+row.firstElementChild.textContent+'. Shorten it before exporting.');
        lines.forEach((line,index)=>ctx.fillText(line,c.x,c.y+(c.height-lines.length*lineHeight)/2+lineHeight*(index+.5)));
      }
    }
    return canvas;
  }
  async function exportJPEG(){
    if(busy)return;
    if(!dataReady)return setStatus('Refresh live sponsorships before exporting.',true);
    setBusy(true);
    let canvas;
    try{
      if(document.fonts) await document.fonts.ready;
      await bg.decode();
      if(!shrinkText()) throw new Error('One or more rows overflow the page.');
      if(!window.WeeklyJpegExport?.compressToLimit) throw new Error('JPEG export library unavailable.');
      canvas=captureCanvas();
      const result=await window.WeeklyJpegExport.compressToLimit(canvas);
      const url=URL.createObjectURL(result.blob);
      const a=document.createElement('a');
      a.href=url;a.download='KZY-Avos-Ubanim-5787.jpg';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      setStatus('Exported full season JPEG · '+result.width+' × '+result.height+' · '+Math.round(result.size/1000)+' KB (under 1 MB).');
    }catch(e){setStatus('Could not export JPEG: '+e.message,true);}
    finally{if(canvas){canvas.width=0;canvas.height=0;}setBusy(false);}
  }
  async function printSheet(){
    if(busy)return;
    if(document.fonts) await document.fonts.ready;
    if(!dataReady)return setStatus('Refresh sponsorships before printing.',true);
    if(!bg.complete||!bg.naturalWidth)return setStatus('The supplied background could not load. Reload the page and try again.',true);
    if(!shrinkText())return;
    window.print();
  }
  $('avosSeasonRefresh').onclick=refresh;
  $('avosSeasonJpeg').onclick=exportJPEG;
  $('avosSeasonPrint').onclick=printSheet;
  bg.addEventListener('error',()=>setStatus('The supplied background could not load. Reload the page and try again.',true));
  window.addEventListener('resize',resizePreview);
  window.addEventListener('beforeprint',()=>{
    if(document.body.dataset.activeView==='avos') {
      const valid=dataReady && !busy && bg.complete && bg.naturalWidth && shrinkText();
      document.body.classList.toggle('avos-print-invalid',!valid);
    }
  });
  window.addEventListener('afterprint',()=>document.body.classList.remove('avos-print-invalid'));
  window.activateAvosSeason=()=>{resizePreview();if(!dataReady&&!busy)refresh();};
  if (document.querySelector('[data-view-tab="avos"]')?.classList.contains('active')) window.activateAvosSeason();
})();
