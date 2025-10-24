// upload-graph.js — Historial desde CSV con selector de intervalos, slider propio, eje X temporal real,
// máx. 24 ticks, tabla sincronizada (estilada solo con style.css) y eje Y dinámico.

// ======= DOM =======
const csvFileInput   = document.getElementById('csvFileInput');
const statusMessage  = document.getElementById('statusMessage');
const dataSelector   = document.getElementById('dataSelector');
const chartDiv       = document.getElementById('myChart');

// Slider (doble) existente en tu HTML (NO Plotly)
const rangeInputs    = document.querySelectorAll('input[type="range"]');
const rangeTrack     = document.getElementById('range_track');
const minBubble      = document.querySelector('.minvalue');
const maxBubble      = document.querySelector('.maxvalue');

// Tabla (usa el contenedor del HTML con id="dataTable" y estilos de style.css)
const dataTableContainer = document.getElementById('dataTable');

// ======= Constantes =======
const SAMPLE_BASE_MIN   = 5;     // frecuencia de muestreo base
const COVERAGE_FRACTION = 0.90;  // umbral de cobertura de bin (90%)
const MIN_SLIDER_GAP    = 6;     // separación mínima entre manijas del slider

// Colores por métrica (respetar)
const COLORS = {
  // Partículas
  'pm1.0':  'red',
  'pm2.5':  '#bfa600',
  'pm4.0':  '#00bfbf',
  'pm10.0': '#bf00ff',
  // Ambientales
  'co2': '#990000',
  'Temperatura': '#006600',
  'HumedadRelativa': '#0000cc',
  // Gases
  'voc': '#ff8000',
  'nox': '#00ff00'
};

// ======= Intervalos (selector) =======
const MENU = [
  { label:'5 min', val: 5    },
  { label:'15 min',       val: 15   },
  { label:'30 min',       val: 30   },
  { label:'1 hr',         val: 60   },
  { label:'2 hr',         val: 120  },
  { label:'6 hr',         val: 360  },
  { label:'12 hr',        val: 720  },
  { label:'24 hr',        val: 1440 }
];

// ======= Etiquetado flexible del eje X =======
// 'start' | 'end' | 'range'
const LABEL_MODE = 'start';

// Estampado de fecha en el cambio de día: 'left-prev' | 'left-next' | 'right' | 'both'
const DATE_STAMP_MODE = 'left-next';

// ======= Helpers de formato =======
function fmt2(n){ return String(n).padStart(2,'0'); }

function fmtDate(ms){
  const d = new Date(ms);
  // DD-MM-YYYY
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}


function fmtTime(ms){
  const d = new Date(ms);
  return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
}

function ddmmyyyy(ms){
  const d = new Date(ms);
  return `${fmt2(d.getDate())}-${fmt2(d.getMonth()+1)}-${d.getFullYear()}`;
}

function sameDay(a,b){
  const da=new Date(a), db=new Date(b);
  return da.getFullYear()===db.getFullYear() && da.getMonth()===db.getMonth() && da.getDate()===db.getDate();
}

function startOfLocalDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); // 00:00 local
}
/**
 * Etiqueta del bin según modo. Para 5 min NUNCA mostramos rango (siempre hora simple).
 */
function makeBinLabel(binStartMs, minutes, mode = LABEL_MODE){
  const date  = fmtDate(binStartMs);
  const tBeg  = fmtTime(binStartMs);
  const tEnd  = fmtTime(binStartMs + minutes*60000);

  if (minutes === SAMPLE_BASE_MIN) return `${date} ${tBeg}`; // 5 min: no rango

  if (mode === 'end')   return `${date} ${tEnd}`;
  if (mode === 'range') return `${date} ${tBeg}–${tEnd}`;
  return `${date} ${tBeg}`; // start
}

// ======= Estado =======
let parsedRows        = [];     // filas CSV
let rawRecords        = [];     // [{ts, values:{...}}] crudo ordenado
let currentAggMinutes = 5;
let currentLabels     = [];     // etiqueta de cada punto/barra
let currentValues     = [];     // valor de cada punto/barra
let currentTimes      = [];     // timestamp (ms) de cada punto/barra
let minIndex=0, maxIndex=0;     // slider indices

// ======= Utilidades =======
function intervalLabel(minutes){
  if (minutes === 5) return '5 min';
  if (minutes === 15) return '15 min';
  if (minutes === 30) return '30 min';
  if (minutes === 60) return '1 hr';
  if (minutes === 120) return '2 hr';
  if (minutes === 360) return '6 hr';
  if (minutes === 720) return '12 hr';
  if (minutes === 1440) return '24 hr';
  return `${minutes} min`;
}

function floorToBin(ts, minutes){ const w = minutes*60000; return ts - (ts % w); }

function parseCsv(text){
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i=1; i<lines.length; i++){
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length !== headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => row[h] = values[idx]);
    rows.push(row);
  }
  return rows;
}

function toIsoDateFromCSV(fechaStr) {
  if (!fechaStr) {
    const d=new Date(); return `${d.getFullYear()}-${fmt2(d.getMonth()+1)}-${fmt2(d.getDate())}`;
  }
  const p = fechaStr.split(/[-/]/);
  if (p.length !== 3) return new Date().toISOString().slice(0,10);
  if (p[0].length === 4) {
    const [yyyy, mm, dd] = p;
    return `${yyyy}-${fmt2(mm)}-${fmt2(dd)}`;
  } else {
    const [dd, mm, yyyy] = p;
    return `${yyyy}-${fmt2(mm)}-${fmt2(dd)}`;
  }
}

function parseTs(dateISO, horaStr){
  const raw = String(horaStr||'00:00');
  const hhmmss = /^\d{1,2}:\d{2}$/.test(raw) ? `${raw}:00` : raw;
  const ms = Date.parse(`${dateISO}T${hhmmss}`);
  return Number.isFinite(ms) ? ms : null;
}

function getColorForKey(key) {
  return COLORS[key] || '#000066';
}

// Eje Y dinámico: [0, 2×máximo]
function updateYAxisRange(divId, yValues){
  const finite = (yValues||[]).filter(v => Number.isFinite(v) && v >= 0);
  const maxVal = finite.length ? Math.max(...finite) : 0;
  const upper  = (maxVal > 0) ? (maxVal * 2) : 1;
  Plotly.relayout(divId, { 'yaxis.autorange': false, 'yaxis.range': [0, upper] });
}

// ======= Construcción de ticks desde tiempos reales (máx. 24) =======
function buildTicksFromTimes(xTs, maxTicks=24){
  const n = xTs.length;
  if (!n) return { tickvals: [], ticktext: [] };

  if (n <= maxTicks){
    const tickvals = xTs.slice();
    const ticktext = xTs.map((t,i,arr)=>{
      const base = fmtTime(t);
      if (i>0 && !sameDay(arr[i-1], t)) return `${base}<br>${ddmmyyyy(t)}`;
      return base;
    });
    return { tickvals, ticktext };
  }
  const step = Math.ceil(n / maxTicks);
  const idxs = [];
  for (let i=0; i<n; i+=step) idxs.push(i);
  if (idxs[idxs.length-1] !== n-1) idxs.push(n-1);

  const tickvals = idxs.map(i=>xTs[i]);
  const ticktext = idxs.map((i,k)=>{
    const base = fmtTime(xTs[i]);
    if (k>0 && !sameDay(xTs[idxs[k-1]], xTs[i])) return `${base}<br>${ddmmyyyy(xTs[i])}`;
    return base;
  });
  return { tickvals, ticktext };
}

// ======= Agregador =======
function aggregateForKey(key, minutes){
  if (minutes === SAMPLE_BASE_MIN) {
    // 5 min crudo
    const labels = rawRecords.map(r => makeBinLabel(r.ts, SAMPLE_BASE_MIN, LABEL_MODE));
    const values = rawRecords.map(r => Number(r.values[key]));
    const xTs    = rawRecords.map(r => r.ts);
    return { labels, values, xTs };
  }

  const byBin = new Map(); // binStart -> {sum,count}
  for (const r of rawRecords){
    const v = Number(r.values[key]);
    if (!Number.isFinite(v)) continue;

    // 24 hr: anclar a medianoche LOCAL; otros intervalos: bin estándar
    const bin = (minutes === 1440)
      ? startOfLocalDay(r.ts)
      : floorToBin(r.ts, minutes);

    const g = byBin.get(bin) || { sum:0, count:0 };
    g.sum += v; g.count += 1;
    byBin.set(bin, g);
  }

  const expected = minutes / SAMPLE_BASE_MIN;
  const required = Math.max(1, Math.ceil(expected * COVERAGE_FRACTION));

  const bins = Array.from(byBin.keys()).sort((a,b)=>a-b)
    .filter(b => byBin.get(b).count >= required);

  const labels = bins.map(b => makeBinLabel(b, minutes, LABEL_MODE));
  const values = bins.map(b => byBin.get(b).sum / byBin.get(b).count);

  // xTs: para 24h usar 00:00 local; para otros, inicio/fin según LABEL_MODE
  let xTs;
  if (minutes === 1440) {
    xTs = bins.map(b => b);           // ← 00:00 local
    // Si prefieres 00:01: xTs = bins.map(b => b + 60000);
  } else {
    xTs = bins.map(b => (LABEL_MODE === 'end') ? (b + minutes*60000) : b);
  }

  return { labels, values, xTs };
}

// ======= Plot (BARRAS, eje X temporal real, sin slider Plotly, sin grillas, máx. 24 ticks) =======
function plot(labels, values, xTs, key, titleText) {
  const { tickvals, ticktext } = buildTicksFromTimes(xTs, 24);

  const trace = {
    x: xTs,               // tiempos reales (Date axis)
    y: values,
    type: 'bar',          // ← ahora BARRAS
    name: titleText,
    marker: { color: getColorForKey(key) }
  };

  const layout = {
    xaxis: {
      type: 'date',
      tickmode:'array',
      tickvals,
      ticktext,
      tickangle:-45,
      automargin:true,
      rangeslider: { visible: false }, // sin slider de Plotly
      showgrid: false, zeroline: false, showline: true,
      title: { text:'<b>Fecha y Hora de Medición</b>', font:{ size:16,color:'black',family:'Arial',weight:'bold' }, standoff: 36 },
      tickfont: { color:'black', size:14, family:'Arial', weight:'bold' }
    },
    yaxis: {
      title: { text: `<b>${titleText}</b>`, font:{ size:16,color:'black',family:'Arial',weight:'bold' } },
      tickfont: { color:'black', size:14, family:'Arial', weight:'bold' },
      rangemode:'tozero', autorange:true, fixedrange:false,
      showgrid:false, zeroline:false, showline:true
    },
    margin:{ t:20, l:60, r:40, b:130 },
    bargap:0.2,           // separación entre barras
    paper_bgcolor:'#cce5dc',
    plot_bgcolor:'#cce5dc',
    showlegend:false
  };

  Plotly.newPlot(chartDiv, [trace], layout, {responsive:true, useResizeHandler:true});
  updateYAxisRange(chartDiv.id, values);
}

// ======= Slider helpers =======
function setSliderBounds(n){
  rangeInputs[0].max = rangeInputs[1].max = Math.max(0, n-1);
  rangeInputs[0].value = 0;
  rangeInputs[1].value = Math.max(0, n-1);
  minIndex = 0; maxIndex = Math.max(0, n-1);
  updateSliderUI();
}
function minRangeFill(){ rangeTrack.style.left  = (rangeInputs[0].value / (rangeInputs[0].max||1)) * 100 + "%"; }
function maxRangeFill(){ rangeTrack.style.right = 100 - (rangeInputs[1].value / (rangeInputs[1].max||1)) * 100 + "%"; }
function MinVlaueBubbleStyle(){ const p=(rangeInputs[0].value/(rangeInputs[0].max||1))*100; minBubble.style.left = `${p}%`; }
function MaxVlaueBubbleStyle(){ const p=(rangeInputs[1].value/(rangeInputs[1].max||1))*100; maxBubble.style.left = `${p}%`; }
function setMinValueOutput(){ minIndex = parseInt(rangeInputs[0].value||'0'); minBubble.innerHTML = currentLabels[minIndex] || ''; }
function setMaxValueOutput(){ maxIndex = parseInt(rangeInputs[1].value||'0'); maxBubble.innerHTML = currentLabels[maxIndex] || ''; }
function updateSliderUI(){
  setMinValueOutput(); setMaxValueOutput();
  minRangeFill(); maxRangeFill();
  MinVlaueBubbleStyle(); MaxVlaueBubbleStyle();
}

// ======= Tabla (usa estilos de style.css) =======
function prettyValue(key, v){
  if (!Number.isFinite(v)) return '-';
  if (key === 'HumedadRelativa') return String(Math.round(v)); // entero
  return (Math.round(v*100)/100).toFixed(2);                    // 2 decimales
}
function updateDataTable(labels, values, key, minutes){
  const table = document.createElement('table');
  table.id = 'uploadTable';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const intervalText = intervalLabel(minutes);
  ['#', `Fecha y Hora (${intervalText})`, key.toUpperCase()].forEach(text => {
    const th = document.createElement('th'); th.textContent = text; headerRow.appendChild(th);
  });
  thead.appendChild(headerRow); table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let i=minIndex, j=0; i<=maxIndex; i++, j++){
    const tr = document.createElement('tr');
    const tdIdx   = document.createElement('td'); tdIdx.textContent = j; tr.appendChild(tdIdx);
    const tdLab   = document.createElement('td'); tdLab.textContent = labels[i] || '-'; tr.appendChild(tdLab);
    const tdValue = document.createElement('td'); tdValue.textContent = prettyValue(key, values[i]); tr.appendChild(tdValue);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  // Limpia y monta (los estilos vienen de style.css -> #dataTable, th/td, etc.)
  dataTableContainer.innerHTML = '';
  dataTableContainer.appendChild(table);
}

// ======= Toolbar de intervalos (solo estilos del selector; no tocamos tabla) =======
(function injectToolbarCSS(){
  if (!document.getElementById('agg-toolbar-css')) {
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
  }
})();


function ensureToolbar(){
  if (document.getElementById('agg-toolbar-upload')) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'agg-toolbar-wrap';
  wrapper.id = 'agg-toolbar-upload';
  wrapper.innerHTML = `
    <div class="agg-chart-title">Historial</div>
    <div class="agg-toolbar-label">Seleccione el intervalo de lecturas</div>
    <div class="agg-toolbar" id="agg-toolbar-buttons"></div>
  `;
  // Insertar antes del contenedor de la gráfica
  chartDiv.parentElement.parentElement.insertBefore(wrapper, chartDiv.parentElement);

  const bar = document.getElementById('agg-toolbar-buttons');
  MENU.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'agg-btn';
    btn.textContent = opt.label;
    btn.dataset.minutes = String(opt.val);
    if (opt.val === currentAggMinutes) btn.classList.add('active');
    btn.addEventListener('click', ()=>{
      currentAggMinutes = opt.val;
      bar.querySelectorAll('.agg-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      rebuildForCurrentSelection(); // recalcula bins, ajusta slider, redibuja
    });
    bar.appendChild(btn);
  });
}

// ======= Rebuild cuando cambian: archivo, métrica o intervalo =======
function rebuildForCurrentSelection(){
  if (!rawRecords.length) { chartDiv.innerHTML = ''; dataTableContainer.innerHTML=''; return; }
  const key   = dataSelector.value;
  const title = dataSelector.options[dataSelector.selectedIndex].text;

  const { labels, values, xTs } = aggregateForKey(key, currentAggMinutes);
  currentLabels = labels;
  currentValues = values;
  currentTimes  = xTs;

  setSliderBounds(currentLabels.length);
  // Pinta y tabla para el rango inicial completo
  plot(currentLabels, currentValues, currentTimes, key, title);
  updateDataTable(currentLabels, currentValues, key, currentAggMinutes);
}

// ======= Lectura de CSV =======
csvFileInput.addEventListener('change', () => {
  const file = csvFileInput.files[0];
  if (!file) { statusMessage.textContent = 'Por favor, selecciona un archivo CSV primero.'; return; }

  statusMessage.textContent = 'Leyendo y procesando archivo...';
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      parsedRows = parseCsv(e.target.result);
      if (!parsedRows.length) {
        statusMessage.textContent = 'El archivo CSV está vacío o no contiene datos válidos.'; 
        chartDiv.innerHTML=''; dataTableContainer.innerHTML=''; rawRecords=[]; return;
      }

      // Construir registros crudos con timestamp
      rawRecords = [];
      let lastDateISO = null;
      for (const row of parsedRows){
        const f = row.fechaDeMedicion || row.fecha || '';
        if (f && f.trim() !== '') lastDateISO = toIsoDateFromCSV(f);
        if (!lastDateISO) lastDateISO = toIsoDateFromCSV(f);

        const h = row.HoraMedicion || row.hora || '00:00';
        const ts = parseTs(lastDateISO, h);
        if (!Number.isFinite(ts)) continue;

        // Mapea valores numéricos presentes en el CSV
        const values = {};
        Object.keys(COLORS).forEach(k => {
          if (k in row) values[k] = Number(row[k]);
        });
        rawRecords.push({ ts, values });
      }
      // Orden cronológico ascendente
      rawRecords.sort((a,b)=>a.ts-b.ts);

      statusMessage.textContent = `Archivo "${file.name}" cargado. Registros: ${rawRecords.length}.`;
      ensureToolbar();
      rebuildForCurrentSelection();
    } catch (err) {
      console.error(err);
      statusMessage.textContent = `Error al procesar el CSV: ${err.message}`;
      chartDiv.innerHTML=''; dataTableContainer.innerHTML=''; rawRecords=[];
    }
  };
  reader.onerror = () => {
    statusMessage.textContent = 'Error al leer el archivo.';
    console.error('Error reading file:', reader.error);
  };
  reader.readAsText(file);
});

// ======= Eventos =======
dataSelector.addEventListener('change', () => {
  if (!rawRecords.length) { statusMessage.textContent = "Carga un archivo CSV para graficar."; return; }
  rebuildForCurrentSelection();
});

rangeInputs.forEach((input) => {
  input.addEventListener('input', (e) => {
    setMinValueOutput(); setMaxValueOutput();
    minRangeFill(); maxRangeFill();
    MinVlaueBubbleStyle(); MaxVlaueBubbleStyle();

    const gap = Math.min(MIN_SLIDER_GAP, Math.max(0, (rangeInputs[0].max|0)));
    const minIdx = parseInt(rangeInputs[0].value);
    const maxIdx = parseInt(rangeInputs[1].value);

    if (maxIdx - minIdx < gap) {
      if (e.target.className === "min") {
        rangeInputs[0].value = Math.max(0, maxIdx - gap);
        setMinValueOutput(); minRangeFill(); MinVlaueBubbleStyle();
        e.target.style.zIndex = "2";
      } else {
        rangeInputs[1].value = Math.min(rangeInputs[1].max, minIdx + gap);
        setMaxValueOutput(); maxRangeFill(); MaxVlaueBubbleStyle();
        e.target.style.zIndex = "2";
      }
    }

    // Redibuja SOLO el rango visible
    const key   = dataSelector.value;
    const title = dataSelector.options[dataSelector.selectedIndex].text;
    const start = parseInt(rangeInputs[0].value);
    const end   = parseInt(rangeInputs[1].value);

    const labels = currentLabels.slice(start, end+1);
    const values = currentValues.slice(start, end+1);
    const xTs    = currentTimes.slice(start, end+1);

    plot(labels, values, xTs, key, title);
    updateDataTable(currentLabels, currentValues, key, currentAggMinutes);
  });
});
