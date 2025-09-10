// grafpart.js
window.addEventListener("load", () => {
  const MAX_POINTS = 24; // mostrar últimos 24

  const loadingClass = 'loading-msg';
  ["chartPM1","chartPM2_5","chartPM4_0","chartPM10"].forEach(addLoading);

  let firstData = false;
  function removeLoading(){
    if(firstData) return; firstData = true;
    document.querySelectorAll('.loading-msg').forEach(n=>{
      const p=n.parentNode; if(n.parentNode) n.parentNode.removeChild(n); if(p) p.style.paddingTop='';
    });
  }
  function addLoading(divId){
    const el = document.getElementById(divId);
    if(!el) return;
    el.style.position = 'relative';
    if(!el.querySelector('.'+loadingClass)){
      el.insertAdjacentHTML('afterbegin', '<div class="'+loadingClass+'" style="position:absolute;top:4px;left:0;width:100%;text-align:center;font-size:28px;font-weight:bold;color:#000;letter-spacing:.5px;pointer-events:none;">Cargando datos...</div>');
      el.style.paddingTop = '36px';
    }
  }

  function initBar(divId, label, color, yMin, yMax) {
    Plotly.newPlot(divId, [{
      x: [],
      y: [],
      type: 'bar',
      name: label,
      marker: { color }
    }], {
      title: { text: label, font: { size: 20, color: 'black', family: 'Arial', weight: 'bold' } },
      xaxis: {
        title: { text: 'Fecha y Hora de Medición', font: { size: 16, color: 'black', family: 'Arial', weight: 'bold' }, standoff: 20 },
        type: 'date',
        tickfont: { color: 'black', size: 14, family: 'Arial', weight: 'bold' },
        gridcolor: 'black',
        linecolor: 'black',
        autorange: true,
        tickangle: -45,
        nticks: 30
      },
      yaxis: {
        title: { text: label, font: { size: 16, color: 'black', family: 'Arial', weight: 'bold' } },
        tickfont: { color: 'black', size: 14, family: 'Arial', weight: 'bold' },
        gridcolor: 'black',
        linecolor: 'black',
        autorange: true,
        fixedrange: false,
        range: (yMin !== null && yMax !== null) ? [yMin, yMax] : undefined
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
  function makeTimestampWithDate(isoDate, v){ const h=v.hora||v.tiempo||'00:00:00'; return `${isoDate} ${h}`; }
  function makeTimestamp(v){
    const isoDate = toIsoDate(v.fecha);
    const h = v.hora || v.tiempo || '00:00:00';
    return `${isoDate} ${h}`;
  }

  function BarSeries(divId) {
    this.divId = divId;
    this.x = [];
    this.y = [];
    this.keys = []; // claves firebase para child_changed
  }
  BarSeries.prototype.addPoint = function(key, label, value) {
    if (this.keys.includes(key)) return; // ya existe
    this.keys.push(key);
    this.x.push(label);
    this.y.push(value);
    if (this.x.length > MAX_POINTS) {
      this.x.shift();
      this.y.shift();
      this.keys.shift();
    }
    Plotly.update(this.divId, { x: [this.x], y: [this.y] });
  };
  BarSeries.prototype.updatePoint = function(key, newValue) {
    const idx = this.keys.indexOf(key);
    if (idx === -1) return;
    this.y[idx] = newValue;
    Plotly.restyle(this.divId, { y: [this.y] });
  };

  // Inicializar gráficas
  initBar("chartPM1", "PM1.0 µg/m³", "red", 0, 100);
  initBar("chartPM2_5", "PM2.5 µg/m³", "#bfa600", 0, 300); // amarillo oscuro
  initBar("chartPM4_0", "PM4.0 µg/m³", "#00bfbf", 0, 500); // turquesa
  initBar("chartPM10", "PM10.0 µg/m³", "#bf00ff", 0, 400);

  const sPM1 = new BarSeries('chartPM1');
  const sPM25 = new BarSeries('chartPM2_5');
  const sPM40 = new BarSeries('chartPM4_0');
  const sPM10 = new BarSeries('chartPM10');

  const db = firebase.database();
  const baseQuery = db.ref('/historial_mediciones').orderByKey().limitToLast(MAX_POINTS);

  let lastMarkerDateISO = null;
  baseQuery.once('value', snap => {
    const dataObj = snap.val();
    if (!dataObj) return;
    const entries = Object.entries(dataObj).sort(([a],[b])=> (a<b?-1:a>b?1:0));
    const inferredDates = inferDatesForEntries(entries);
    entries.forEach(([key, val], idx) => {
      const dateISO = inferredDates[idx];
      if(val && val.fecha) lastMarkerDateISO = toIsoDate(val.fecha);
      const label = makeTimestampWithDate(dateISO, val);
      sPM1.addPoint(key, label, val.pm1p0 ?? 0);
      sPM25.addPoint(key, label, val.pm2p5 ?? 0);
      sPM40.addPoint(key, label, val.pm4p0 ?? 0);
      sPM10.addPoint(key, label, val.pm10p0 ?? 0);
    });
    removeLoading();
  });

  db.ref('/historial_mediciones').limitToLast(1).on('child_added', snap => {
    const key = snap.key;
    const val = snap.val();
    if(val && val.fecha){ lastMarkerDateISO = toIsoDate(val.fecha); }
    const dateISO = (val && val.fecha) ? toIsoDate(val.fecha) : (lastMarkerDateISO || toIsoDate());
    const label = makeTimestampWithDate(dateISO, val||{});
    sPM1.addPoint(key, label, val?.pm1p0 ?? 0);
    sPM25.addPoint(key, label, val?.pm2p5 ?? 0);
    sPM40.addPoint(key, label, val?.pm4p0 ?? 0);
    sPM10.addPoint(key, label, val?.pm10p0 ?? 0);
  });

  db.ref('/historial_mediciones').limitToLast(1).on('child_changed', snap => {
    const key = snap.key;
    const val = snap.val();
    sPM1.updatePoint(key, val.pm1p0 ?? 0);
    sPM25.updatePoint(key, val.pm2p5 ?? 0);
    sPM40.updatePoint(key, val.pm4p0 ?? 0);
    sPM10.updatePoint(key, val.pm10p0 ?? 0);
  });
});
window.addEventListener("load", () => {
  const MAX_DATA_POINTS = 20;

  function initPlot(divId, label, color, yMin, yMax) {
    Plotly.newPlot(divId, [{
      x: [],
      y: [],
      mode: 'lines',
      name: label,
      line: { color: color }
    }], {
      title: {
        text: label,
        font: { size: 20, color: 'black', family: 'Arial', weight: 'bold' }
      },
      xaxis: {
        title: {
          text: 'Tiempo Transcurrido',
          font: { size: 16, color: 'black', family: 'Arial', weight: 'bold' },
          standoff: 20  // separa el título de los ticks
        },
        tickfont: {
          color: 'black',
          size: 14,
          family: 'Arial',
          weight: 'bold'
        },
        tickangle: -45,  // puedes ajustar a -30 o -60 si prefieres
        gridcolor: 'black',
        linecolor: 'black',
        zeroline: false
      },
      yaxis: {
        title: {
          text: label,
          font: { size: 16, color: 'black', family: 'Arial', weight: 'bold' }
        },
        tickfont: { color: 'black', size: 14, family: 'Arial', weight: 'bold' },
        gridcolor: 'black',
        linecolor: 'black',
        zeroline: false,
        range: (yMin !== null && yMax !== null) ? [yMin, yMax] : undefined
      },
      plot_bgcolor: "#cce5dc",
      paper_bgcolor: "#cce5dc",
      margin: { t: 50, l: 60, r: 40, b: 80 },  // margen inferior aumentado
    });
  }

  function updatePlot(divId, timeLabel, value) {
    Plotly.extendTraces(divId, {
      x: [[timeLabel]],
      y: [[value]]
    }, [0]);

    const graphDiv = document.getElementById(divId);
    const xLen = graphDiv.data[0].x.length;
    if (xLen > MAX_DATA_POINTS) {
      Plotly.relayout(divId, {
        'xaxis.range': [xLen - MAX_DATA_POINTS, xLen]
      });
    }
  }

  initPlot("chartPM1", "PM1.0 µg/m³", "red", 0, 100);
  initPlot("chartPM2_5", "PM2.5 µg/m", "blue", 0, 300);
  initPlot("chartPM4_0", "PM4.0 µg/m³", "green", 0, 500);
  initPlot("chartPM10", "PM10.0 µg/m³", "#bf00ff", 0, 400);

  const database = firebase.database();
  const ref = database.ref("/ultima_medicion");

  ref.on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const timestamp = data.tiempo ?? new Date().toLocaleTimeString();

    updatePlot("chartPM1", timestamp, data.pm1p0 ?? 0);
    updatePlot("chartPM2_5", timestamp, data.pm2p5 ?? 0);
    updatePlot("chartPM4_0", timestamp, data.pm4p0 ?? 0);
    updatePlot("chartPM10", timestamp, data.pm10p0 ?? 0);

  });
});
