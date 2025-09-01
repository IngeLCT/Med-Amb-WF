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

            currentLoadedData = parsedData.sort((a, b) => {
                return parseTimeToSeconds(a.tiempo) - parseTimeToSeconds(b.tiempo);
            });

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

function createOrUpdatePlotly(dataToChart, dataLabel, timeLabels) {
    chartContainer.innerHTML = '';

    const trace = {
        x: timeLabels,
        y: dataToChart,
        mode: 'lines',
        name: dataLabel,
        line: { color: '#000066' }
    };

    const layout = {
        title: {
            text: dataLabel,
            font: { size: 20, color: 'black', family: 'Arial', weight: 'bold' }
        },
        xaxis: {
            title: {
                text: 'Tiempo Transcurrido',
                font: { size: 16, color: 'black', family: 'Arial', weight: 'bold' },
                standoff: 20
            },
            tickfont: { color: 'black', size: 14, family: 'Arial', weight: 'bold' },
            gridcolor: 'black',
            linecolor: 'black',
            tickangle: -45
        },
        yaxis: {
            title: {
                text: dataLabel,
                font: { size: 16, color: 'black', family: 'Arial', weight: 'bold' }
            },
            tickfont: { color: 'black', size: 14, family: 'Arial', weight: 'bold' },
            gridcolor: 'black',
            linecolor: 'black'
        },
        plot_bgcolor: "#cce5dc",
        paper_bgcolor: "#cce5dc",
        margin: { t: 50, l: 60, r: 40, b: 80 }
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
    const labels = slice.map(row => row.TiempoTranscurrido);

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
  minBubble.innerHTML = currentLoadedData[minRange]?.TiempoTranscurrido || '';
};
const setMaxValueOutput = () => {
  maxRange = parseInt(rangeInputs[1].value);
  maxBubble.innerHTML = currentLoadedData[maxRange]?.TiempoTranscurrido || '';
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
dataTableContainer.style.margin = '20px auto';
dataTableContainer.style.maxWidth = '1200px';
dataTableContainer.style.overflowX = 'auto';
document.body.appendChild(dataTableContainer);

const ROWS_PER_PAGE = 20;
let currentPage = 1;

function updateDataTable(dataSlice, key) {
  if (!Array.isArray(dataSlice)) return;

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['#', 'Tiempo', key.toUpperCase()].forEach(text => {
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
    tdTime.textContent = row.TiempoTranscurrido || '-';
    tr.appendChild(tdTime);

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
  const labels = slice.map(row => row.TiempoTranscurrido);

  createOrUpdatePlotly(values, label, labels);
  currentPage = 1;
  updateDataTable(slice, key);
}
