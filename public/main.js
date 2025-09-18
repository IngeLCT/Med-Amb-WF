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
// Eliminado el uso de /ultima_medicion. Ahora todo se obtiene desde /historial_mediciones.
// Referencia en tiempo real al último registro del historial
const lastMeasurementRef = database.ref('/historial_mediciones').orderByKey().limitToLast(1);

let fechaInicioGlobal = null;
let horaInicioGlobal = null;
let ubicacionGlobal = null;
let ESPIDGlobal = null;
let ultimaFechaGlobal = null;

// Preparar tabla vacía con encabezados y mensaje "Esperando Datos" arriba
function prepararTablaVacia() {
  const tbl = document.getElementById('data-table');
  if (tbl && !tbl.dataset.prepared) {
    tbl.dataset.prepared = '1';
    tbl.innerHTML = `
      <tr> <th>Mediciones</th> <th>Valor</th> <th>Unidad</th> </tr>
    `; // sin filas de datos todavía
  }
  if (!document.getElementById('waiting-msg')) {
    const msg = document.createElement('div');
    msg.id = 'waiting-msg';
    msg.style.cssText = 'margin:10px 0;font-size:20px;font-weight:bold;color:#154360;letter-spacing:.5px;text-align:left;';
    msg.textContent = 'Esperando Datos';
    const tableEl = document.getElementById('data-table');
    if (tableEl && tableEl.parentNode) {
      tableEl.parentNode.insertBefore(msg, tableEl); // insertar arriba de la tabla
    }
  }
}

// Ejecutar una vez al cargar el script (si el DOM ya está) o esperar al load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', prepararTablaVacia);
} else {
  prepararTablaVacia();
}

// Al iniciar la página, leer el primer registro del historial
const historialRef = database.ref('/historial_mediciones').orderByKey().limitToFirst(1);

historialRef.once('value', (snapshot) => {
  const firstEntry = snapshot.val();
  if (firstEntry) {
    const entry = Object.values(firstEntry)[0];
    fechaInicioGlobal = entry.fecha || null;
    horaInicioGlobal = entry.inicio || null;
    ubicacionGlobal = entry.ciudad || null;
    ESPIDGlobal = entry.id || null;
  }
});

// Bootstrap: find the last known fecha among the latest records
const ultFechaQuery = database.ref('/historial_mediciones').orderByKey().limitToLast(200);
ultFechaQuery.once('value', snap => {
  const obj = snap.val() || {};
  const entries = Object.values(obj);
  for(let i = entries.length - 1; i >= 0; i--){
    const f = entries[i] && entries[i].fecha;
    if (f && String(f).trim() !== '' && String(f).toLowerCase() !== 'nan'){
      ultimaFechaGlobal = f;
      if (!renderUltimaMedicion.ultimaFecha) renderUltimaMedicion.ultimaFecha = f;
      break;
    }
  }
});

// Función de render reutilizable
function renderUltimaMedicion(data) {
  if (!data) return;
  // Quitar mensaje de espera si existe
  const wait = document.getElementById('waiting-msg');
  if (wait) wait.remove();
  if (!renderUltimaMedicion.first) {
    renderUltimaMedicion.first = true; // primera vez
  }
  const dataTable = document.getElementById("data-table");
  const timeInfo = document.getElementById("time-info");
  const IDBCursor = document.getElementById("ID");
  // Hora más reciente
  renderUltimaMedicion.ultimaHora = data.hora || renderUltimaMedicion.ultimaHora || '---';
  renderUltimaMedicion.ultimaFecha = (data.fecha && String(data.fecha).trim() !== '' && String(data.fecha).toLowerCase() !== 'nan') ? data.fecha : (renderUltimaMedicion.ultimaFecha || ultimaFechaGlobal || fechaInicioGlobal || '---');

  // Asegurar que encabezado exista (si alguien limpió la tabla)
  if (!dataTable.querySelector('th')) {
    dataTable.innerHTML = '<tr> <th>Mediciones</th> <th>Valor</th> <th>Unidad</th> </tr>';
  }
  // Construir filas de datos (sin reponer encabezado)
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
  // Reemplazar todo menos el encabezado
  const header = dataTable.querySelector('tr');
  dataTable.innerHTML = header.outerHTML + rows.join('');

  // NO MODIFICAR
  timeInfo.innerHTML = '' +
    '<strong>Fecha de inicio:</strong> ' + (fechaInicioGlobal ?? '---') + ' <br>' +
    '<strong>Hora de inicio:</strong> ' + (horaInicioGlobal ?? '---') + '<br>' +
    '<strong>Ubicacion:</strong> ' + (ubicacionGlobal ?? '---') + '<br>' +
    '<strong>Fecha Ultima Medición:</strong> ' + (renderUltimaMedicion.ultimaFecha) + '<br>' +
    '<strong>Hora Ultima Medición:</strong> ' + (renderUltimaMedicion.ultimaHora);


  // NO MODIFICAR
  IDBCursor.innerHTML= `
  <strong>ID:</strong> ${ESPIDGlobal ?? '---'}  <br>
  `;
}

// Suscripción a nuevos registros y cambios sobre el último
const historialRootRef = database.ref('/historial_mediciones');
// child_added se dispara para el último existente (por limitToLast) y luego para cada nuevo push
historialRootRef.limitToLast(1).on('child_added', snap => {
  renderUltimaMedicion(snap.val());
});
// Si el último registro se actualiza después de creado
historialRootRef.limitToLast(1).on('child_changed', snap => {
  renderUltimaMedicion(snap.val());
});

// CSV
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

    function parseFechaHora(fechaStr, horaStr) {
      // fechaStr: dd-mm-YYYY, horaStr: hh:mm:ss
      if (!fechaStr || typeof fechaStr !== 'string') fechaStr = '00-00-00';
      if (!horaStr || typeof horaStr !== 'string') horaStr = '00:00:00';
      // Convertir fecha a formato YYYYMMDD
      const [d, m, fullYear] = fechaStr.split('-').map(Number);
      // Convertir hora a segundos
      const [h, min, s] = horaStr.split(':').map(Number);
      return fullYear * 10000 + (m || 0) * 100 + (d || 0) + (h || 0) / 100 + (min || 0) / 10000 + (s || 0) / 1000000;
    }
    // Respeta el orden de inserción de Firebase
    const entries = Object.values(data);
    let csv = headers.join(",") + "\n";
    let lastFecha = fechaInicioGlobal;
    entries.forEach(entry => {
      const row = headers.map(key => {
        const actualKey = keyMap[key];
        let value = entry[actualKey];

        // Para la fecha, actualiza solo si existe una nueva
        if (key === "fechaDeMedicion") {
          if (value && value !== "" && value !== undefined && value !== null && String(value).toLowerCase() !== "nan") {
            lastFecha = value;
          }
          value = lastFecha ?? "0";
        }
        // Hora de inicio y ubicación se mantienen igual
        if (key === "HoraDeInicio") value = horaInicioGlobal ?? value;
        if (key === "ubicacion") value = ubicacionGlobal ?? value;
        // Redondear VOC, NOx y Humedad Relativa
        if (["voc","nox","HumedadRelativa"].includes(key)) {
          value = Math.round(Number(value) || 0);
        }
        if (
          value === undefined ||
          value === null ||
          value === '' ||
          String(value).toLowerCase() === 'nan'
        ) {
          return "0";
        }
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

