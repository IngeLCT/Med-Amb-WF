// upload-graph.js (versión Plotly.js con nuevo slider de doble rango estilo burbuja)

const csvFileInput = document.getElementById('csvFileInput');
const statusMessage = document.getElementById('statusMessage');
const dataSelector = document.getElementById('dataSelector');
const chartContainer = document.getElementById('myChart');

const rangeInputs = document.querySelectorAll('input[type="range"]');
const rangeTrack = document.getElementById('range_track');
const minBubble = document.querySelector('.minvalue');
const maxBubble = document.querySelector('.maxvalue');

let currentLoadedData = [];
let minRange = 0, maxRange = 0, minPercentage = 0, maxPercentage = 0;
const minRangeValueGap = 6;

csvFileInput.addEventListener('change', () => {
    const file = csvFileInput.files[0];
    if (!file) {
        statusMessage.textContent = 'Por favor, selecciona un archivo CSV primero.';
        return;
    }

    statusMessage.textContent = 'Leyendo y procesando archivo...';

    const reader = new FileReader();
    reader.onload = (e) => {
        const csvText = e.target.result;
        try {
            const parsedData = parseCsv(csvText);
            const parseTimeToSeconds = (timeStr) => {
                if (!timeStr || typeof timeStr !== 'string') return 0;
                const parts = timeStr.split(':').map(Number);
                return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
            };

            currentLoadedData = parsedData; // Respeta el orden original del CSV

            if (currentLoadedData.length === 0) {
                statusMessage.textContent = 'El archivo CSV está vacío o no contiene datos válidos.';
                chartContainer.innerHTML = '';
                return;
            }

            statusMessage.textContent = `Archivo "${file.name}" cargado y listo para graficar.`;
            setupRangeSliders(currentLoadedData.length);
            dataSelector.dispatchEvent(new Event('change'));

        } catch (error) {
            console.error("Error al procesar el archivo CSV:", error);
            statusMessage.textContent = `Error al procesar el CSV: ${error.message}`;
            chartContainer.innerHTML = '';
            currentLoadedData = [];
        }
    };

    reader.onerror = () => {
        statusMessage.textContent = 'Error al leer el archivo.';
        console.error('Error reading file:', reader.error);
    };

    reader.readAsText(file);
});

function parseCsv(csvString) {
    const lines = csvString.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length !== headers.length) continue;
        const row = {};
        headers.forEach((h, idx) => row[h] = values[idx]);
        data.push(row);
    }
    return data;
}

function getBarColor(dataLabel) {
    // Asignar color según el tipo de medición, igual que en las gráficas individuales
    const label = dataLabel.toLowerCase();
    // PM10.0 debe ir antes que PM1.0 para evitar coincidencias
    if (label.includes('pm10')) return '#bf00ff'; // PM10.0
    if (label.includes('pm1.0') || label.includes('pm1p0')) return 'red'; // PM1.0
    if (label.includes('pm2.5') || label.includes('pm2_5')) return '#bfa600'; // PM2.5 amarillo oscuro
    if (label.includes('pm4.0') || label.includes('pm4_0')) return '#00bfbf'; // PM4.0 turquesa
    if (label.includes('co2')) return '#990000'; // CO2
    if (label.includes('temperatura') || label.includes('temp') || label.includes('cte')) return '#006600'; // Temperatura
    if (label.includes('humedad') || label.includes('hum') || label.includes('chu')) return '#0000cc'; // Humedad
    if (label.includes('voc')) return '#ff8000'; // VOC
    if (label.includes('nox')) return '#00ff00'; // NOx
    // Puedes agregar más reglas aquí si tienes más mediciones
    return '#000066'; // color por defecto
}

function createOrUpdatePlotly(dataToChart, dataLabel, timeLabels) {
    chartContainer.innerHTML = '';

    // Etiquetas X: formato ISO para time series
    const start = parseInt(rangeInputs[0].value);
    const end = parseInt(rangeInputs[1].value);
    const customLabels = currentLoadedData.slice(start, end + 1).map(row => {
        // Convertir fechaDeMedicion de DD-MM-YY a YYYY-MM-DD
    let fecha = row.fechaDeMedicion || '';
    let hora = row.HoraMedicion || '';
    let partes = fecha.split('-');
    // Ahora el año ya viene completo (YYYY)
    let yyyy = partes[2];
    let isoDate = `${yyyy}-${partes[1]?.padStart(2, '0') || ''}-${partes[0]?.padStart(2, '0') || ''}`;
    return `${isoDate} ${hora}`;
    });
    const trace = {
        x: customLabels,
        y: dataToChart,
        type: 'bar',
        name: dataLabel,
        marker: { color: getBarColor(dataLabel) }
    };

    const layout = {
        title: {
            text: dataLabel,
            font: { size: 20, color: 'black', family: 'Arial', weight: 'bold' }
        },
        xaxis: {
            title: {
                text: 'Fecha y Hora de Medición',
                font: { size: 16, color: 'black', family: 'Arial', weight: 'bold' },
                standoff: 30
            },
            type: 'date',
            tickfont: { color: 'black', size: 14, family: 'Arial', weight: 'bold' },
            gridcolor: 'black',
            linecolor: 'black',
            autorange: true,
            tickangle: -45,
            nticks: 30,
        },
        yaxis: {
            title: {
                text: dataLabel,
                font: { size: 16, color: 'black', family: 'Arial', weight: 'bold' }
            },
            tickfont: { color: 'black', size: 14, family: 'Arial', weight: 'bold' },
            gridcolor: 'black',
            linecolor: 'black',
            autorange: true,
            fixedrange: false
        },
        plot_bgcolor: "#cce5dc",
        paper_bgcolor: "#cce5dc",
        margin: { t: 50, l: 60, r: 40, b: 110 }
    };

    Plotly.newPlot(chartContainer, [trace], layout, {
        responsive: true,
        useResizeHandler: true
    });
}

dataSelector.addEventListener('change', () => {
    if (currentLoadedData.length === 0) {
        statusMessage.textContent = "Carga un archivo CSV para graficar.";
        chartContainer.innerHTML = '';
        return;
    }
    updateChartInRange();
});

function updateChartInRange() {
    const key = dataSelector.value;
    const label = dataSelector.options[dataSelector.selectedIndex].text;

    const start = parseInt(rangeInputs[0].value);
    const end = parseInt(rangeInputs[1].value);

    if (start > end || currentLoadedData.length === 0) return;

    const slice = currentLoadedData.slice(start, end + 1);
    const values = slice.map(row => parseFloat(row[key])).filter(v => !isNaN(v));
    const labels = slice.map(row => row.HoraMedicion);

    createOrUpdatePlotly(values, label, labels);
}

function setupRangeSliders(length) {
    rangeInputs[0].max = rangeInputs[1].max = length - 1;
    rangeInputs[0].value = 0;
    rangeInputs[1].value = length - 1;

    setMinValueOutput();
    setMaxValueOutput();
    minRangeFill();
    maxRangeFill();
    MinVlaueBubbleStyle();
    MaxVlaueBubbleStyle();
    updateChartInRange();
}

function updateSliderUI() {
    setMinValueOutput();
    setMaxValueOutput();
    minRangeFill();
    maxRangeFill();
    MinVlaueBubbleStyle();
    MaxVlaueBubbleStyle();
    updateChartInRange();
}

const minRangeFill = () => {
    rangeTrack.style.left = (rangeInputs[0].value / rangeInputs[0].max) * 100 + "%";
};
const maxRangeFill = () => {
    rangeTrack.style.right = 100 - (rangeInputs[1].value / rangeInputs[1].max) * 100 + "%";
};
const MinVlaueBubbleStyle = () => {
  const percent = (rangeInputs[0].value / rangeInputs[0].max) * 100;
  minBubble.style.left = `${percent}%`;
};

const MaxVlaueBubbleStyle = () => {
  const percent = (rangeInputs[1].value / rangeInputs[1].max) * 100;
  maxBubble.style.left = `${percent}%`;
};
const setMinValueOutput = () => {
    minRange = parseInt(rangeInputs[0].value);
    const row = currentLoadedData[minRange];
    minBubble.innerHTML = row ? `${row.fechaDeMedicion || ''} ${row.HoraMedicion || ''}` : '';
};
const setMaxValueOutput = () => {
    maxRange = parseInt(rangeInputs[1].value);
    const row = currentLoadedData[maxRange];
    maxBubble.innerHTML = row ? `${row.fechaDeMedicion || ''} ${row.HoraMedicion || ''}` : '';
};

rangeInputs.forEach((input) => {
    input.addEventListener("input", (e) => {
        setMinValueOutput();
        setMaxValueOutput();

        minRangeFill();
        maxRangeFill();

        MinVlaueBubbleStyle();
        MaxVlaueBubbleStyle();

        if (maxRange - minRange < minRangeValueGap) {
            if (e.target.className === "min") {
                rangeInputs[0].value = maxRange - minRangeValueGap;
                setMinValueOutput();
                minRangeFill();
                MinVlaueBubbleStyle();
                e.target.style.zIndex = "2";
            } else {
                rangeInputs[1].value = minRange + minRangeValueGap;
                e.target.style.zIndex = "2";
                setMaxValueOutput();
                maxRangeFill();
                MaxVlaueBubbleStyle();
            }
        }

        updateChartInRange();
    });
});

const dataTableContainer = document.createElement('div');
dataTableContainer.id = 'dataTable';
dataTableContainer.style.margin = '40px auto 20px auto'; // margen superior aumentado para separar de la gráfica
dataTableContainer.style.maxWidth = '1200px';
dataTableContainer.style.overflowX = 'auto';
dataTableContainer.style.borderTop = 'none'; // asegurarse que no haya línea negra
document.body.appendChild(dataTableContainer);

const ROWS_PER_PAGE = 20;
let currentPage = 1;

function updateDataTable(dataSlice, key) {
  if (!Array.isArray(dataSlice)) return;

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['#', 'HoraMedicion', 'FechaMedicion', key.toUpperCase()].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    dataSlice.forEach((row, i) => {
        const tr = document.createElement('tr');

        const tdIndex = document.createElement('td');
        tdIndex.textContent = i;
        tr.appendChild(tdIndex);

        const tdTime = document.createElement('td');
        tdTime.textContent = row.HoraMedicion || '-';
        tr.appendChild(tdTime);

        const tdFecha = document.createElement('td');
        tdFecha.textContent = row.fechaDeMedicion || '-';
        tr.appendChild(tdFecha);

        const tdValue = document.createElement('td');
        tdValue.textContent = row[key] || '-';
        tr.appendChild(tdValue);

        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    dataTableContainer.innerHTML = '';
    dataTableContainer.appendChild(table);
}

function updateChartInRange() {
  const key = dataSelector.value;
  const label = dataSelector.options[dataSelector.selectedIndex].text;

  const start = parseInt(rangeInputs[0].value);
  const end = parseInt(rangeInputs[1].value);

  if (start > end || currentLoadedData.length === 0) return;

  const slice = currentLoadedData.slice(start, end + 1);
  const values = slice.map(row => parseFloat(row[key])).filter(v => !isNaN(v));
    const labels = slice.map(row => row.HoraMedicion);

  createOrUpdatePlotly(values, label, labels);
  currentPage = 1;
  updateDataTable(slice, key);
}