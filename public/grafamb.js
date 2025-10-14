// grafamb.js — CO2, Temperatura, Humedad con agregación (5/15/30/60/360 min) y 24 barras fijas
(function(){
  'use strict';

  const MAX_BARS = 24;
  const INITIAL_FETCH_LIMIT = 5000; // cantidad de muestras crudas a traer para poder promediar distintos bins

  // === UI: selector de agregación ===
  const AGG_CHOICES = [
    { val: 5,   label: '5 min' },
    { val: 15,  label: '15 min' },
    { val: 30,  label: '30 min' },
    { val: 60,  label: '1 hora' },
    { val: 360, label: '6 horas' },
  ];
  let aggMinutes = 5;

  function injectAggUI(){
    const host = document.querySelector('nav') || document.body;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
    wrap.innerHTML = `<label style="font-weight:700">Agrupar cada:</label>
      <select id="aggSelectAmb" style="padding:6px 8px;font-size:14px;border-radius:8px;">
        ${AGG_CHOICES.map(o=>`<option value="${o.val}">${o.label}</option>`).join('')}
      </select>
      <small style="opacity:.75">24 barras</small>`;
    host.insertAdjacentElement('afterend', wrap);
    const sel = wrap.querySelector('#aggSelectAmb');
    sel.value = String(aggMinutes);
    sel.addEventListener('change', e=>{
      aggMinutes = parseInt(e.target.value,10)||5;
      applyAggregation();
    });
  }

  // === Helpers fecha/hora -> timestamp
  function toIsoDate(fecha){
    if(!fecha) return null;
    // Soporta DD-MM-YYYY o YYYY-MM-DD
    const parts = String(fecha).trim().split(/[-/]/);
    if(parts.length !== 3) return null;
    let [a,b,c] = parts;
    // detecta si primer token es año (4 dígitos) o día
    if (a.length === 4) {
      // YYYY-MM-DD
      return `${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`;
    } else {
      // DD-MM-YYYY
      return `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
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
    const lastEnd = floorToBin(endTs, minutes) + minutes*60000; // bins [start,end)
    const bins = [];
    for(let i=count-1;i>=0;i--){
      const end = lastEnd - (count-1-i)*minutes*60000;
      const start = end - minutes*60000;
      bins.push({start,end});
    }
    return bins;
  }
  function avg(list){
    const v = list.filter(n => Number.isFinite(n));
    if(!v.length) return null;
    return v.reduce((a,b)=>a+b,0)/v.length;
  }
  function labelFromStart(ms){
    const d = new Date(ms);
    const yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
    const hh=String(d.getHours()).padStart(2,'0'), mi=String(d.getMinutes()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  // === Serie Plotly utilitaria
  function makeChart(divId, title, yTitle){
    const x = Array.from({length: MAX_BARS}, ()=> '');
    const y = Array.from({length: MAX_BARS}, ()=> null);
    Plotly.newPlot(divId, [{
      x, y, type: 'bar', name: title
    }], {
      title,
      xaxis:{ tickangle:-45, automargin:true },
      yaxis:{ title: yTitle, rangemode:'tozero', autorange:true, fixedrange:false },
      margin:{t:50,l:60,r:20,b:110},
      bargap:0.2,
      paper_bgcolor:'#cce5dc',
      plot_bgcolor:'#cce5dc'
    }, {responsive:true});
    return {divId, title, yTitle};
  }
  function setChartData(chart, labels, values){
    // normaliza a 24
    const lbl = labels.slice(-MAX_BARS);
    const y   = values.slice(-MAX_BARS);
    while(lbl.length<MAX_BARS) lbl.unshift('');
    while(y.length<MAX_BARS)   y.unshift(null);
    Plotly.react(chart.divId, [{x: lbl, y: y, type:'bar', name: chart.title}], {
      title: chart.title,
      xaxis:{ tickangle:-45, automargin:true },
      yaxis:{ title: chart.yTitle, rangemode:'tozero', autorange:true, fixedrange:false },
      margin:{t:50,l:60,r:20,b:110},
      bargap:0.2,
      paper_bgcolor:'#cce5dc',
      plot_bgcolor:'#cce5dc'
    }, {responsive:true});
  }

  // === Estado
  let lastMarkerDateISO = null; // última fecha conocida del día
  let raw = []; // {key, ts, co2, cTe, cHu}
  const db = firebase.database();

  // === Charts
  const chartCO2 = makeChart('CO2', 'CO2 (ppm)', 'ppm');
  const chartTEM = makeChart('TEM', 'Temperatura (°C)', '°C');
  const chartHUM = makeChart('HUM', 'Humedad relativa (%)', '%');

  injectAggUI();

  function applyAggregation(){
    if(!raw.length) return;
    const lastTs = raw[raw.length-1].ts;
    // recorta horizonte para no crecer en memoria
    const horizon = aggMinutes * MAX_BARS * 60000;
    const minTs = lastTs - horizon - 60000;
    raw = raw.filter(r => r.ts >= minTs);

    const bins = buildBins(lastTs, aggMinutes, MAX_BARS);
    const labels = bins.map(b => labelFromStart(b.start));

    const co2Vals = bins.map(b => avg(raw.filter(r=>r.ts>=b.start && r.ts<b.end).map(r=> Number(r.co2))));
    const temVals = bins.map(b => avg(raw.filter(r=>r.ts>=b.start && r.ts<b.end).map(r=> Number(r.cTe))));
    const humVals = bins.map(b => avg(raw.filter(r=>r.ts>=b.start && r.ts<b.end).map(r=> Number(r.cHu))));

    setChartData(chartCO2, labels, co2Vals);
    setChartData(chartTEM, labels, temVals);
    setChartData(chartHUM, labels, humVals);
  }

  // === Carga inicial más amplia para agregación
  const base = db.ref('/historial_mediciones').orderByKey().limitToLast(INITIAL_FETCH_LIMIT);
  base.once('value', snap => {
    const obj = snap.val();
    if(!obj) return;
    const entries = Object.entries(obj).sort(([a],[b]) => (a<b?-1:a>b?1:0)); // viejo->nuevo
    entries.forEach(([k,v])=>{
      if(v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
      const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || new Date().toISOString().slice(0,10));
      const ts = parseTsFrom(dateISO, v||{});
      if(Number.isFinite(ts)){
        raw.push({
          key: k, ts,
          co2: v?.co2 ?? 0,
          cTe: v?.cTe ?? 0,
          cHu: v?.cHu ?? 0
        });
      }
    });
    raw.sort((a,b)=>a.ts-b.ts);
    applyAggregation();
  });

  // === Tiempo real
  const liveRef = db.ref('/historial_mediciones').limitToLast(1);
  liveRef.on('child_added', snap=>{
    const k=snap.key, v=snap.val()||{};
    if(v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
    const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || new Date().toISOString().slice(0,10));
    const ts = parseTsFrom(dateISO, v);
    if(Number.isFinite(ts)){
      raw.push({ key:k, ts, co2: v.co2??0, cTe: v.cTe??0, cHu: v.cHu??0 });
      raw.sort((a,b)=>a.ts-b.ts);
      applyAggregation();
    }
    if(window.staleMsFromFechaHora && window.staleMarkUpdate){
      const msData = window.staleMsFromFechaHora(dateISO, v.hora||v.tiempo);
      window.staleMarkUpdate(msData);
    }
  });
  liveRef.on('child_changed', snap=>{
    const k=snap.key, v=snap.val()||{};
    if(v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
    const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || new Date().toISOString().slice(0,10));
    const ts = parseTsFrom(dateISO, v);
    if(Number.isFinite(ts)){
      const idx = raw.findIndex(r => r.key === k);
      const rec = { key:k, ts, co2: v.co2??0, cTe: v.cTe??0, cHu: v.cHu??0 };
      if(idx>=0) raw[idx] = rec; else raw.push(rec);
      raw.sort((a,b)=>a.ts-b.ts);
      applyAggregation();
    }
    if(window.staleMsFromFechaHora && window.staleMarkUpdate){
      const msData = window.staleMsFromFechaHora(dateISO, v.hora||v.tiempo);
      window.staleMarkUpdate(msData);
    }
  });

})();
