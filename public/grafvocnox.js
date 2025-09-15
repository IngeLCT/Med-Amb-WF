// gravocnox.js
window.addEventListener('load', () => {
  const MAX_POINTS = 24;
  // Mensaje de carga: arriba, estilo unificado
  const loadingClass = 'loading-msg';
  ['VOC','NOx'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.style.position='relative';
    if(!el.querySelector('.'+loadingClass)){
      el.insertAdjacentHTML('afterbegin',
        '<div class="'+loadingClass+'" style="position:absolute;top:4px;left:0;width:100%;text-align:center;font-size:28px;font-weight:bold;color:#000;letter-spacing:.5px;pointer-events:none;">Cargando datos...</div>'
      );
  el.style.paddingTop = '36px';
    }
  });

  function initBar(divId, label, color, yMin, yMax) {
    Plotly.newPlot(divId, [{
      x: Array.from({ length: MAX_POINTS }, (_, i) => i),
      y: new Array(MAX_POINTS).fill(null),
      type: 'bar',
      name: label,
      marker: { color }
    }], {
      title: {
        text: label,
        font: { size: 20, color: 'black', family: 'Arial', weight: 'bold' }
      },
      xaxis: {
        title: {
          text: 'Fecha y Hora de Medición',
          font: { size: 16, color: 'black', family: 'Arial', weight: 'bold' },
          standoff: 20
        },
        type: 'category',
        tickfont: { color: 'black', size: 14, family: 'Arial', weight: 'bold' },
        gridcolor: 'black',
        linecolor: 'black',
        autorange: true,
        tickangle: -45,
      },
      yaxis: {
        title: {
          text: label,
          font: { size: 16, color: 'black', family: 'Arial', weight: 'bold' }
        },
        tickfont: { color: 'black', size: 14, family: 'Arial', weight: 'bold' },
        gridcolor: 'black',
        linecolor: 'black',
        autorange: true,
        fixedrange: false,
        range: (yMin!==null&&yMax!==null)?[yMin,yMax]:[0, 10]
      },
      plot_bgcolor: '#cce5dc',
      paper_bgcolor: '#cce5dc',
      margin: { t: 50, l: 60, r: 40, b: 90 },
      bargap: 0.2
    }, {
      responsive: true,
      useResizeHandler: true
    });
  }

  function toIsoDate(fecha){
    if(!fecha || typeof fecha !== 'string'){
      const d=new Date();
      const mm=String(d.getMonth()+1).padStart(2,'0');
      const dd=String(d.getDate()).padStart(2,'0');
      return `${d.getFullYear()}-${mm}-${dd}`;
    }
    const [dd,mm,yyyy] = fecha.split('-');
    return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }
  function addDays(isoDate, days){ const d=new Date(isoDate+'T00:00:00'); d.setDate(d.getDate()+days); const yyyy=d.getFullYear(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${yyyy}-${mm}-${dd}`; }
  function inferDatesForEntries(entries){
    const n = entries.length; const dates = new Array(n).fill(null); const markers=[];
    for(let i=n-1;i>=0;i--){ const v=entries[i][1]; if(v && v.fecha){ markers.push(i);} }
    if(markers.length>0){
      const M0=markers[0]; const dateM0=toIsoDate(entries[M0][1].fecha); for(let i=M0;i<n;i++){ dates[i]=dateM0; }
      for(let j=0;j<markers.length-1;j++){ const Ma=markers[j], Mb=markers[j+1]; const dateMa=toIsoDate(entries[Ma][1].fecha); const assigned=addDays(dateMa,-1); for(let i=Mb+1;i<Ma;i++){ dates[i]=assigned; } dates[Mb]=toIsoDate(entries[Mb][1].fecha);} 
      const Mlast=markers[markers.length-1]; const assignedOld=addDays(toIsoDate(entries[Mlast][1].fecha),-1); for(let i=0;i<Mlast;i++){ dates[i]=assignedOld; }
    } else {
      const today=toIsoDate(); for(let i=0;i<n;i++){ dates[i]=today; }
    }
    return dates;
  }
  function makeTimestampWithDate(isoDate, v){ const h = v.hora || v.tiempo || '00:00:00'; return `${isoDate} ${h}`; }

    function Series(divId){
    this.divId = divId;
    this.slotIdx = Array.from({ length: MAX_POINTS }, (_, i) => i);
    this.lbl = new Array(MAX_POINTS).fill('');
    this.y = new Array(MAX_POINTS).fill(null);
    this.keys = new Array(MAX_POINTS).fill(null);
  }
    function updateYAxisRange(divId, yValues){
    const finite = (yValues||[]).filter(v => Number.isFinite(v) && v >= 0);
    const maxVal = finite.length ? Math.max(...finite) : 0;
    const upper = (maxVal > 0) ? (maxVal * 2) : 1;
    Plotly.relayout(divId, { 'yaxis.autorange': false, 'yaxis.range': [0, upper] });
  }
        function updateXAxisTicks(divId, xVals, labels){
    const tickvals = Array.isArray(xVals) ? xVals : [];
    const vals = Array.isArray(labels) ? labels : [];
    const ticktext = [];
    let prevDate = null;
    let seen = false;
    for(let i=0; i<vals.length; i++){
      const s = String(vals[i] ?? '');
      const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
      let datePart = '', timePart = '';
      if(m){ datePart = m[1]; timePart = m[2]; }
      else { const parts = s.split(/\s+/); datePart = parts[0] || ''; timePart = parts[1] || parts[0] || ''; }
      const hhmm = (timePart || '').split(':').slice(0,2).join(':') || s;
      const isFirstNonEmpty = (!seen && !!datePart);
      const dateChanged = datePart && prevDate && (datePart !== prevDate);
      const showDate = isFirstNonEmpty || dateChanged;
      const dispDate = datePart ? datePart.split('-').slice(0,3).reverse().join('-') : '';
      ticktext.push(showDate && datePart ? `${hhmm}<br>${dispDate}` : hhmm);
      if(datePart){ if(!seen) seen = true; prevDate = datePart; }
    }
    Plotly.relayout(divId, { 'xaxis.tickmode': 'array', 'xaxis.tickvals': tickvals, 'xaxis.ticktext': ticktext });
  }Series.prototype.add = function(key,label,val){
    if(this.keys.includes(key)) return; 
    this.y.shift(); this.y.push(val);
    this.lbl.shift(); this.lbl.push(label);
    this.keys.shift(); this.keys.push(key);
    Plotly.update(this.divId, { x: [this.slotIdx], y: [this.y] });
    updateXAxisTicks(this.divId, this.slotIdx, this.lbl);
    updateYAxisRange(this.divId, this.y);
  };
    Series.prototype.update = function(key,val){
    const i=this.keys.indexOf(key); if(i===-1) return;
    this.y[i]=val; 
    Plotly.restyle(this.divId,{ y:[this.y] });
    updateXAxisTicks(this.divId, this.slotIdx, this.lbl);
    updateYAxisRange(this.divId, this.y);
  };

  initBar('VOC','VOC index','#ff8000', null, null);
  initBar('NOx','NOx index','#ff0040', null, null);
  const sVOC=new Series('VOC');
  const sNOx=new Series('NOx');

  const db=firebase.database();
  const base=db.ref('/historial_mediciones').orderByKey().limitToLast(MAX_POINTS);
    let lastMarkerDateISO = null;
    base.once('value',snap=>{
      const obj=snap.val();
      if(!obj)return;
      const entries = Object.entries(obj).sort(([a],[b])=> (a<b?-1:a>b?1:0));
      const inferredDates = inferDatesForEntries(entries);
      entries.forEach(([k,v], idx)=>{
        const dateISO = inferredDates[idx];
        if(v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha);
        const label=makeTimestampWithDate(dateISO, v);
        sVOC.add(k,label,Math.round(v.voc??0));
        sNOx.add(k,label,Math.round(v.nox??0));
      });
  // Elimina solo los mensajes de carga y restaura padding
  document.querySelectorAll('.'+loadingClass).forEach(n=>{ const p=n.parentElement; n.remove(); if(p) p.style.paddingTop=''; });
    });

  db.ref('/historial_mediciones').limitToLast(1).on('child_added', snap=>{ 
    const k=snap.key, v=snap.val();
    if(v && v.fecha){ lastMarkerDateISO = toIsoDate(v.fecha); }
    const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || toIsoDate());
    const label=makeTimestampWithDate(dateISO, v||{});
    sVOC.add(k,label,Math.round(v?.voc??0)); sNOx.add(k,label,Math.round(v?.nox??0)); 
  });
  db.ref('/historial_mediciones').limitToLast(1).on('child_changed', snap=>{ const k=snap.key,v=snap.val(); sVOC.update(k,Math.round(v.voc??0)); sNOx.update(k,Math.round(v.nox??0)); });
});
