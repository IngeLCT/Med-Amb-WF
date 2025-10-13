// main.js —
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

// --- Estado global "estático" (se fija con el primer dato y cambia la fecha solo si es otro día)
let fechaInicioGlobal = null;   // cambia si cambia el día reportado
let horaInicioGlobal = null;    // primera recibida
let ubicacionGlobal = null;     // primera recibida
let ESPIDGlobal = null;         // primera recibida

// --- Estado "dinámico" (último dato)
let ultimaFechaGlobal = null;   // última 'fecha' realmente recibida en la BD
let ultimaHoraGlobal  = null;   // última 'hora' recibida

// --- Alerta por inactividad (30 min)
const UMBRAL_MINUTOS_SIN_ACT = 30;
let recibioAlgunaMedicion = false;  // se activa con el PRIMER evento vivo
let ultimaActualizacionMs = null;   // Date.now() del último evento vivo
let idIntervaloVigilante = null;
let alertaMostrada = false;

function iniciarVigilante() {
  if (idIntervaloVigilante) return;
  idIntervaloVigilante = setInterval(() => {
    if (!recibioAlgunaMedicion || !ultimaActualizacionMs) return;
    const mins = (Date.now() - ultimaActualizacionMs) / 60000;
    if (mins >= UMBRAL_MINUTOS_SIN_ACT) {
      mostrarAlertaInactividad(Math.floor(mins));
    }
  }, 60 * 1000); // revisa cada minuto
}

function mostrarAlertaInactividad(mins) {
  if (alertaMostrada) return;
  alertaMostrada = true;

  let banner = document.getElementById('stale-alert');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'stale-alert';
    banner.style.cssText = [
      'position:fixed','left:0','right:0','bottom:0','z-index:9999',
      'padding:12px 16px','background:#ffd1d1','color:#8b0000',
      'border-top:2px solid #8b0000','font-weight:600','text-align:center'
    ].join(';');

    const span = document.createElement('span');
    span.id = 'stale-alert-text';
    span.textContent = 'Sin actualizaciones en los últimos 30 minutos.';
    banner.appendChild(span);

    const btn = document.createElement('button');
    btn.textContent = 'Cerrar';
    btn.style.cssText = 'margin-left:12px;padding:4px 8px;font-weight:600';
    btn.onclick = () => { alertaMostrada = false; banner.remove(); };
    banner.appendChild(btn);

    document.body.appendChild(banner);
  } else {
    const span = document.getElementById('stale-alert-text');
    if (span) span.textContent = `Sin actualizaciones en los últimos 30 minutos (≈${mins} min).`;
  }

  // Llamada de atención: una vez
  try { alert('Aviso: No se han recibido actualizaciones en 30 minutos.'); } catch (e) {}
}

function limpiarAlertaInactividad() {
  alertaMostrada = false;
  const banner = document.getElementById('stale-alert');
  if (banner) banner.remove();
}

function marcaActualizacionReciente() {
  // Se llama únicamente cuando llega un evento vivo (child_added/changed limitToLast(1))
  recibioAlgunaMedicion = true;
  ultimaActualizacionMs = Date.now();
  limpiarAlertaInactividad();
  iniciarVigilante();
}

// ---- Utilidades UI
function prepararTablaVacia() {
  const tbl = document.getElementById('data-table');
  if (tbl && !tbl.dataset.prepared) {
    tbl.dataset.prepared = '1';
    tbl.innerHTML = `
      <tr> <th>Mediciones</th> <th>Valor</th> <th>Unidad</th> </tr>
    `;
  }
  if (!document.getElementById('waiting-msg')) {
    const msg = document.createElement('div');
    msg.id = 'waiting-msg';
    msg.style.cssText = [
      'margin:20px 0',
      'width:100%',
      'display:block',
      'text-align:center',
      'font-size:32px',
      'font-weight:700',
      'color:#000'
    ].join(';');
    msg.textContent = 'Esperando Datos...';
    const tableEl = document.getElementById('data-table');
    if (tableEl && tableEl.parentNode) {
      tableEl.parentNode.insertBefore(msg, tableEl);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', prepararTablaVacia);
} else {
  prepararTablaVacia();
}

// ---- Helpers
function isValidStr(v) {
  return v !== undefined && v !== null && String(v).trim() !== '' && String(v).toLowerCase() !== 'nan';
}

function updateTimeInfoUI() {
  const timeInfo = document.getElementById("time-info");
  if (!timeInfo) return;

  const hayAlgo = (v) => v !== null && v !== undefined && String(v).trim() !== "";
  if (!hayAlgo(ultimaFechaGlobal) && !hayAlgo(ultimaHoraGlobal)) {
    timeInfo.innerHTML = "";
    return;
  }
  timeInfo.innerHTML =
    '<strong>Fecha Última Medición:</strong> ' + (ultimaFechaGlobal ?? '') + '<br>' +
    '<strong>Hora Última Medición:</strong> ' + (ultimaHoraGlobal ?? '');
}

// ===== NUEVO: helpers para controlar el pintado de estáticos =====
function hasAnyStatic() {
  return [ESPIDGlobal, horaInicioGlobal, ubicacionGlobal, fechaInicioGlobal]
    .some(isValidStr);
}

function clearStaticInfoUI() {
  const staticP = document.getElementById('T-I-Static');
  const idEl = document.getElementById('ID');
  if (staticP) staticP.innerHTML = '';
  if (idEl) idEl.innerHTML = '';
}

function updateStaticInfoUI() {
  if (!hasAnyStatic()) {
    clearStaticInfoUI();
    return;
  }
  const staticP = document.getElementById('T-I-Static');
  const idEl = document.getElementById('ID');

  if (staticP) {
    staticP.innerHTML =
      '<strong>Fecha de inicio:</strong> ' + (fechaInicioGlobal ?? '') + ' <br>' +
      '<strong>Hora de inicio:</strong> ' + (horaInicioGlobal ?? '') + '<br>' +
      '<strong>Ubicación:</strong> ' + (ubicacionGlobal ?? '');
  }
  if (idEl) {
    idEl.innerHTML = `<strong>ID:</strong> ${ESPIDGlobal ?? ''}<br>`;
  }
}

// ---- Semilla: buscar en la "cola" la última 'fecha' no vacía
function seedUltimaFechaDesdeCola() {
  database.ref('/historial_mediciones')
    .limitToLast(2000)               // ajusta si tu día supera este número de muestras
    .once('value', (snap) => {
      let ultima = null;
      snap.forEach(child => {
        const e = child.val() || {};
        if (isValidStr(e.fecha)) ultima = e.fecha;  // la última no vacía que aparezca
      });
      if (ultima) {
        ultimaFechaGlobal = ultima;
        updateTimeInfoUI();
      }
    });
}
seedUltimaFechaDesdeCola();

// ---- Escucha para fijar datos estáticos (y actualizar fecha si cambia de día)
function listenStaticFields() {
  // 1) Primer registro histórico
  database.ref('/historial_mediciones').orderByKey().limitToFirst(1).once('value', (snap) => {
    const firstObj = snap.val();
    if (firstObj) {
      const entry = Object.values(firstObj)[0] || {};
      if (ESPIDGlobal == null && isValidStr(entry.id)) ESPIDGlobal = entry.id;
      if (horaInicioGlobal == null && isValidStr(entry.inicio)) horaInicioGlobal = entry.inicio;
      if (ubicacionGlobal == null && isValidStr(entry.ciudad)) ubicacionGlobal = entry.ciudad;
      if (fechaInicioGlobal == null && isValidStr(entry.fecha)) fechaInicioGlobal = entry.fecha;
      updateStaticInfoUI();         // <- pinta porque sí hay datos
    } else {
      clearStaticInfoUI();          // <- AHORA: sin datos, deja vacío
    }
  });

  // 2) Último registro para completar/actualizar
  const newestRef = database.ref('/historial_mediciones').limitToLast(1);
  const onAdded = (snap) => {
    const entry = snap.val() || {};
    if (ESPIDGlobal == null && isValidStr(entry.id)) ESPIDGlobal = entry.id;
    if (horaInicioGlobal == null && isValidStr(entry.inicio)) horaInicioGlobal = entry.inicio;
    if (ubicacionGlobal == null && isValidStr(entry.ciudad)) ubicacionGlobal = entry.ciudad;

    if (isValidStr(entry.fecha)) {
      if (fechaInicioGlobal !== entry.fecha) fechaInicioGlobal = entry.fecha; // cambia solo si es otro día
      ultimaFechaGlobal = entry.fecha;
    }
    updateStaticInfoUI();           // pinta cuando llega el primer dato
  };

  newestRef.on('child_added', onAdded);
  newestRef.on('child_changed', onAdded);
}
listenStaticFields();

// ---- Render del último dato (solo tabla + última fecha/hora)
function renderUltimaMedicion(data) {
  if (!data) return;

  const wait = document.getElementById('waiting-msg');
  if (wait) wait.remove();

  const dataTable = document.getElementById("data-table");

  // Encabezado asegurado
  if (!dataTable.querySelector('th')) {
    dataTable.innerHTML = '<tr> <th>Mediciones</th> <th>Valor</th> <th>Unidad</th> </tr>';
  }

  // --- TABLA
  const rows = [
    `<tr> <td>PM1.0</td> <td>${data.pm1p0 ?? '0'}</td> <td>µg/m³</td> </tr>`,
    `<tr> <td>PM2.5</td> <td>${data.pm2p5 ?? '0'}</td> <td>µg/m³</td> </tr>`,
    `<tr> <td>PM4.0</td> <td>${data.pm4p0 ?? '0'}</td> <td>µg/m³</td> </tr>`,
    `<tr> <td>PM10.0</td> <td>${data.pm10p0 ?? '0'}</td> <td>µg/m³</td> </tr>`,
    `<tr> <td>VOC</td> <td>${Math.round(data.voc ?? 0)}</td> <td>Index</td> </tr>`,
    `<tr> <td>NOx</td> <td>${Math.round(data.nox ?? 0)}</td> <td>Index</td> </tr>`,
    `<tr> <td>CO2</td> <td>${data.co2 ?? '0'}</td> <td>ppm</td> </tr>`,
    `<tr> <td>Temperatura</td> <td>${data.cTe ?? '0'}</td> <td>°C</td> </tr>`,
    `<tr> <td>Humedad Relativa</td> <td>${Math.round(data.cHu ?? 0)}</td> <td>%</td> </tr>`
  ];
  const header = dataTable.querySelector('tr');
  dataTable.innerHTML = header.outerHTML + rows.join('');

  // Actualiza la hora del último dato si vino:
  if (isValidStr(data.hora)) {
    ultimaHoraGlobal = data.hora;
    updateTimeInfoUI();
  }
}

// ---- Suscripciones del "último" registro para render dinámico
const historialRootRef = database.ref('/historial_mediciones');

historialRootRef.limitToLast(1).on('child_added', snap => {
  const data = snap.val() || {};
  if (isValidStr(data.hora)) {
    ultimaHoraGlobal = data.hora;
    updateTimeInfoUI();
  }
  if (isValidStr(data.fecha)) {
    ultimaFechaGlobal = data.fecha;
    updateTimeInfoUI();
  }
  renderUltimaMedicion(data);

  // Marca que llegó un evento vivo y arranca/reinicia el conteo de 30 min
  marcaActualizacionReciente();
});

historialRootRef.limitToLast(1).on('child_changed', snap => {
  const data = snap.val() || {};
  if (isValidStr(data.hora)) {
    ultimaHoraGlobal = data.hora;
    updateTimeInfoUI();
  }
  if (isValidStr(data.fecha)) {
    ultimaFechaGlobal = data.fecha;
    updateTimeInfoUI();
  }
  renderUltimaMedicion(data);

  // Marca que llegó un evento vivo y arranca/reinicia el conteo de 30 min
  marcaActualizacionReciente();
});

// ---- CSV (igual que lo tenías, respeta los globales)
function descargarCSV() {
  const historialRef = database.ref('/historial_mediciones');

  historialRef.once('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      alert("No hay datos en el historial.");
      return;
    }

    const headers = [
      "pm1.0", "pm2.5", "pm4.0", "pm10.0",
      "voc", "nox", "co2", "Temperatura", "HumedadRelativa",
      "fechaDeMedicion", "HoraDeInicio", "ubicacion", "HoraMedicion"
    ];

    const keyMap = {
      "pm1.0": "pm1p0",
      "pm2.5": "pm2p5",
      "pm4.0": "pm4p0",
      "pm10.0": "pm10p0",
      "voc": "voc",
      "nox": "nox",
      "co2": "co2",
      "Temperatura": "cTe",
      "HumedadRelativa": "cHu",
      "fechaDeMedicion": "fecha",
      "HoraDeInicio": "inicio",
      "ubicacion": "ciudad",
      "HoraMedicion": "hora"
    };

    const entries = Object.values(data);
    let csv = headers.join(",") + "\n";
    let lastFecha = fechaInicioGlobal;
    entries.forEach(entry => {
      const row = headers.map(key => {
        const actualKey = keyMap[key];
        let value = entry[actualKey];

        if (key === "fechaDeMedicion") {
          if (isValidStr(value)) lastFecha = value;
          value = lastFecha ?? "0";
        }
        if (key === "HoraDeInicio") value = horaInicioGlobal ?? value;
        if (key === "ubicacion") value = ubicacionGlobal ?? value;

        if (["voc","nox","HumedadRelativa"].includes(key)) {
          value = Math.round(Number(value) || 0);
        }
        if (!isValidStr(value)) return "0";
        return value;
      }).join(",");
      csv += row + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "historial_mediciones.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}
