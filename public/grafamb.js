// grafamb.js — CO2, Temperatura, Humedad con selector (updatemenus), 24 barras y sin huecos
(function () {
  'use strict';

  const MAX_BARS = 24;
  const INITIAL_FETCH_LIMIT = 5000;           // Trae suficiente histórico para agregar
  const db = firebase.database();

  // Colores originales
  const COLORS = { CO2: '#990000', TEM: '#006600', HUM: '#0000cc' };

  // --- Helpers de fecha/hora ---
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
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    } else {
      const [dd, mm, yyyy] = parts;
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
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
  function avg(list) {
    const v = list.filter(n => Number.isFinite(n));
    if (!v.length) return null;
    return v.reduce((a, b) => a + b, 0) / v.length;
  }
  function labelFromMs(ms) {
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  // --- Eje X categórico sin huecos: generador de ticktext amigable ---
  function buildTickText(labels) {
    const ticktext = [];
    let prevDate = null;
    let seen = false;
    for (let i = 0; i < labels.length; i++) {
      const s = String(labels[i] ?? '');
      const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/);
      let datePart = '', timePart = '';
      if (m) { datePart = m[1]; timePart = m[2]; }
      const ddmmyyyy = datePart ? datePart.split('-').reverse().join('-') : '';
      const isFirst = (!seen && !!datePart);
      const changed = datePart && prevDate && (datePart !== prevDate);
      const showDate = isFirst || changed;
      ticktext.push(showDate && datePart ? `${timePart}<br>${ddmmyyyy}` : (timePart || s));
      if (datePart) { if (!seen) seen = true; prevDate = datePart; }
    }
    return ticktext;
  }

  // --- Menú de selector por gráfica (updatemenus) ---
  const MENU_LABELS = ['5 min', '15 min', '30 min', '1 hr', '6 hr'];
  const MENU_MAP = { '5 min': 5, '15 min': 15, '30 min': 30, '1 hr': 60, '6 hr': 360 };
  const AGG_TO_INDEX = { 5: 0, 15: 1, 30: 2, 60: 3, 360: 4 };

  function buildUpdateMenu(activeIndex = 0) {
    return [{
      type: 'buttons',
      direction: 'right',
      x: 0.01, y: 1.20,
      xanchor: 'left', yanchor: 'bottom',
      showactive: true,
      active: activeIndex,
      bgcolor: '#e9f4ef',
      bordercolor: '#2a2a2a',
      borderwidth: 2,
      pad: { l: 6, r: 6, t: 6, b: 6 },
      font: { size: 16 },            // ← letra más grande
      buttons: MENU_LABELS.map(lbl => ({
        label: lbl,
        method: 'update',
        args: [ {}, {} ]             // no cambiamos nada desde Plotly; gestionamos en evento
      }))
    }];
  }

  function buildSelectorAnnotation() {
    return [{
      xref: 'paper', yref: 'paper',
      x: 0.01, y: 1.30,
      xanchor: 'left', yanchor: 'bottom',
      showarrow: false,
      text: '<b>Seleccione el intervalo de lecturas</b>',
      font: { size: 16, color: '#000' }
    }];
  }

  // --- Estado global crudo ---
  let raw = [];                 // { key, ts, co2, cTe, cHu }
  let lastMarkerDateISO = null;

  // --- Config por serie ---
  const SERIES = {
    CO2: { divId: 'CO2', title: 'CO2 (ppm)', color: COLORS.CO2, key: 'co2', yTitle: 'ppm', agg: 5, round: false },
    TEM: { divId: 'TEM', title: 'Temperatura (°C)', color: COLORS.TEM, key: 'cTe', yTitle: '°C',  agg: 5, round: false },
    HUM: { divId: 'HUM', title: 'Humedad relativa (%)', color: COLORS.HUM, key: 'cHu', yTitle: '%',   agg: 5, round: true  }
  };

  // --- Creación de chart vacío + menú + etiqueta por serie ---
  function makeChart(cfg) {
    const divId = cfg.divId;
    const labels = new Array(MAX_BARS).fill('');
    const values = new Array(MAX_BARS).fill(null);

    Plotly.newPlot(divId, [{
      x: labels.map((_, i) => i),   // categórico: 0..N-1
      y: values,
      type: 'bar',
      name: cfg.title,
      marker: { color: cfg.color }
    }], {
      title: cfg.title,
      updatemenus: buildUpdateMenu(AGG_TO_INDEX[cfg.agg]),
      annotations: buildSelectorAnnotation(),
      xaxis: {
        type: 'category',           // ← categórico, sin huecos
        tickmode: 'array',
        tickvals: labels.map((_, i) => i),
        ticktext: buildTickText(labels),
        tickangle: -45,
        automargin: true
      },
      yaxis: {
        title: cfg.yTitle,
        rangemode: 'tozero',
        autorange: true,
        fixedrange: false
      },
      margin: { t: 70, l: 60, r: 20, b: 110 },
      bargap: 0.2,
      paper_bgcolor: '#cce5dc',
      plot_bgcolor: '#cce5dc',
      showlegend: false
    }, { responsive: true, displayModeBar: true });

    // Manejar clicks del menú de esta gráfica
    const el = document.getElementById(divId);
    el.on('plotly_buttonclicked', (ev) => {
      const lbl = ev?.button?.label;
      const pick = MENU_MAP[lbl];
      if (!pick) return;
      cfg.agg = pick;
      redrawSeries(cfg);
    });
  }

  // --- Set data en un chart (con 24 barras y ticks formateados) ---
  function setChartData(cfg, labels, values) {
    // normaliza a 24
    labels = labels.slice(-MAX_BARS);
    values = values.slice(-MAX_BARS);
    while (labels.length < MAX_BARS) labels.unshift('');
    while (values.length < MAX_BARS) values.unshift(null);
    if (cfg.round) values = values.map(v => Number.isFinite(v) ? Math.round(v) : v);

    const xIdx = labels.map((_, i) => i);
    Plotly.react(cfg.divId, [{
      x: xIdx,
      y: values,
      type: 'bar',
      name: cfg.title,
      marker: { color: cfg.color }
    }], {
      title: cfg.title,
      updatemenus: buildUpdateMenu(AGG_TO_INDEX[cfg.agg]),   // mantiene botón activo
      annotations: buildSelectorAnnotation(),
      xaxis: {
        type: 'category',
        tickmode: 'array',
        tickvals: xIdx,
        ticktext: buildTickText(labels),
        tickangle: -45,
        automargin: true
      },
      yaxis: {
        title: cfg.yTitle,
        rangemode: 'tozero',
        autorange: true,
        fixedrange: false
      },
      margin: { t: 70, l: 60, r: 20, b: 110 },
      bargap: 0.2,
      paper_bgcolor: '#cce5dc',
      plot_bgcolor: '#cce5dc',
      showlegend: false
    }, { responsive: true });
  }

  // --- 5 min: últimas 24 muestras crudas (sin huecos porque X es categórico) ---
  function getLast24RawForKey(key) {
    const last = raw.slice(-MAX_BARS);
    const labels = last.map(r => labelFromMs(r.ts));
    const values = last.map(r => Number(r[key]));
    return { labels, values };
  }

  // --- Agregación: últimos 24 bins CON DATOS (salta bins vacíos) ---
  function getAgg24ForKey(key, minutes) {
    if (!raw.length) return { labels: new Array(MAX_BARS).fill(''), values: new Array(MAX_BARS).fill(null) };

    // Agrupa por binStart = floorToBin(ts)
    const groups = new Map(); // binStartMs -> {sum,count}
    for (const r of raw) {
      const bin = floorToBin(r.ts, minutes);
      const val = Number(r[key]);
      if (!Number.isFinite(val)) continue;
      const g = groups.get(bin) || { sum: 0, count: 0 };
      g.sum += val; g.count += 1;
      groups.set(bin, g);
    }
    // Ordena y toma los últimos 24 bins con datos
    const binKeys = Array.from(groups.keys()).sort((a, b) => a - b);
    const take = binKeys.slice(-MAX_BARS);
    const labels = take.map(b => labelFromMs(b));
    const values = take.map(b => groups.get(b).sum / groups.get(b).count);

    return { labels, values };
  }

  function redrawSeries(cfg) {
    const data = (cfg.agg === 5) ? getLast24RawForKey(cfg.key)
                                 : getAgg24ForKey(cfg.key, cfg.agg);
    setChartData(cfg, data.labels, data.values);
  }

  // --- Crear charts por serie ---
  Object.values(SERIES).forEach(makeChart);

  // --- Carga inicial (histórico) ---
  const base = db.ref('/historial_mediciones').orderByKey().limitToLast(INITIAL_FETCH_LIMIT);
  base.once('value', snap => {
    const obj = snap.val();
    if (!obj) return;
    const entries = Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)); // viejo->nuevo
    entries.forEach(([k, v]) => {
      if (v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
      const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || new Date().toISOString().slice(0, 10));
      const ts = parseTsFrom(dateISO, v || {});
      if (Number.isFinite(ts)) {
        raw.push({
          key: k, ts,
          co2: v?.co2 ?? 0,
          cTe: v?.cTe ?? 0,
          cHu: v?.cHu ?? 0
        });
      }
    });
    raw.sort((a, b) => a.ts - b.ts);
    Object.values(SERIES).forEach(redrawSeries);
  });

  // --- Tiempo real ---
  const liveRef = db.ref('/historial_mediciones').limitToLast(1);
  liveRef.on('child_added', snap => {
    const k = snap.key, v = snap.val() || {};
    if (v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
    const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || new Date().toISOString().slice(0, 10));
    const ts = parseTsFrom(dateISO, v);
    if (Number.isFinite(ts)) {
      raw.push({ key: k, ts, co2: v?.co2 ?? 0, cTe: v?.cTe ?? 0, cHu: v?.cHu ?? 0 });
      raw.sort((a, b) => a.ts - b.ts);
      Object.values(SERIES).forEach(redrawSeries);
    }
    if (window.staleMsFromFechaHora && window.staleMarkUpdate) {
      const msData = window.staleMsFromFechaHora(dateISO, v.hora || v.tiempo);
      window.staleMarkUpdate(msData);
    }
  });
  liveRef.on('child_changed', snap => {
    const k = snap.key, v = snap.val() || {};
    if (v && v.fecha) lastMarkerDateISO = toIsoDate(v.fecha) || lastMarkerDateISO;
    const dateISO = (v && v.fecha) ? toIsoDate(v.fecha) : (lastMarkerDateISO || new Date().toISOString().slice(0, 10));
    const ts = parseTsFrom(dateISO, v);
    if (Number.isFinite(ts)) {
      const idx = raw.findIndex(r => r.key === k);
      const rec = { key: k, ts, co2: v?.co2 ?? 0, cTe: v?.cTe ?? 0, cHu: v?.cHu ?? 0 };
      if (idx >= 0) raw[idx] = rec; else raw.push(rec);
      raw.sort((a, b) => a.ts - b.ts);
      Object.values(SERIES).forEach(redrawSeries);
    }
    if (window.staleMsFromFechaHora && window.staleMarkUpdate) {
      const msData = window.staleMsFromFechaHora(dateISO, v.hora || v.tiempo);
      window.staleMarkUpdate(msData);
    }
  });

})();
