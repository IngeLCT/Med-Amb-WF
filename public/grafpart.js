// grafpart.js
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
