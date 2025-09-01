// grafamb.js
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

  initPlot("CO2", "CO2 ppm", "#990000", 300, 1000);
  initPlot("TEM", "Temperatura °C", "#006600", 20, 50);
  initPlot("HUM", "Humedad Relativa %", "#0000cc", 0, 100);

  const db = firebase.database();
  const ref = db.ref("/ultima_medicion");

  ref.on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const timestamp = data.tiempo ?? new Date().toLocaleTimeString();

    updatePlot("CO2", timestamp, data.co2 ?? 0);
    updatePlot("TEM", timestamp, data.cTe ?? 0);
    updatePlot("HUM", timestamp, data.cHu ?? 0);
  });
});
