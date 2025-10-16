// grafamb.js — CO2, Temperatura, Humedad con selector compacto, 24 barras, títulos manuales, ejes formateados y Y dinámico
(function () {
  'use strict';

  const MAX_BARS = 24;
  const INITIAL_FETCH_LIMIT = 5000; // histórico suficiente para agregación
  const SAMPLE_BASE_MIN = 5;        // frecuencia de llegada de muestras (cada 5 min)
  const db = firebase.database();

  // Colores originales
  const COLORS = { CO2: '#990000', TEM: '#006600', HUM: '#0000cc' };

  // ===================== CSS del selector (compacto) + títulos manuales =====================
  (function injectSelectorCSS(){
    if (document.getElementById('agg-toolbar-css')) return;
    const style = document.createElement('style');
    style.id = 'agg-toolbar-css';
    style.textContent = `
      .agg-toolbar-wrap{
        display:flex; flex-direction:column; gap:6px; margin:8px 0 4px 0; width:100%;
      }
      .agg-chart-title{
        font-weight:bold; font-size:20px; font-family:Arial; color:#000; text-align:center; line-height:1.1;
      }
      .agg-toolbar-label{
        font-weight:bold; font-size:16px; font-family:Arial; color:#000; text-align:left;
      }
      .agg-toolbar{
        display:flex; gap:6px; flex-wrap:wrap; align-items:center; justify-content:flex-start;
        --agg-btn-w: 80px; /* ancho uniforme de los botones */
      }
      .agg-btn{
        cursor:pointer; user-select:none;
        padding:6px 10px; border-radius:10px;
        background:#e9f4ef; border:2px solid #2a2a2a;
        font-size:12px; font-weight:600; font-family:Arial; color:#000;
        width: var(--agg-btn-w);
        text-align:center;
        transition: transform 0.12s ease, box-shadow 0.12s ease, font-size 0.12s ease;
      }
      .agg-btn:hover{ box-shadow:0 1px 0 rgba(0,0,0,.35); }
      .agg-btn.active{
        transform: scale(1.06);  /* “crece” sin afectar layout */
        font-weight:bold;
        font-family:Arial;
        font-size:14px;
        background:#d9efe7;
      }
    `;
    document.head.appendChild(style);
  })();

  // ===================== Helpers de fecha/hora =====================
  function toIsoDate(fecha) {
    if (!fecha || typeof fecha !== 'string') {
      const d = new Date();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${mm}-${dd}`;
    }
    const parts = fecha.split(/[-/]/);
    if (parts.length !== 3) return new Date().toISOString().slice(0, 10);
    if (parts[0].length === 4) {
      const [yyyy, mm, dd] = parts;
      return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
    } else {
      const [dd, mm, yyyy] = parts;
      return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
    }
  }

  function parseTsFrom(isoDate, v) {
    const raw = (v && (v.hora || v.tiempo)) ? (v.hora || v.tiempo) : '00:00';
    const hhmmss = /^\d{1,2}:\d{2}$/.test(raw) ? `${raw}:00` : raw;
    const ms = Date.parse(`${isoDate}T${hhmmss}`);
    return Number.isFinite(ms) ? ms : null;
  }

  function floorToBin(ts, minutes) {
    const size = minutes * 60000;
    return ts - (ts % size);
  }

  function avg(arr) {
    const v = arr.filter(n => Number.isFinite(n));
    if (!v.length) return null;
    return v.reduce((a,b)=>a+b,0)/v.length;
  }

  function labelFromMs(ms) {
    const d=new Date(ms);
    const yyyy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
    const hh=String(d.getHours()).padStart(2,'0'), mi=String(d.getMinutes()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  // ===================== Etiquetado flexible del eje X =====================
  // Opciones: 'start' | 'end' | 'range'
  const LABEL_MODE = 'end'; // cámbialo a 'end' o 'range' cuando quieras
  // Dónde estampar la fecha cuando cambia el día:
  // 'left-prev'  → fecha del día ANTERIOR bajo el tick izquierdo
  // 'left-next'  → fecha del NUEVO día bajo el tick izquierdo  ← lo que pides
  // 'right'      → fecha del nuevo día bajo el tick derecho
  // 'both'       → fecha anterior en el izquierdo y nueva en el derecho
  const DATE_STAMP_MODE = 'left-next';

  function fmt2(n){ return String(n).padStart(2,'0'); }
  function fmtDate(ms){
    const d = new Date(ms);
    return `${d.getFullYear()}-${fmt2(d.getMonth()+1)}-${fmt2(d.getDate())}`;
  }
  function fmtTime(ms){
    const d = new Date(ms);
    return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
  }

  /**
   * Devuelve la etiqueta del tick según el modo seleccionado.
   * Nota: SIEMPRE usa la fecha del INICIO del bin para mantener el
   * marcador de cambio de día en el “límite izquierdo”.
   */
  function makeBinLabel(binStartMs, minutes, mode = LABEL_MODE){
    const date  = fmtDate(binStartMs);
    const tBeg  = fmtTime(binStartMs);
    const tEnd  = fmtTime(binStartMs + minutes*60000);

    // --- FIX: si minutes === 5 y LABEL_MODE === 'range', NO mostramos rango
    if (minutes === SAMPLE_BASE_MIN) {
      // siempre una sola hora para 5 min
      return `${date} ${tBeg}`;
    }

    if (mode === 'end')   return `${date} ${tEnd}`;
    if (mode === 'range') return `${date} ${tBeg}–${tEnd}`;
    return `${date} ${tBeg}`; // start
  }

  /**
   * Coloca la FECHA en el tick anterior al cambio de día (límite izquierdo).
   * Funciona con etiquetas 'start', 'end' o 'range' porque toma la fecha
   * inicial del bin (que es la que pusimos al inicio de la etiqueta).
   */
  
  function buildTickText(labels) {
    // Mantiene todo el texto de hora: "hh:mm" o "hh:mm–hh:mm"
    const items = labels.map(s => {
      const str = String(s ?? '');
      const m = str.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
      return { date: m ? m[1] : '', timeLabel: m ? m[2] : str };
    });

    const out = items.map(it => it.timeLabel);
    let curr = items[0]?.date || '';
    let stamped = false;

    for (let i = 1; i < items.length; i++) {
      const d = items[i].date;
      if (d && curr && d !== curr) {
        const ddPrev = curr.split('-').reverse().join('-');
        const ddNew  = d.split('-').reverse().join('-');

        switch (DATE_STAMP_MODE) {
          case 'left-prev':
            out[i - 1] = `${items[i - 1].timeLabel}<br>${ddPrev}`;
            break;
          case 'left-next': // ← fecha del día que empieza, pero en el tick izquierdo
            out[i - 1] = `${items[i - 1].timeLabel}<br>${ddNew}`;
            break;
          case 'right':
            out[i] = `${items[i].timeLabel}<br>${ddNew}`;
            break;
          case 'both':
            out[i - 1] = `${items[i - 1].timeLabel}<br>${ddPrev}`;
            out[i]     = `${items[i].timeLabel}<br>${ddNew}`;
            break;
        }
        stamped = true;
        curr = d;
      }
    }

    // Si todo es un mismo día visible, estampa la fecha en el primer tick
    if (!stamped && items[0]?.date) {
      const dd = items[0].date.split('-').reverse().join('-');
      out[0] = `${items[0].timeLabel}<br>${dd}`;
    }
    return out;
  }

  // ===================== Rango dinámico del eje Y =====================
  function updateYAxisRange(divId, yValues){
    const finite = (yValues||[]).filter(v => Number.isFinite(v) && v >= 0);
    const maxVal = finite.length ? Math.max(...finite) : 0;
    const upper  = (maxVal > 0) ? (maxVal * 2) : 1;
    Plotly.relayout(divId, { 'yaxis.autorange': false, 'yaxis.range': [0, upper] });
  }

  // ===================== Estado crudo (todas las muestras) =====================
  let raw = []; // { key, ts, co2, cTe, cHu }
  let lastMarkerDateISO = null;

  // ===================== Config por serie =====================
  const SERIES = {
    CO2: { divId:'CO2', title:'CO2 (ppm)', color:COLORS.CO2, key:'co2', yTitle:'CO2 (ppm)', agg:5, round:false },
    TEM: { divId:'TEM', title:'Temperatura (°C)', color:COLORS.TEM, key:'cTe', yTitle:'Temperatura (°C)', agg:5, round:false },
    HUM: { divId:'HUM', title:'Humedad relativa (%)', color:COLORS.HUM, key:'cHu', yTitle:'Humedad relativa (%)', agg:5, round:true }
  };

  const MENU = [
    { label:'5 min',  val:5   },
    { label:'15 min', val:15  },
    { label:'30 min', val:30  },
    { label:'1 hr',   val:60  },
    { label:'2 hr',   val:120 },
    { label:'4 hr',   val:240 }
  ];

  // ===================== Crear chart + toolbar por serie (título manual) =====================
  function makeChart(cfg) {
    const divId = cfg.divId;

    // Toolbar (encima del chart): TÍTULO MANUAL + etiqueta + botones
    const chartEl = document.getElementById(divId);
    const wrap = document.createElement('div');
    wrap.className = 'agg-toolbar-wrap';
    wrap.innerHTML = `
      <div class="agg-chart-title">${cfg.yTitle}</div>
      <div class="agg-toolbar-label">Seleccione el intervalo de lecturas</div>
      <div class="agg-toolbar" id="tb-${divId}"></div>
    `;
    chartEl.parentElement.insertBefore(wrap, chartEl);

    const toolbar = wrap.querySelector(`#tb-${divId}`);
    MENU.forEach(opt=>{
      const btn = document.createElement('button');
      btn.className = 'agg-btn';
      btn.textContent = opt.label;
      btn.dataset.minutes = String(opt.val);
      if (opt.val === cfg.agg) btn.classList.add('active');
      btn.addEventListener('click', ()=>{
        cfg.agg = opt.val;
        toolbar.querySelectorAll('.agg-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        redrawSeries(cfg);
      });
      toolbar.appendChild(btn);
    });

    // Plotly inicial (sin título de gráfica; títulos solo en ejes)
    const labels = new Array(MAX_BARS).fill('');
    let values = new Array(MAX_BARS).fill(null);

    Plotly.newPlot(divId, [{
      x: labels.map((_,i)=>i),
      y: values,
      type:'bar',
      name: cfg.title,
      marker:{ color: cfg.color }
    }], {
      // title eliminado: se usa el título manual arriba
      xaxis: {
        type: 'category',
        tickmode:'array',
        tickvals: labels.map((_,i)=>i),
        ticktext: buildTickText(labels),
        tickangle:-45,
        automargin:true,
        gridcolor:'black',
        linecolor:'black',
        autorange: true,
        title: { text: '<b>Fecha y Hora de Medición</b>', font: { size:16,color:'black',family:'Arial',weight:'bold'}, standoff: 30 },
        tickfont: { color:'black',size:14,family:'Arial',weight:'bold' }
      },
      yaxis: {
        title: { text: `<b>${cfg.yTitle}</b>`, font: { size:16,color:'black',family:'Arial',weight:'bold' } },
        tickfont: { color:'black',size:14,family:'Arial',weight:'bold' },
        rangemode:'tozero',
        gridcolor:'black',
        linecolor:'black',
        autorange: true,
        fixedrange:false,
      },
      margin:{ t:20, l:60, r:40, b:110 }, // más margen inferior
      bargap:0.2,
      paper_bgcolor:'#cce5dc',
      plot_bgcolor:'#cce5dc',
      showlegend:false
    }, { responsive:true });

    // Y dinámico inicial
    updateYAxisRange(divId, values);
  }

  // ===================== Data builders =====================
  function getLast24RawForKey(key) {
    const last = raw.slice(-MAX_BARS);
    const labels = last.map(r => makeBinLabel(r.ts, SAMPLE_BASE_MIN, LABEL_MODE));
    const values = last.map(r => Number(r[key]));
    return { labels, values };
  }
  // últimos 24 bins CON datos COMPLETOS, sin huecos
  function getAgg24ForKey(key, minutes) {
    if (!raw.length) return { labels: new Array(MAX_BARS).fill(''), values: new Array(MAX_BARS).fill(null) };

    // Agrupa por binStart
    const groups = new Map(); // binStartMs -> {sum,count}
    for (const r of raw) {
      const bin = floorToBin(r.ts, minutes);
      const val = Number(r[key]);
      if (!Number.isFinite(val)) continue;
      const g = groups.get(bin) || { sum:0, count:0 };
      g.sum += val; g.count += 1;
      groups.set(bin, g);
    }

    // Requisito de completitud: al menos minutes / SAMPLE_BASE_MIN mediciones en el bin
    const required = Math.max(1, Math.ceil((minutes / SAMPLE_BASE_MIN) * 0.9));

    // Solo bins completos
    const completeKeys = Array.from(groups.keys())
      .filter(k => groups.get(k).count >= required)
      .sort((a,b)=>a-b);

    const take = completeKeys.slice(-MAX_BARS);
    const labels = take.map(b => makeBinLabel(b, minutes, LABEL_MODE));
    const values = take.map(b => groups.get(b).sum / groups.get(b).count);
    return { labels, values };
  }

  // ===================== Pintado =====================
  function setChartData(cfg, labels, values) {
    // Normaliza a 24
    labels = labels.slice(-MAX_BARS);
    values = values.slice(-MAX_BARS);
    while (labels.length < MAX_BARS) labels.unshift('');
    while (values.length < MAX_BARS) values.unshift(null);
    if (cfg.round) values = values.map(v => Number.isFinite(v) ? Math.round(v) : v);

    const xIdx = labels.map((_,i)=>i);
    Plotly.react(cfg.divId, [{
      x: xIdx, y: values, type:'bar', name: cfg.title, marker:{ color: cfg.color }
    }], {
      // sin title: usamos el manual
      xaxis: {
        type: 'category',
        tickmode:'array',
        tickvals: xIdx,
        ticktext: buildTickText(labels),
        tickangle:-45,
        automargin:true,
        gridcolor:'black',
        linecolor:'black',
        autorange: true,
        title: { text:'<b>Fecha y Hora de Medición</b>', font:{ size:16,color:'black',family:'Arial',weight:'bold' }, standoff: 30 },
        tickfont: { color:'black',size:14,family:'Arial',weight:'bold' }
      },
      yaxis: {
        title: { text:`<b>${cfg.yTitle}</b>`, font:{ size:16,color:'black',family:'Arial',weight:'bold' } },
        tickfont: { color:'black',size:14,family:'Arial',weight:'bold' },
        rangemode:'tozero',
        gridcolor:'black',
        linecolor:'black',
        autorange: true,
        fixedrange:false,
      },
      margin:{ t:20, l:60, r:40, b:110 },
      bargap:0.2,
      paper_bgcolor:'#cce5dc',
      plot_bgcolor:'#cce5dc',
      showlegend:false
    }, { responsive:true });

    // Ajuste dinámico del eje Y después de pintar
    updateYAxisRange(cfg.divId, values);
  }

  function redrawSeries(cfg) {
    const data = (cfg.agg === 5) ? getLast24RawForKey(cfg.key)
                                 : getAgg24ForKey(cfg.key, cfg.agg);
    setChartData(cfg, data.labels, data.values);
  }

  // ===================== Crear charts =====================
  Object.values(SERIES).forEach(makeChart);

  // ===================== Carga inicial (histórico) =====================
  const base = db.ref('/historial_mediciones').orderByKey().limitToLast(INITIAL_FETCH_LIMIT);
  base.once('value', snap => {
    const obj = snap.val(); if (!obj) return;
    const entries = Object.entries(obj).sort(([a],[b]) => (a<b?-1:a>b?1:0));
    entries.forEach(([k,v])=>{
      if (v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
      const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || new Date().toISOString().slice(0,10));
      const ts = parseTsFrom(dateISO, v||{});
      if (Number.isFinite(ts)){
        raw.push({ key:k, ts, co2: v?.co2 ?? 0, cTe: v?.cTe ?? 0, cHu: v?.cHu ?? 0 });
      }
    });
    raw.sort((a,b)=>a.ts-b.ts);
    Object.values(SERIES).forEach(redrawSeries);
  });

  // ===================== Tiempo real =====================
  const liveRef = db.ref('/historial_mediciones').limitToLast(1);

  liveRef.on('child_added', snap => {
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
      const msData = window.staleMsFromFechaHora(dateISO, v.hora || v.tiempo);
      window.staleMarkUpdate(msData);
    }
  });

  liveRef.on('child_changed', snap => {
    const k = snap.key, v = snap.val() || {};
    if (v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
    const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || new Date().toISOString().slice(0,10));
    const ts = parseTsFrom(dateISO, v);
    if (Number.isFinite(ts)){
      const idx = raw.findIndex(r=>r.key===k);
      const rec = { key:k, ts, co2:v?.co2??0, cTe:v?.cTe??0, cHu:v?.cHu??0 };
      if (idx>=0) raw[idx]=rec; else raw.push(rec);
      raw.sort((a,b)=>a.ts-b.ts);
      Object.values(SERIES).forEach(redrawSeries);
    }
    if (window.staleMsFromFechaHora && window.staleMarkUpdate){
      const msData = window.staleMsFromFechaHora(dateISO, v.hora || v.tiempo);
      window.staleMarkUpdate(msData);
    }
  });

})();
