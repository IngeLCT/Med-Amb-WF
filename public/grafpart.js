// grafpart.js — PM1.0, PM2.5, PM4.0, PM10 con selector, 24 barras, títulos manuales y ejes formateados + Y dinámico
(function () {
  'use strict';

  const MAX_BARS = 24;
  const INITIAL_FETCH_LIMIT = 5000;  // histórico suficiente para agregación
  const SAMPLE_BASE_MIN = 5;         // una muestra cada 5 minutos
  const db = firebase.database();

  // Colores (respetando los originales)
  const COLORS = {
    PM1:  'red',
    PM25: '#bfa600',  // amarillo oscuro
    PM40: '#00bfbf',  // turquesa
    PM10: '#bf00ff'
  };

  // ============= CSS del selector (compacto) + títulos manuales =============
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
        --agg-btn-w: 96px;
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
        transform: scale(1.25);
        font-weight:bold;
        font-family:Arial;
        font-size:18px;
        background:#d9efe7;
      }
    `;
    document.head.appendChild(style);
  })();

  // --- Binning alineado a medianoche local ---
  function startOfLocalDayMs(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);            // medianoche LOCAL del día de ms
    return d.getTime();
  }

  function floorToBinLocal(ms, minutes) {
    const day0   = startOfLocalDayMs(ms);
    const wMs    = minutes * 60000;
    const offset = ms - day0;          // ms transcurridos desde medianoche local
    const binOff = Math.floor(offset / wMs) * wMs;
    return day0 + binOff;              // inicio del bin (LOCAL) que contiene ms
  }

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
  const LABEL_MODE = 'start'; // cámbialo a 'end' o 'range' cuando quieras
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
  
  // Acepta YYYY-MM-DD o DD-MM-YYYY. Resuelve el caso especial 4h.
  function buildTickText(labels, minutes) {
    // 1) Parseo de fecha + HORA INICIAL (soporta 'start'/'end'/'range')
    const items = labels.map(s => {
      const str = String(s ?? '');
      // date = YYYY-MM-DD o DD-MM-YYYY ; time = HH:MM (toma la inicial si fuese rango)
      const m = str.match(
        /^((?:\d{4}-\d{2}-\d{2})|(?:\d{2}-\d{2}-\d{4}))\s+(\d{1,2}:\d{2})/
      );
      return { date: m ? m[1] : '', time: m ? m[2] : str };
    });

    // 2) Base: solo la hora
    const out = items.map(it => it.time);
    let stamped = false;

    // 3) Caso especial 4h: estampar fecha en ticks 00:00 (o en el primero visible)
    if (minutes === 240) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].time === '00:00' && items[i].date) {
          const d = items[i].date;
          const ddmmyyyy = /^\d{4}/.test(d) ? d.split('-').reverse().join('-') : d;
          out[i] = `${items[i].time}<br>${ddmmyyyy}`;
          stamped = true;
        }
      }
      if (!stamped && items[0]?.date) {
        const d0 = items[0].date;
        const ddmmyyyy0 = /^\d{4}/.test(d0) ? d0.split('-').reverse().join('-') : d0;
        out[0] = `${items[0].time}<br>${ddmmyyyy0}`;
        stamped = true;
      }
    } else {
      // 4) Resto de intervalos: fecha en el tick adecuado según DATE_STAMP_MODE
      let curr = items[0]?.date || '';
      for (let i = 1; i < items.length; i++) {
        const d = items[i].date;
        if (d && curr && d !== curr) {
          const ddPrev = /^\d{4}/.test(curr) ? curr.split('-').reverse().join('-') : curr;
          const ddNew  = /^\d{4}/.test(d)    ? d.split('-').reverse().join('-')    : d;
          switch (DATE_STAMP_MODE) {
            case 'left-prev':
              out[i - 1] = `${items[i - 1].time}<br>${ddPrev}`;
              break;
            case 'left-next':
              out[i - 1] = `${items[i - 1].time}<br>${ddNew}`;
              break;
            case 'right':
              out[i] = `${items[i].time}<br>${ddNew}`;
              break;
            case 'both':
              out[i - 1] = `${items[i - 1].time}<br>${ddPrev}`;
              out[i]     = `${items[i].time}<br>${ddNew}`;
              break;
          }
          stamped = true;
          curr = d;
        }
      }
    }

    // 5) Si toda la ventana es un solo día, estampa fecha en el primer tick
    if (!stamped && items[0]?.date) {
      const dd = /^\d{4}/.test(items[0].date)
        ? items[0].date.split('-').reverse().join('-')
        : items[0].date;
      out[0] = `${items[0].time}<br>${dd}`;
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

  // ===================== Estado crudo =====================
  // Cada registro: { key, ts, pm1p0, pm2p5, pm4p0, pm10p0 }
  let raw = [];
  let lastMarkerDateISO = null;

  // ===================== Config por serie =====================
  const SERIES = {
    PM1:  { divId:'chartPM1',   title:'PM1.0 µg/m³',   color:COLORS.PM1,  key:'pm1p0', yTitle:'PM1.0 µg/m³',   agg:5 },
    PM25: { divId:'chartPM2_5', title:'PM2.5 µg/m³',   color:COLORS.PM25, key:'pm2p5', yTitle:'PM2.5 µg/m³',   agg:5 },
    PM40: { divId:'chartPM4_0', title:'PM4.0 µg/m³',   color:COLORS.PM40, key:'pm4p0', yTitle:'PM4.0 µg/m³',   agg:5 },
    PM10: { divId:'chartPM10',  title:'PM10.0 µg/m³',  color:COLORS.PM10, key:'pm10p0',yTitle:'PM10.0 µg/m³',  agg:5 }
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
    const chartEl = document.getElementById(divId);

    // Título manual + selector
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

    // Plotly inicial
    const labels = new Array(MAX_BARS).fill('');
    const values = new Array(MAX_BARS).fill(null);
    Plotly.newPlot(divId, [{
      x: labels.map((_,i)=>i),
      y: values,
      type:'bar',
      name: cfg.title,
      marker:{ color: cfg.color }
    }], {
      // sin title (usamos el manual)
      xaxis: {
        type: 'category',
        tickmode:'array',
        tickvals: labels.map((_,i)=>i),
        ticktext: buildTickText(labels, cfg.agg),
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
        fixedrange:false
      },
      margin:{ t:20, l:60, r:40, b:110 },
      bargap:0.2,
      paper_bgcolor:'#cce5dc',
      plot_bgcolor:'#cce5dc',
      showlegend:false
    }, { responsive:true });

    // Ajuste inicial de Y (aunque todo sea null, quedará [0,1])
    updateYAxisRange(divId, values);
  }

  // ===================== Data builders =====================
  // 5 min: últimas 24 crudas (por key)
  function getLast24RawForKey(key) {
    const last = raw.slice(-MAX_BARS);
    const labels = last.map(r => makeBinLabel(r.ts, SAMPLE_BASE_MIN, LABEL_MODE));
    const values = last.map(r => Number(r[key]));
    return { labels, values };
  }

  // Agregado: últimos 24 bins COMPLETOS (sin huecos) y SIN mostrar el bin en curso
  function getAgg24ForKey(key, minutes) {
    if (!raw.length) {
      return { labels: new Array(MAX_BARS).fill(''), values: new Array(MAX_BARS).fill(null) };
    }

    const widthMs = minutes * 60000;
    let lastTs = 0;

    // 1) Agrupar por bin y registrar el último timestamp recibido
    const groups = new Map(); // binStartMs -> {sum, count}
    for (const r of raw) {
      const val = Number(r[key]);
      if (!Number.isFinite(val)) continue;
      if (r.ts > lastTs) lastTs = r.ts;

      const bin = floorToBinLocal(r.ts, minutes);
      const g = groups.get(bin) || { sum: 0, count: 0 };
      g.sum += val; g.count += 1;
      groups.set(bin, g);
    }

    // 2) Excluir el bin cuyo FIN aún no llega (bin en curso)
    //    Solo consideramos bins cuyo fin (binStart + width) <= último dato
    const endedBins = Array.from(groups.keys())
      .filter(b => (b + widthMs) <= lastTs);

    // 3) Umbral de cobertura 0.85 solo sobre bins TERMINADOS
    const expected  = minutes / SAMPLE_BASE_MIN;                  // p.ej. 15/5 = 3
    const required  = Math.max(1, Math.ceil(expected * 0.85));    // tu nuevo umbral
    const complete  = endedBins.filter(b => groups.get(b).count >= required)
                              .sort((a,b) => a - b);

    // 4) Preparar últimas 24 barras
    const take   = complete.slice(-MAX_BARS);
    const labels = take.map(b => makeBinLabel(b, minutes, LABEL_MODE));
    const values = take.map(b => groups.get(b).sum / groups.get(b).count);

    return { labels, values };
  }


  // ===================== Pintado =====================
  function setChartData(cfg, labels, values) {
    labels = labels.slice(-MAX_BARS);
    values = values.slice(-MAX_BARS);
    while (labels.length < MAX_BARS) labels.unshift('');
    while (values.length < MAX_BARS) values.unshift(null);

    const xIdx = labels.map((_,i)=>i);
    Plotly.react(cfg.divId, [{
      x: xIdx, y: values, type:'bar', name: cfg.title, marker:{ color: cfg.color }
    }], {
      xaxis: {
        type: 'category',
        tickmode:'array',
        tickvals: xIdx,
        ticktext: buildTickText(labels, cfg.agg),
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
        fixedrange:false
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
    const entries = Object.entries(obj).sort(([a],[b]) => (a<b?-1:a>b?1:0)); // viejo->nuevo
    entries.forEach(([k,v])=>{
      if (v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
      const dateISO = (v && v.fecha) ? toIsoDate(v.fecha)
                                     : (lastMarkerDateISO || new Date().toISOString().slice(0,10));
      const ts = parseTsFrom(dateISO, v||{});
      if (Number.isFinite(ts)){
        raw.push({
          key:k, ts,
          pm1p0: v?.pm1p0 ?? 0,
          pm2p5: v?.pm2p5 ?? 0,
          pm4p0: v?.pm4p0 ?? 0,
          pm10p0: v?.pm10p0 ?? 0
        });
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
    const dateISO = (v && v.fecha) ? toIsoDate(v.fecha)
                                   : (lastMarkerDateISO || new Date().toISOString().slice(0,10));
    const ts = parseTsFrom(dateISO, v);
    if (Number.isFinite(ts)){
      raw.push({
        key:k, ts,
        pm1p0: v?.pm1p0 ?? 0,
        pm2p5: v?.pm2p5 ?? 0,
        pm4p0: v?.pm4p0 ?? 0,
        pm10p0: v?.pm10p0 ?? 0
      });
      raw.sort((a,b)=>a.ts-b.ts);
      Object.values(SERIES).forEach(redrawSeries);
    }
    // Alerta de inactividad (si está disponible)
    if (window.staleMsFromFechaHora && window.staleMarkUpdate) {
      const msData = window.staleMsFromFechaHora(dateISO, v.hora || v.tiempo);
      window.staleMarkUpdate(msData);
    }
  });

  liveRef.on('child_changed', snap => {
    const k = snap.key, v = snap.val() || {};
    if (v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
    const dateISO = (v && v.fecha) ? toIsoDate(v.fecha)
                                   : (lastMarkerDateISO || new Date().toISOString().slice(0,10));
    const ts = parseTsFrom(dateISO, v);
    if (Number.isFinite(ts)){
      const idx = raw.findIndex(r=>r.key===k);
      const rec = {
        key:k, ts,
        pm1p0: v?.pm1p0 ?? 0,
        pm2p5: v?.pm2p5 ?? 0,
        pm4p0: v?.pm4p0 ?? 0,
        pm10p0: v?.pm10p0 ?? 0
      };
      if (idx>=0) raw[idx] = rec; else raw.push(rec);
      raw.sort((a,b)=>a.ts-b.ts);
      Object.values(SERIES).forEach(redrawSeries);
    }
    if (window.staleMsFromFechaHora && window.staleMarkUpdate) {
      const msData = window.staleMsFromFechaHora(dateISO, v.hora || v.tiempo);
      window.staleMarkUpdate(msData);
    }
  });

})();
