(() => {
  'use strict';
  const START = '2026-10-10', END = '2027-04-17';
  const API = 'https://zichronyakov.ugathermedia.com';
  const $ = id => document.getElementById(id);
  const status = $('sponsorSeasonStatus');
  const rowsRoot = $('sponsorSeasonRows');
  const sheet = $('sponsorSeasonSheet');
  const preview = $('sponsorSeasonPreview');
  const bg = $('sponsorSeasonBackground');
  const buttons = ['sponsorSeasonRefresh','sponsorSeasonJpeg','sponsorSeasonPrint'].map($);
  let dataReady = false, busy = false, currentRows = [];
  const dateUTC = s => new Date(s + 'T12:00:00Z');
  const iso = d => d.toISOString().slice(0,10);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parshaNames = {Bereshit:'Bereishis',Shemot:'Shemos',Vayechi:'Vayechi',Toldot:'Toldos',Yitro:'Yisro',Vayigash:'Vayigash',Beshalach:'Beshalach',Terumah:'Terumah',Tetzaveh:'Tetzaveh',Vayakhel:'Vayakhel',Pekudei:'Pekudei',Shmini:'Shmini',Vayikra:'Vayikra',Miketz:'Miketz',Vayeshev:'Vayeshev',Tazria:'Tazria',Metzora:'Metzora',Ki:'Ki'};
  const monthNames = {'Cheshvan':'Cheshvan','Kislev':'Kislev','Tevet':'Teves','Sh’vat':'Shevat','Sh\'vat':'Shevat','Adar I':'Adar Alef','Adar II':'Adar Beis','Nisan':'Nisan'};
  function parsha(s) {return s.replace(/^Parashat /,'').replace(/\b[A-Za-z]+/g,w=>parshaNames[w]||w);}
  function specials(day, events) {
    const list = events.filter(e => e.category==='mevarchim').map(e => 'Mevorchim ' + (monthNames[e.title.replace(/^Mevarchim Chodesh /,'')] || e.title.replace(/^Mevarchim Chodesh /,'')));
    if (events.some(e=>e.category==='roshchodesh')) list.push('Rosh Chodesh');
    const special = {
      '2026-12-05':'Chanukah', '2026-12-12':'Chanukah', '2027-01-23':'Tu B’Shevat · Shabbos Shirah',
      '2027-03-06':'Shekalim', '2027-03-20':'Zachor', '2027-03-27':'Parah',
      '2027-04-03':'HaChodesh', '2027-04-17':'Shabbos HaGadol'
    }[day];
    if(special) list.push(special);
    return list;
  }
  function setStatus(message, error=false) { status.textContent=message;status.classList.toggle('error',error); }
  function setBusy(value) {busy=value;buttons.forEach(b=>b.disabled=value);}
  async function calendarRows() {
    const list = await window.kzyCalendar.events(START,END);
    const arr=[];
    for(let d=dateUTC(START);iso(d)<=END;d.setUTCDate(d.getUTCDate()+7)) {
      const day=iso(d), events=list.filter(e=>e.date===day);
      const p=events.find(e=>e.category==='parashat');
      if(!p) throw new Error('Missing calendar parsha for '+day);
      const date = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(d);
      arr.push({day,date,parsha:parsha(p.title),special:specials(day,events),sponsor:null});
    }
    if(arr.length!==28) throw new Error('Unexpected season length: '+arr.length);
    return arr;
  }
  async function getSponsor(row) {
    const r=await fetch(API+'/api/sponsorship?week='+encodeURIComponent(row.day),{cache:'no-store',credentials:'omit'});
    if(!r.ok) throw new Error('Sponsor lookup failed for '+row.day+' ('+r.status+')');
    const x=await r.json();
    if(!Object.prototype.hasOwnProperty.call(x,'sponsorship')) throw new Error('Invalid sponsor response for '+row.day);
    const s=x.sponsorship;
    if(!s) return null;
    if(s.week!==row.day || typeof s.sponsorName!=='string'||typeof s.dedication!=='string') throw new Error('Invalid sponsor record for '+row.day);
    return {name:s.sponsorName.trim()||'Anonymous',dedication:s.dedication.trim()};
  }
  function shrinkText() {
    rowsRoot.querySelectorAll('.season-cell').forEach(cell=>{
      cell.style.fontSize='';
      const span=cell.firstElementChild;
      if(!span) return;
      let size=parseFloat(getComputedStyle(cell).fontSize);
      while(span.scrollWidth>cell.clientWidth && size>10.2) {size-=.35;cell.style.fontSize=size+'px';}
      cell.classList.toggle('overflow',span.scrollWidth>cell.clientWidth+1);
    });
    const problems=rowsRoot.querySelectorAll('.overflow').length;
    if(problems) setStatus(problems+' row(s) contain text too long for one readable line. Shorten the dedication before exporting.',true);
    return !problems;
  }
  function render(rows) {
    rowsRoot.innerHTML=rows.map(row=>{
      const detail = row.sponsor ? row.sponsor.name + (row.sponsor.dedication ? ' · '+row.sponsor.dedication : '') : 'Available';
      const sub = row.special.length ? ' · '+row.special.join(' · ') : '';
      return '<div class="season-row"><div class="season-cell season-date"><span>'+escapeHTML(row.date)+'</span></div><div class="season-cell season-parsha"><span>'+escapeHTML(row.parsha+sub)+'</span></div><div class="season-cell season-sponsor'+(row.sponsor?'':' season-available')+'"><span dir="auto">'+escapeHTML(detail)+'</span></div></div>';
    }).join('');
    shrinkText();resizePreview();
  }
  async function refresh() {
    if(busy) return;
    setBusy(true);dataReady=false;setStatus('Loading season calendar and 28 sponsorships…');
    try {
      const rows=await calendarRows();
      // Limit requests to small batches, so a temporary rate limit does not overwhelm the form.
      for(let i=0;i<rows.length;i+=4) {
        const items=rows.slice(i,i+4);
        const found=await Promise.all(items.map(getSponsor));
        found.forEach((s,k)=>{items[k].sponsor=s;});
      }
      currentRows=rows;render(rows);dataReady=true;
      if(!rowsRoot.querySelector('.overflow')) setStatus('Live sponsorship data loaded · '+rows.filter(r=>r.sponsor).length+' reserved · '+rows.filter(r=>!r.sponsor).length+' available.');
    }catch(e) {
      dataReady=false;setStatus('Could not load the complete season: '+e.message+'. Export is blocked until all 28 weeks load.',true);
    }finally{setBusy(false);}
  }
  function resizePreview(){
    const width=preview.clientWidth||816;
    const ratio=Math.min(1,width/816);
    sheet.style.transform='scale('+ratio+')';
    preview.style.height=(1056*ratio)+'px';
  }
  function store(mode,action){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open('kzy-sponsor-season-background',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('assets');
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const db=req.result,tx=db.transaction('assets',mode),q=action(tx.objectStore('assets'));
        tx.oncomplete=()=>{db.close();resolve(q.result);};
        tx.onerror=()=>{db.close();reject(tx.error);};
      };
    });
  }
  let objectURL=null;
  function showBackground(file){
    if(objectURL)URL.revokeObjectURL(objectURL);
    objectURL=file?URL.createObjectURL(file):null;
    bg.src=objectURL||'assets/shalosh-seudos-sponsorship-background.jpg';
  }
  $('sponsorSeasonBackgroundUpload').addEventListener('change',async e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    try{
      if(!/^image\/(jpeg|png)$/.test(file.type))throw new Error('Choose a JPEG or PNG.');
      const im=new Image(),url=URL.createObjectURL(file);
      try{im.src=url;await im.decode();if(Math.abs(im.naturalWidth/im.naturalHeight-8.5/11)>.02)throw new Error('Artwork must be US Letter portrait.');}
      finally{URL.revokeObjectURL(url);}
      await store('readwrite',s=>s.put(file,'background'));showBackground(file);
      setStatus('Sponsorship stationery saved to this browser. Refresh sponsorships to update bookings.');
    }catch(err){setStatus(err.message,true);}
    e.target.value='';
  });
  store('readonly',s=>s.get('background')).then(blob=>{if(blob)showBackground(blob);}).catch(()=>{});
  async function exportJPEG(){
    if(busy)return;
    if(!dataReady)return setStatus('Refresh live sponsorships before exporting.',true);
    setBusy(true);
    let host,canvas;
    try{
      if(document.fonts) await document.fonts.ready;
      await bg.decode();
      if(!shrinkText()) throw new Error('One or more rows overflow the page.');
      if(!window.htmlToImage?.toCanvas || !window.WeeklyJpegExport?.compressToLimit) throw new Error('JPEG export libraries unavailable.');
      const clone=sheet.cloneNode(true);
      clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
      Object.assign(clone.style,{transform:'none',boxShadow:'none',width:'816px',height:'1056px'});
      host=document.createElement('div');
      Object.assign(host.style,{position:'fixed',left:'-100000px',top:'0',width:'816px',height:'1056px',pointerEvents:'none'});
      host.appendChild(clone);document.body.appendChild(host);
      canvas=await window.htmlToImage.toCanvas(clone,{width:816,height:1056,pixelRatio:2550/816,backgroundColor:'#fff',style:{transform:'none',boxShadow:'none'}});
      const result=await window.WeeklyJpegExport.compressToLimit(canvas);
      const url=URL.createObjectURL(result.blob);
      const a=document.createElement('a');
      a.href=url;a.download='KZY-Shalosh-Seudos-5787.jpg';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      setStatus('Exported full season JPEG · '+result.width+' × '+result.height+' · '+Math.round(result.size/1000)+' KB (under 1 MB).');
    }catch(e){setStatus('Could not export JPEG: '+e.message,true);}
    finally{host?.remove();if(canvas){canvas.width=0;canvas.height=0;}setBusy(false);}
  }
  function printSheet(){
    if(!dataReady)return setStatus('Refresh sponsorships before printing.',true);
    if(!bg.complete||!bg.naturalWidth)return setStatus('Upload the supplied stationery background first.',true);
    if(!shrinkText())return;
    window.print();
  }
  $('sponsorSeasonRefresh').onclick=refresh;
  $('sponsorSeasonJpeg').onclick=exportJPEG;
  $('sponsorSeasonPrint').onclick=printSheet;
  bg.addEventListener('error',()=>setStatus('Background artwork missing. Upload your supplied JPG under “Stationery background.”',true));
  window.addEventListener('resize',resizePreview);
  window.activateSponsorSeason=()=>{resizePreview();if(!dataReady&&!busy)refresh();};
  if (document.querySelector('[data-view-tab="sponsorships"]')?.classList.contains('active')) window.activateSponsorSeason();
})();
