

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
const sensorDataRef = database.ref('/ultima_medicion');

let fechaInicioGlobal = null;
let horaInicioGlobal = null;
let ubicacionGlobal = null;
let ESPIDGlobal = null;

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

// Lectura en tiempo real
sensorDataRef.on('value', (snapshot) => {
  const data = snapshot.val();
  const dataTable = document.getElementById("data-table");
  const timeInfo = document.getElementById("time-info");
  const IDBCursor = document.getElementById("ID");

  if (data) {
    let tableHTML = `
      <tr> <th>Mediciones</th> <th>Valor</th> <th>Unidad</th> </tr>
      <tr> <td>PM1.0</td> <td>${data.pm1p0 ?? '0'}</td> <td>µg/m³</td> </tr>
      <tr> <td>PM2.5</td> <td>${data.pm2p5 ?? '0'}</td> <td>µg/m³</td> </tr>
      <tr> <td>PM4.0</td> <td>${data.pm4p0 ?? '0'}</td> <td>µg/m³</td> </tr>
      <tr> <td>PM10.0</td> <td>${data.pm10p0 ?? '0'}</td> <td>µg/m³</td> </tr>
      <tr> <td>VOC</td> <td>${data.voc ?? '0'}</td> <td>Index</td> </tr>
      <tr> <td>NOx</td> <td>${data.nox ?? '0'}</td> <td>Index</td> </tr>
      <tr> <td>CO2</td> <td>${data.co2 ?? '0'}</td> <td>ppm</td> </tr>
      <tr> <td>Temperatura</td> <td>${data.cTe ?? '0'}</td> <td>°C</td> </tr>
      <tr> <td>Humedad Relativa</td> <td>${data.cHu ?? '0'}</td> <td>%</td> </tr>
    `;
    dataTable.innerHTML = tableHTML;

    timeInfo.innerHTML = `
      <strong>Fecha de inicio:</strong> ${fechaInicioGlobal ?? '---'} <br>
      <strong>Hora de inicio:</strong> ${horaInicioGlobal ?? '---'}<br>
      <strong>Ubicacion:</strong> ${ubicacionGlobal ?? '---'}<br>
      <strong>Tiempo transcurrido:</strong> ${data.tiempo ?? '0'}
    `;

    IDBCursor.innerHTML= `
    <strong>ID:</strong> ${ESPIDGlobal ?? '---'}  <br>
    `;
  }
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
      "fechaDeInicio", "HoraDeInicio", "ubicacion", "TiempoTranscurrido"
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
      "fechaDeInicio": "fecha",
      "HoraDeInicio": "inicio",
      "ubicacion": "ciudad",
      "TiempoTranscurrido": "tiempo"
    };

    function parseTiempo(tiempoStr) {
      if (!tiempoStr || typeof tiempoStr !== 'string') return 0;
      const [h, m, s] = tiempoStr.split(':').map(Number);
      return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
    }

    const sortedData = Object.values(data).sort((a, b) => parseTiempo(a.tiempo) - parseTiempo(b.tiempo));
    const seenTiempos = new Set();
    const uniqueEntries = sortedData.filter(entry => {
      if (!entry.tiempo || seenTiempos.has(entry.tiempo)) return false;
      seenTiempos.add(entry.tiempo);
      return true;
    });

    let csv = headers.join(",") + "\n";

    uniqueEntries.forEach(entry => {
      const row = headers.map(key => {
        const actualKey = keyMap[key];
        let value = entry[actualKey];

        // Forzar los datos iniciales desde el primer registro
        if (key === "fechaDeInicio") value = fechaInicioGlobal ?? value;
        if (key === "HoraDeInicio") value = horaInicioGlobal ?? value;
        if (key === "ubicacion") value = ubicacionGlobal ?? value;

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