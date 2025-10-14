// grafamb.js — CO2, Temperatura, Humedad con rangeselector Plotly y agregación por serie
(function () {
  'use strict';

  const MAX_BARS = 24;
  const INITIAL_FETCH_LIMIT = 5000;
  const db = firebase.database();

  // Colores originales por serie
  const COLORS = { CO2: '#990000', TEM: '#006600', HUM: '#0000cc' };

  // ---- Helpers fecha/hora -> timestamp ----
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
  function buildBins(endTs, minutes, count = MAX_BARS) {
    const lastEnd = floorToBin(endTs, minutes) + minutes * 60000; // [start,end)
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const end = lastEnd - (count - 1 - i) * minutes * 60000;
      const start = end - minutes * 60000;
      out.push({ start, end });
    }
    return out;
  }
  function avg(list) {
    const v = list.filter(n => Number.isFinite(n));
    if (!v.length) return null;
    return v.reduce((a, b) => a + b, 0) / v.length;
  }

  // ---- UI de Plotly: rangeselector (sin slider) ----
  const RANGE_BUTTONS = [
    { count: 5, step: 'minute', stepmode: 'backward', label: '5m' },
    { count: 15, step: 'minute', stepmode: 'backward', label: '15m' },
    { count: 30, step: 'minute', stepmode: 'backward', label: '30m' },
    { count: 1, step: 'hour', stepmode: 'backward', label: '1h' },
    { count: 6, step: 'hour', stepmode: 'backward', label: '6h' }
  ];
  const CHOICES_MIN = [5, 15, 30, 60, 360];

  function inferAggFromRelayout(relayoutData) {
    const a = relayoutData['xaxis.range[0]'];
    const b = relayoutData['xaxis.range[1]'];
    if (!a || !b) return null;
    const minutes = Math.round((new Date(b) - new Date(a)) / 60000);
    // mapea al más cercano de nuestros choices (tolerancia 25%)
    let pick = null, best = Infinity;
    for (const c of CHOICES_MIN) {
      const d = Math.abs(minutes - c);
      if (d < best) { best = d; pick = c; }
    }
    if (pick && Math.abs(minutes - pick) <= Math.ceil(pick * 0.25)) return pick;
    return null;
  }

  // ---- Estado global crudo ----
  // Guardamos TODO crudo para poder agregar en cualquier tamaño.
  // Estructura: { key, ts, co2, cTe, cHu }
  let raw = [];
  let lastMarkerDateISO = null;

  // ---- Serie / Chart config ----
  const SERIES = {
    CO2: { divId: 'CO2', title: 'CO2 (ppm)', color: COLORS.CO2, key: 'co2', yTitle: 'ppm', agg: 5 },
    TEM: { divId: 'TEM', title: 'Temperatura (°C)', color: COLORS.TEM, key: 'cTe', yTitle: '°C', agg: 5 },
    HUM: { divId: 'HUM', title: 'Humedad relativa (%)', color: COLORS.HUM, key: 'cHu', yTitle: '%', agg: 5, round: true }
  };

  function makeChart(cfg) {
    const divId = cfg.divId;
    const x = Array(MAX_BARS).fill(new Date()); // fechas dummy
    const y = Array(MAX_BARS).fill(null);

    Plotly.newPlot(divId, [{
      x, y,
      type: 'bar',
      name: cfg.title,
      marker: { color: cfg.color }
    }], {
      title: cfg.title,
      xaxis: {
        type: 'date',
        rangeselector: { buttons: RANGE_BUTTONS },
        rangeslider: { visible: false },
        tickangle: -45,
        automargin: true
      },
      yaxis: {
        title: cfg.yTitle,
        rangemode: 'tozero',
        autorange: true,
        fixedrange: false
      },
      margin: { t: 50, l: 60, r: 20, b: 110 },
      bargap: 0.2,
      paper_bgcolor: '#cce5dc',
      plot_bgcolor: '#cce5dc',
      showlegend: false
    }, { responsive: true });

    // Escuchar clicks del rangeselector de ESTA gráfica
    const el = document.getElementById(divId);
    el.on('plotly_relayout', (e) => {
      const pick = inferAggFromRelayout(e || {});
      if (pick) {
        cfg.agg = pick;
        redrawSeries(cfg);
        // restaurar vista (autorange) para mostrar SIEMPRE las 24 barras recalculadas
        Plotly.relayout(divId, { 'xaxis.autorange': true, 'xaxis.rangeslider.visible': false });
      }
    });
  }

  function setChartData(cfg, xDates, yVals) {
    // Completar a 24
    let x = xDates.slice(-MAX_BARS);
    let y = yVals.slice(-MAX_BARS);
    while (x.length < MAX_BARS) x.unshift(new Date(x.length ? x[0] : Date.now()));
    while (y.length < MAX_BARS) y.unshift(null);

    if (cfg.round) y = y.map(v => Number.isFinite(v) ? Math.round(v) : v);

    Plotly.react(cfg.divId, [{
      x, y, type: 'bar', name: cfg.title, marker: { color: cfg.color }
    }], {
      title: cfg.title,
      xaxis: { type: 'date', rangeselector: { buttons: RANGE_BUTTONS }, rangeslider: { visible: false }, tickangle: -45, automargin: true },
      yaxis: { title: cfg.yTitle, rangemode: 'tozero', autorange: true, fixedrange: false },
      margin: { t: 50, l: 60, r: 20, b: 110 },
      bargap: 0.2,
      paper_bgcolor: '#cce5dc',
      plot_bgcolor: '#cce5dc',
      showlegend: false
    }, { responsive: true });
  }

  // ---- Datos para 5 min (24 últimas crudas) ----
  function getLast24RawForKey(key) {
    const last = raw.slice(-MAX_BARS);
    const xs = last.map(r => new Date(r.ts));
    const ys = last.map(r => Number(r[key]));
    return { xs, ys };
  }

  // ---- Datos agregados (24 bins del tamaño minutes) ----
  function getAgg24ForKey(key, minutes) {
    if (!raw.length) return { xs: Array(MAX_BARS).fill(new Date()), ys: Array(MAX_BARS).fill(null) };
    const lastTs = raw[raw.length - 1].ts;
    const bins = buildBins(lastTs, minutes, MAX_BARS);
    const xs = bins.map(b => new Date(b.start)); // usamos el inicio del bin
    const ys = bins.map(b => {
      const nums = raw.filter(r => r.ts >= b.start && r.ts < b.end).map(r => Number(r[key]));
      return avg(nums);
    });
    return { xs, ys };
  }

  function redrawSeries(cfg) {
    const data = (cfg.agg === 5)
      ? getLast24RawForKey(cfg.key)
      : getAgg24ForKey(cfg.key, cfg.agg);
    setChartData(cfg, data.xs, data.ys);
  }

  // ---- Crear gráficos + selectors por serie ----
  Object.values(SERIES).forEach(makeChart);

  // ---- Carga inicial amplia para poder agregar ----
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

  // ---- Tiempo real ----
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
