// grafamb.js — CO2, Temperatura, Humedad con AGRUPACIÓN por serie y 24 barras
(function(){
  'use strict';

  // ====== Parámetros generales ======
  const MAX_BARS = 24;
  const INITIAL_FETCH_LIMIT = 5000; // trae suficientes muestras para poder agregar (hasta 6h*24)
  const db = firebase.database();

  // Colores originales
  const COLORS = {
    CO2: '#990000',   // rojo
    TEM: '#006600',   // verde
    HUM: '#0000cc'    // azul
  };

  // ====== Helpers de fecha/hora ======
  function toIsoDate(fecha){
    if (!fecha || typeof fecha !== 'string'){
      const d=new Date();
      const mm=String(d.getMonth()+1).padStart(2,'0');
      const dd=String(d.getDate()).padStart(2,'0');
      return `${d.getFullYear()}-${mm}-${dd}`;
    }
    const parts = fecha.split(/[-/]/);
    if (parts.length !== 3) return new Date().toISOString().slice(0,10);
    // detecta formato DD-MM-YYYY o YYYY-MM-DD
    if (parts[0].length === 4) {
      const [yyyy, mm, dd] = parts;
      return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
    } else {
      const [dd, mm, yyyy] = parts;
      return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
    }
  }
  function parseTsFrom(isoDate, v){
    const raw = (v && (v.hora || v.tiempo)) ? (v.hora || v.tiempo) : '00:00';
    const hhmmss = /^\d{1,2}:\d{2}$/.test(raw) ? `${raw}:00` : raw;
    const ms = Date.parse(`${isoDate}T${hhmmss}`);
    return Number.isFinite(ms) ? ms : null;
  }
  function floorToBin(ts, minutes){
    const size = minutes * 60000;
    return ts - (ts % size);
  }
  function buildBins(endTs, minutes, count=MAX_BARS){
    const lastEnd = floorToBin(endTs, minutes) + minutes*60000; // [start,end)
    const out = [];
    for (let i=count-1; i>=0; i--){
      const end = lastEnd - (count-1-i)*minutes*60000;
      const start = end - minutes*60000;
      out.push({ start, end });
    }
    return out;
  }
  function avg(list){
    const v = list.filter(n => Number.isFinite(n));
    if (!v.length) return null;
    return v.reduce((a,b)=>a+b,0)/v.length;
  }
  function labelFromMs(startMs){
    const d=new Date(startMs);
    const yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
    const hh=String(d.getHours()).padStart(2,'0'), mi=String(d.getMinutes()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  // ====== Eje y formato de ticks ======
  function updateYAxisRange(divId, yValues){
    const finite = (yValues||[]).filter(v=>Number.isFinite(v) && v>=0);
    const maxVal = finite.length ? Math.max(...finite) : 0;
    const upper  = (maxVal>0) ? (maxVal*2) : 1;
    Plotly.relayout(divId, { 'yaxis.autorange': false, 'yaxis.range': [0, upper] });
  }
  function updateXAxisTicks(divId, labels){
    const tickvals = labels.map((_,i)=>i);
    const ticktext = [];
    let prevDate = null;
    let seen = false;
    for(let i=0; i<labels.length; i++){
      const s = String(labels[i] ?? '');
      const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
      let datePart='', timePart='';
      if(m){ datePart=m[1]; timePart=m[2]; }
      else {
        const parts=s.split(/\s+/);
        datePart = parts[0] || '';
        timePart = parts[1] || parts[0] || '';
      }
      const hhmm = (timePart || '').split(':').slice(0,2).join(':') || s;
      const isFirstNonEmpty = (!seen && !!datePart);
      const dateChanged = datePart && prevDate && (datePart !== prevDate);
      const showDate = isFirstNonEmpty || dateChanged;
      const dispDate = datePart ? datePart.split('-').slice(0,3).reverse().join('-') : '';
      ticktext.push(showDate && datePart ? `${hhmm}<br>${dispDate}` : hhmm);
      if(datePart){ if(!seen) seen = true; prevDate = datePart; }
    }
    Plotly.relayout(divId, { 'xaxis.tickmode':'array', 'xaxis.tickvals':tickvals, 'xaxis.ticktext':ticktext });
  }

  // ====== Crear gráfico vacío ======
  function makeChart(divId, title, color, yTitle){
    const labels = new Array(MAX_BARS).fill('');
    const values = new Array(MAX_BARS).fill(null);
    Plotly.newPlot(divId, [{
      x: labels.map((_,i)=>i),
      y: values,
      type:'bar',
      name: title,
      marker: { color }
    }], {
      title: { text:title, font:{size:20,color:'black',family:'Arial',weight:'bold'} },
      xaxis: {
        title: { text:'Fecha y Hora de Medición', font:{size:16,color:'black',family:'Arial',weight:'bold'}, standoff:30 },
        type:'category',
        tickfont:{color:'black',size:14,family:'Arial',weight:'bold'},
        gridcolor:'black',
        linecolor:'black',
        autorange:true,
        tickangle:-45
      },
      yaxis: {
        title: { text:yTitle, font:{size:16,color:'black',family:'Arial',weight:'bold'} },
        tickfont:{color:'black',size:14,family:'Arial',weight:'bold'},
        gridcolor:'black',
        linecolor:'black',
        autorange:true,
        fixedrange:false,
        rangemode:'tozero'
      },
      plot_bgcolor:'#cce5dc',
      paper_bgcolor:'#cce5dc',
      margin:{t:50,l:60,r:40,b:110},
      bargap:0.2
    }, { responsive:true, useResizeHandler:true });
    return { labels, values };
  }
  function setChart(divId, title, color, yTitle, labels, values){
    const xIdx = labels.map((_,i)=>i);
    Plotly.react(divId, [{
      x: xIdx, y: values, type:'bar', name:title, marker:{ color }
    }], {
      title: { text:title, font:{size:20,color:'black',family:'Arial',weight:'bold'} },
      xaxis: {
        title: { text:'Fecha y Hora de Medición', font:{size:16,color:'black',family:'Arial',weight:'bold'}, standoff:30 },
        type:'category',
        tickfont:{color:'black',size:14,family:'Arial',weight:'bold'},
        gridcolor:'black',
        linecolor:'black',
        autorange:true,
        tickangle:-45
      },
      yaxis: {
        title: { text:yTitle, font:{size:16,color:'black',family:'Arial',weight:'bold'} },
        tickfont:{color:'black',size:14,family:'Arial',weight:'bold'},
        gridcolor:'black',
        linecolor:'black',
        autorange:true,
        fixedrange:false,
        rangemode:'tozero'
      },
      plot_bgcolor:'#cce5dc',
      paper_bgcolor:'#cce5dc',
      margin:{t:50,l:60,r:40,b:110},
      bargap:0.2
    }, { responsive:true, useResizeHandler:true });
    updateXAxisTicks(divId, labels);
    updateYAxisRange(divId, values);
  }

  // ====== Select de agregación por serie ======
  const AGG_CHOICES = [
    { val: 5,   label: '5 min' },
    { val: 15,  label: '15 min' },
    { val: 30,  label: '30 min' },
    { val: 60,  label: '1 hora' },
    { val: 360, label: '6 horas' }
  ];
  function injectAggSelect(divId, initialVal, onChange){
    const chart = document.getElementById(divId);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:flex-end;margin:6px 0;';
    wrap.innerHTML = `<label style="font-weight:700">Agrupar:</label>
      <select style="padding:4px 8px;border-radius:8px" data-for="${divId}">
        ${AGG_CHOICES.map(o=>`<option value="${o.val}">${o.label}</option>`).join('')}
      </select>`;
    chart.parentElement.insertBefore(wrap, chart); // arriba del chart
    const sel = wrap.querySelector('select');
    sel.value = String(initialVal);
    sel.addEventListener('change', e => onChange(parseInt(e.target.value,10)||5));
  }

  // ====== Estado global de datos crudos ======
  // Guardamos todas las muestras con timestamp
  // { key, ts, co2, cTe, cHu }
  let raw = [];
  let lastMarkerDateISO = null;

  // ====== Configuración de cada serie ======
  const SERIES = {
    CO2: { divId:'CO2', title:'CO2 ppm', color:COLORS.CO2, key:'co2', yTitle:'ppm', agg:5 },
    TEM: { divId:'TEM', title:'Temperatura °C', color:COLORS.TEM, key:'cTe', yTitle:'°C', agg:5 },
    HUM: { divId:'HUM', title:'Humedad Relativa %', color:COLORS.HUM, key:'cHu', yTitle:'%',  agg:5, round:true }
  };

  // Crea charts vacíos y selects por serie
  Object.values(SERIES).forEach(cfg=>{
    makeChart(cfg.divId, cfg.title, cfg.color, cfg.yTitle);
    injectAggSelect(cfg.divId, cfg.agg, (newAgg)=>{
      cfg.agg = newAgg;
      redrawSeries(cfg);
    });
  });

  // ====== Render para una serie ======
  function getLast24RawForKey(key){
    // toma los últimos 24 registros crudos y devuelve labels/values
    const last = raw.slice(-MAX_BARS);
    const labels = last.map(r => labelFromMs(r.ts));
    let values = last.map(r => Number(r[key]));
    if (key === 'cHu') {
      values = values.map(v => Number.isFinite(v) ? Math.round(v) : v);
    }
    return { labels, values };
  }
  function getAgg24ForKey(key, minutes){
    if (!raw.length) return { labels: new Array(MAX_BARS).fill(''), values: new Array(MAX_BARS).fill(null) };
    const lastTs = raw[raw.length-1].ts;
    const bins = buildBins(lastTs, minutes, MAX_BARS);
    const labels = bins.map(b => labelFromMs(b.start));
    let values = bins.map(b => {
      const nums = raw.filter(r => r.ts>=b.start && r.ts<b.end).map(r => Number(r[key]));
      return avg(nums);
    });
    if (key === 'cHu'){
      values = values.map(v => Number.isFinite(v) ? Math.round(v) : v);
    }
    return { labels, values };
  }
  function redrawSeries(cfg){
    let data;
    if (cfg.agg === 5) data = getLast24RawForKey(cfg.key);
    else data = getAgg24ForKey(cfg.key, cfg.agg);
    // Completa a 24
    let labels = data.labels.slice(-MAX_BARS);
    let values = data.values.slice(-MAX_BARS);
    while (labels.length < MAX_BARS) labels.unshift('');
    while (values.length < MAX_BARS) values.unshift(null);
    setChart(cfg.divId, cfg.title, cfg.color, cfg.yTitle, labels, values);
  }

  // ====== Carga inicial amplia para agregación ======
  const base = db.ref('/historial_mediciones').orderByKey().limitToLast(INITIAL_FETCH_LIMIT);
  base.once('value', snap=>{
    const obj = snap.val();
    if (!obj) return;
    const entries = Object.entries(obj).sort(([a],[b]) => (a<b?-1:a>b?1:0)); // viejo->nuevo
    entries.forEach(([k,v])=>{
      if (v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
      const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || new Date().toISOString().slice(0,10));
      const ts = parseTsFrom(dateISO, v||{});
      if (Number.isFinite(ts)){
        raw.push({
          key:k, ts,
          co2: v?.co2 ?? 0,
          cTe: v?.cTe ?? 0,
          cHu: v?.cHu ?? 0
        });
      }
    });
    raw.sort((a,b)=>a.ts-b.ts);
    // Render inicial según agg de cada serie (5 min -> últimos 24 crudos)
    Object.values(SERIES).forEach(redrawSeries);
  });

  // ====== Suscripciones en vivo ======
  const liveRef = db.ref('/historial_mediciones').limitToLast(1);
  liveRef.on('child_added', snap=>{
    const k = snap.key, v = snap.val() || {};
    if (v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
    const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || new Date().toISOString().slice(0,10));
    const ts = parseTsFrom(dateISO, v);
    if (Number.isFinite(ts)){
      raw.push({ key:k, ts, co2:v?.co2??0, cTe:v?.cTe??0, cHu:v?.cHu??0 });
      raw.sort((a,b)=>a.ts-b.ts);
      Object.values(SERIES).forEach(redrawSeries);
    }
    if (window.staleMsFromFechaHora && window.staleMarkUpdate){
      const msData = window.staleMsFromFechaHora(dateISO, v.hora||v.tiempo);
      window.staleMarkUpdate(msData);
    }
  });
  liveRef.on('child_changed', snap=>{
    const k = snap.key, v = snap.val() || {};
    if (v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
    const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || new Date().toISOString().slice(0,10));
    const ts = parseTsFrom(dateISO, v);
    if (Number.isFinite(ts)){
      const idx = raw.findIndex(r => r.key === k);
      const rec = { key:k, ts, co2:v?.co2??0, cTe:v?.cTe??0, cHu:v?.cHu??0 };
      if (idx>=0) raw[idx] = rec; else raw.push(rec);
      raw.sort((a,b)=>a.ts-b.ts);
      Object.values(SERIES).forEach(redrawSeries);
    }
    if (window.staleMsFromFechaHora && window.staleMarkUpdate){
      const msData = window.staleMsFromFechaHora(dateISO, v.hora||v.tiempo);
      window.staleMarkUpdate(msData);
    }
  });

})();
