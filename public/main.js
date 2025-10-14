// main.js

const firebaseConfig = {
  apiKey: "AIzaSyAowEsndAOgwtEIfBABbq_GKNTX3bHh_VM",
  authDomain: "calidadaire-677f9.firebaseapp.com",
  databaseURL: "https://calidadaire-677f9-default-rtdb.firebaseio.com",
  projectId: "calidadaire-677f9",
  storageBucket: "calidadaire-677f9.firebasestorage.app",
  messagingSenderId: "970353407925",
  appId: "1:970353407925:web:6486958748783e422b8bfc"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Inicializa la librería de alerta (usa el umbral definido dentro de stale-alert.js)
if (typeof window.staleInit === "function") {
  window.staleInit();
} else {
  console.warn("[stale] stale-alert.js no está cargado; no habrá alerta por inactividad.");
}

// --- Estado global (para UI)
let fechaInicioGlobal = null;
let horaInicioGlobal  = null;
let ubicacionGlobal   = null;
let ESPIDGlobal       = null;

let ultimaFechaGlobal = null;
let ultimaHoraGlobal  = null;

// ---- UI básica
function prepararTablaVacia() {
  const tbl = document.getElementById('data-table');
  if (tbl && !tbl.dataset.prepared) {
    tbl.dataset.prepared = '1';
    tbl.innerHTML = `<tr><th>Mediciones</th><th>Valor</th><th>Unidad</th></tr>`;
  }
  if (!document.getElementById('waiting-msg')) {
    const msg = document.createElement('div');
    msg.id = 'waiting-msg';
    msg.style.cssText = [
      'margin:20px 0','width:100%','display:block','text-align:center',
      'font-size:32px','font-weight:700','color:#000'
    ].join(';');
    msg.textContent = 'Esperando Datos...';
    const tableEl = document.getElementById('data-table');
    if (tableEl && tableEl.parentNode) tableEl.parentNode.insertBefore(msg, tableEl);
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', prepararTablaVacia);
} else { prepararTablaVacia(); }

// ---- Helpers
function isValidStr(v){ return v!==undefined && v!==null && String(v).trim()!=='' && String(v).toLowerCase()!=='nan'; }

function updateTimeInfoUI() {
  const timeInfo = document.getElementById("time-info");
  if (!timeInfo) return;
  const hayAlgo = (v)=>v!==null && v!==undefined && String(v).trim()!=="";
  if (!hayAlgo(ultimaFechaGlobal) && !hayAlgo(ultimaHoraGlobal)) { timeInfo.innerHTML=""; return; }
  timeInfo.innerHTML =
    '<strong>Fecha Última Medición:</strong> ' + (ultimaFechaGlobal ?? '') + '<br>' +
    '<strong>Hora Última Medición:</strong> ' + (ultimaHoraGlobal ?? '');
}

function hasAnyStatic(){ return [ESPIDGlobal,horaInicioGlobal,ubicacionGlobal,fechaInicioGlobal].some(isValidStr); }

function clearStaticInfoUI(){
  const staticP=document.getElementById('T-I-Static'); const idEl=document.getElementById('ID');
  if (staticP) staticP.innerHTML=''; if (idEl) idEl.innerHTML='';
}

function updateStaticInfoUI(){
  if (!hasAnyStatic()){ clearStaticInfoUI(); return; }
  const staticP=document.getElementById('T-I-Static'); const idEl=document.getElementById('ID');
  if (staticP){
    staticP.innerHTML =
      '<strong>Fecha de inicio:</strong> ' + (fechaInicioGlobal ?? '') + ' <br>' +
      '<strong>Hora de inicio:</strong> ' + (horaInicioGlobal ?? '') + '<br>' +
      '<strong>Ubicación:</strong> ' + (ubicacionGlobal ?? '');
  }
  if (idEl){ idEl.innerHTML = `<strong>ID:</strong> ${ESPIDGlobal ?? ''}<br>`; }
}

// Semilla para fecha última (UI)
function seedUltimaFechaDesdeCola(){
  database.ref('/historial_mediciones').limitToLast(2000).once('value', (snap)=>{
    let ultima=null;
    snap.forEach(ch=>{ const e=ch.val()||{}; if (isValidStr(e.fecha)) ultima=e.fecha; });
    if (ultima){ ultimaFechaGlobal=ultima; updateTimeInfoUI(); }
  });
}
seedUltimaFechaDesdeCola();

// Datos estáticos y completitud
function listenStaticFields(){
  database.ref('/historial_mediciones').orderByKey().limitToFirst(1).once('value',(snap)=>{
    const firstObj=snap.val();
    if (firstObj){
      const entry=Object.values(firstObj)[0]||{};
      if (ESPIDGlobal==null && isValidStr(entry.id)) ESPIDGlobal=entry.id;
      if (horaInicioGlobal==null && isValidStr(entry.inicio)) horaInicioGlobal=entry.inicio;
      if (ubicacionGlobal==null && isValidStr(entry.ciudad)) ubicacionGlobal=entry.ciudad;
      if (fechaInicioGlobal==null && isValidStr(entry.fecha)) fechaInicioGlobal=entry.fecha;
      updateStaticInfoUI();
    } else { clearStaticInfoUI(); }
  });

  const newestRef = database.ref('/historial_mediciones').limitToLast(1);
  const onAdded = (snap)=>{
    const entry=snap.val()||{};
    if (ESPIDGlobal==null && isValidStr(entry.id)) ESPIDGlobal=entry.id;
    if (horaInicioGlobal==null && isValidStr(entry.inicio)) horaInicioGlobal=entry.inicio;
    if (ubicacionGlobal==null && isValidStr(entry.ciudad)) ubicacionGlobal=entry.ciudad;
    if (isValidStr(entry.fecha)){ if (fechaInicioGlobal!==entry.fecha) fechaInicioGlobal=entry.fecha; ultimaFechaGlobal=entry.fecha; }
    updateStaticInfoUI();
  };
  newestRef.on('child_added', onAdded);
  newestRef.on('child_changed', onAdded);
}
listenStaticFields();

// Render tabla
function renderUltimaMedicion(data){
  if (!data) return;
  const wait=document.getElementById('waiting-msg'); if (wait) wait.remove();
  const dataTable=document.getElementById("data-table");
  if (!dataTable.querySelector('th')) dataTable.innerHTML='<tr><th>Mediciones</th><th>Valor</th><th>Unidad</th></tr>';
  const rows = [
    `<tr><td>PM1.0</td><td>${data.pm1p0 ?? '0'}</td><td>µg/m³</td></tr>`,
    `<tr><td>PM2.5</td><td>${data.pm2p5 ?? '0'}</td><td>µg/m³</td></tr>`,
    `<tr><td>PM4.0</td><td>${data.pm4p0 ?? '0'}</td><td>µg/m³</td></tr>`,
    `<tr><td>PM10.0</td><td>${data.pm10p0 ?? '0'}</td><td>µg/m³</td></tr>`,
    `<tr><td>VOC</td><td>${Math.round(data.voc ?? 0)}</td><td>Index</td></tr>`,
    `<tr><td>NOx</td><td>${Math.round(data.nox ?? 0)}</td><td>Index</td></tr>`,
    `<tr><td>CO2</td><td>${data.co2 ?? '0'}</td><td>ppm</td></tr>`,
    `<tr><td>Temperatura</td><td>${data.cTe ?? '0'}</td><td>°C</td></tr>`,
    `<tr><td>Humedad Relativa</td><td>${Math.round(data.cHu ?? 0)}</td><td>%</td></tr>`
  ];
  const header = dataTable.querySelector('tr');
  dataTable.innerHTML = header.outerHTML + rows.join('');
  if (isValidStr(data.hora)){ ultimaHoraGlobal=data.hora; updateTimeInfoUI(); }
}

// ------- PRIMING: lee el último dato una vez y agenda la alerta al instante
function primeStaleFromLastOnce(){
  const ref = database.ref('/historial_mediciones').limitToLast(1);
  ref.once('value', (snap)=>{
    let last = null;
    snap.forEach(ch=>{ last = ch.val(); });
    if (last){
      if (isValidStr(last.hora)) { ultimaHoraGlobal = last.hora; }
      if (isValidStr(last.fecha)) { ultimaFechaGlobal = last.fecha; }
      updateTimeInfoUI();
      renderUltimaMedicion(last);
      if (typeof window.staleMsFromFechaHora === "function" && typeof window.staleMarkUpdate === "function") {
        const fechaEfectiva =
          (last && last.fecha) ??
          ultimaFechaGlobal ??
          fechaInicioGlobal ??
          new Date().toISOString().slice(0,10); // YYYY-MM-DD (fallback extremo)

        const msData = window.staleMsFromFechaHora(fechaEfectiva, last && last.hora);
        console.log("[stale] prime once ->", fechaEfectiva, last && last.hora, msData);
        window.staleMarkUpdate(msData);
      }
    }
  });
}
primeStaleFromLastOnce();

// ------- Suscripciones en vivo
const historialRootRef = database.ref('/historial_mediciones');

historialRootRef.limitToLast(1).on('child_added', snap => {
  const data = snap.val() || {};
  if (isValidStr(data.hora)) { ultimaHoraGlobal = data.hora; updateTimeInfoUI(); }
  if (isValidStr(data.fecha)) { ultimaFechaGlobal = data.fecha; updateTimeInfoUI(); }
  renderUltimaMedicion(data);

  if (typeof window.staleMsFromFechaHora === "function" && typeof window.staleMarkUpdate === "function") {
    const fechaEfectiva =
      (data && data.fecha) ??
      ultimaFechaGlobal ??
      fechaInicioGlobal ??
      new Date().toISOString().slice(0,10);

    const msData = window.staleMsFromFechaHora(fechaEfectiva, data && data.hora);
    //console.log("[stale] child_added ->", fechaEfectiva, data && data.hora, msData);
    window.staleMarkUpdate(msData);
  }
});

historialRootRef.limitToLast(1).on('child_changed', snap => {
  const data = snap.val() || {};
  if (isValidStr(data.hora)) { ultimaHoraGlobal = data.hora; updateTimeInfoUI(); }
  if (isValidStr(data.fecha)) { ultimaFechaGlobal = data.fecha; updateTimeInfoUI(); }
  renderUltimaMedicion(data);

  if (typeof window.staleMsFromFechaHora === "function" && typeof window.staleMarkUpdate === "function") {
    const fechaEfectiva =
      (data && data.fecha) ??
      ultimaFechaGlobal ??
      fechaInicioGlobal ??
      new Date().toISOString().slice(0,10);

    const msData = window.staleMsFromFechaHora(fechaEfectiva, data && data.hora);
    //console.log("[stale] child_changed ->", fechaEfectiva, data && data.hora, msData);
    window.staleMarkUpdate(msData);
  }
});

// ---- CSV
function descargarCSV(){
  const historialRef = database.ref('/historial_mediciones');
  historialRef.once('value',(snapshot)=>{
    const data=snapshot.val();
    if (!data){ alert("No hay datos en el historial."); return; }

    const headers=[
      "pm1.0","pm2.5","pm4.0","pm10.0",
      "voc","nox","co2","Temperatura","HumedadRelativa",
      "fechaDeMedicion","HoraDeInicio","ubicacion","HoraMedicion"
    ];
    const keyMap={
      "pm1.0":"pm1p0","pm2.5":"pm2p5","pm4.0":"pm4p0","pm10.0":"pm10p0",
      "voc":"voc","nox":"nox","co2":"co2","Temperatura":"cTe","HumedadRelativa":"cHu",
      "fechaDeMedicion":"fecha","HoraDeInicio":"inicio","ubicacion":"ciudad","HoraMedicion":"hora"
    };

    const entries=Object.values(data);
    let csv=headers.join(",")+"\n";
    let lastFecha=fechaInicioGlobal;
    entries.forEach(entry=>{
      const row=headers.map(key=>{
        const actualKey=keyMap[key]; let value=entry[actualKey];
        if (key==="fechaDeMedicion"){ if (isValidStr(value)) lastFecha=value; value=lastFecha ?? "0"; }
        if (key==="HoraDeInicio") value=horaInicioGlobal ?? value;
        if (key==="ubicacion") value=ubicacionGlobal ?? value;
        if (["voc","nox","HumedadRelativa"].includes(key)) value=Math.round(Number(value)||0);
        if (!isValidStr(value)) return "0"; return value;
      }).join(",");
      csv+=row+"\n";
    });

    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url; link.download="historial_mediciones.csv";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}
