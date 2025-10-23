// stale-alert.js — librería común de alerta por inactividad
(() => {
  let thresholdMin = 15;      // valor por defecto; puedes sobreescribir en cada página con staleInit({thresholdMinutes: N})
  let alertShown = false;
  let timer = null;
  let lastBaseMs = null; // <- NUEVO: último “baseline” programado

  function msFromFechaHora(fecha, hora) {
    if (!fecha || !hora) return null;

    const f = String(fecha).trim();
    const h = String(hora).trim();

    const parts = f.split(/[-/]/).map(s => s.trim());
    if (parts.length !== 3) return null;

    let y, m, d;
    // Detecta formato: si la 1ª parte tiene 4 dígitos, es YYYY-MM-DD; si no, asume DD-MM-YYYY
    if (/^\d{4}$/.test(parts[0])) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      d = parseInt(parts[2], 10);
    } else {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      y = parseInt(parts[2], 10);
      if (y < 100) y += 2000; // por si viene "25" => 2025
    }

    if (![y, m, d].every(n => Number.isFinite(n))) return null;

    // Acepta HH:MM o HH:MM:SS
    const hhmmss = h.split(':').map(n => parseInt(n, 10));
    if (hhmmss.length < 2) return null;
    const hh = hhmmss[0] ?? 0;
    const mm = hhmmss[1] ?? 0;
    const ss = hhmmss[2] ?? 0;

    // Hora LOCAL
    const dt = new Date(y, (m - 1), d, hh, mm, ss, 0);
    return dt.getTime();
  }


  // Para páginas que ya tienen dateISO (YYYY-MM-DD) y un registro con "hora" o "tiempo"
  function msFromISOAndRecord(isoDate, rec) {
    if (!isoDate) return null;
    let h = rec?.hora || rec?.tiempo || '00:00';
    if (/^\d{1,2}:\d{2}$/.test(h)) h += ':00';
    const ms = new Date(`${isoDate}T${h}`).getTime();
    return isNaN(ms) ? null : ms;
  }

  function showAlert(mins) {
    if (alertShown) return;
    alertShown = true;

    let banner = document.getElementById('stale-alert');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'stale-alert';
      banner.style.cssText = [
        'position:fixed','left:0','right:0','bottom:0','z-index:2147483647',
        'padding:12px 16px','background:#ffd1d1','color:#8b0000',
        'border-top:2px solid #8b0000','font-weight:600','text-align:center','font-size: 150%;'
      ].join(';');

      const span = document.createElement('span');
      span.id = 'stale-alert-text';
      span.textContent = `Sin actualizaciones en los últimos ${thresholdMin} minutos.`;
      banner.appendChild(span);

      const btn = document.createElement('button');
      btn.textContent = 'Cerrar';
      btn.style.cssText = 'margin-left:12px;padding:4px 8px;font-weight:600';
      btn.onclick = () => { alertShown = false; banner.remove(); };
      banner.appendChild(btn);

      document.body.appendChild(banner);
    } else {
      const span = document.getElementById('stale-alert-text');
      if (span) span.textContent = `Sin actualizaciones en los últimos ${thresholdMin} minutos (≈${mins} min).`;
    }

    try { alert(`Aviso: No se han recibido actualizaciones en ${thresholdMin} minutos.`); } catch (_) {}
  }

  function clearAlert() {
    alertShown = false;
    const banner = document.getElementById('stale-alert');
    if (banner) banner.remove();
  }

  function scheduleAlarm(baseMs) {
    const now = Date.now();
    const base = Math.min(baseMs || now, now);
    const elapsed = now - base;
    const remaining = thresholdMin * 60000 - elapsed;

    if (timer) clearTimeout(timer);

    if (remaining <= 0) {
      const mins = Math.floor(elapsed / 60000);
      showAlert(mins);
      return;
    }

    timer = setTimeout(() => {
      const mins = Math.floor((Date.now() - base) / 60000);
      showAlert(mins);
    }, Math.max(remaining, 1000));
  }

  // API pública
  function staleInit(opts) {
    if (opts && typeof opts.thresholdMinutes === 'number') {
      thresholdMin = opts.thresholdMinutes;
    }
  }

  function staleMarkUpdate(msFromData) {
    const now = Date.now();
    const base = Math.min(msFromData || now, now);
    const isFresher = (lastBaseMs == null) || (msFromData != null && base > lastBaseMs);

    // Solo limpiamos si es un dato más reciente; si es igual/antiguo, no reiniciamos la alerta.
    if (isFresher) {
      clearAlert();
      lastBaseMs = base;
    }
    scheduleAlarm(base);
  }

  function staleForceAlert() {
    alertShown = false;
    showAlert(thresholdMin);
  }

  // Exponer en window
  window.staleInit = staleInit;
  window.staleMarkUpdate = staleMarkUpdate;
  window.staleForceAlert = staleForceAlert;
  window.staleMsFromFechaHora = msFromFechaHora;
  window.staleMsFromISOAndRecord = msFromISOAndRecord;
})();
