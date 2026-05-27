(function () {
  const WA_BASE = "https://wa.me/5493541571190";
  const BOOKING_URL =
    "https://www.booking.com/hotel/ar/cabanas-alpinas-terra-natura-bialet-masse.es.html";

  const form = document.getElementById("form-reserva");
  const unidad = document.getElementById("reserva-unidad");
  const checkIn = document.getElementById("reserva-in");
  const checkOut = document.getElementById("reserva-out");
  const personas = document.getElementById("reserva-personas");
  const canal = document.getElementById("reserva-canal");
  const nota = document.getElementById("reserva-nota");
  const nombre = document.getElementById("reserva-nombre");
  const resultado = document.getElementById("reserva-resultado");
  const acciones = document.getElementById("reserva-acciones");
  const estadoApi = document.getElementById("reserva-api-estado");

  if (!form || !unidad || !checkIn || !checkOut || !personas || !canal || !nota || !resultado || !acciones) {
    return;
  }

  let siteConfig = { apiBase: "", bookingUrl: BOOKING_URL, whatsapp: "5493541571190" };
  let motorConfig = null;
  let lastCotizacion = null;

  function ymd(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parse(s) {
    const p = s.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function add(d, n) {
    const x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  function fmt(n) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function apiBase() {
    const b = (siteConfig.apiBase || "").trim().replace(/\/$/, "");
    if (b) return b;
    if (location.protocol.startsWith("http") && !location.hostname.includes("github.io")) {
      return location.origin;
    }
    return "";
  }

  async function apiFetch(path, options) {
    const base = apiBase();
    if (!base) return null;
    const url = `${base}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", ...(options && options.headers) },
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      try {
        err.body = await res.json();
      } catch (_) {
        err.body = null;
      }
      throw err;
    }
    return res.json();
  }

  function setApiEstado(text, ok) {
    if (!estadoApi) return;
    estadoApi.hidden = false;
    estadoApi.textContent = text;
    estadoApi.className = ok ? "muted api-ok" : "muted api-off";
  }

  function temporadaFactor(inDate) {
    const m = inDate.getMonth() + 1;
    if (m === 1 || m === 2 || m === 7) return 1.22;
    if (m === 3 || m === 4 || m === 12) return 1.1;
    return 1;
  }

  function estimadoLocal(unitId, noches, inDate) {
    const base = {
      "alpina-1": 125000,
      "alpina-2": 125000,
      "alpina-3": 125000,
      "suite-4": 100000,
      "suite-5": 100000,
    };
    const b = base[unitId] || 110000;
    const total = Math.round(b * temporadaFactor(inDate) * noches);
    return { total, senia: Math.round(total * 0.5), origen: "estimado_local" };
  }

  async function cargarConfig() {
    try {
      const sc = await fetch("./assets/data/site-config.json");
      if (sc.ok) siteConfig = { ...siteConfig, ...(await sc.json()) };
    } catch (_) {}

    const base = apiBase();
    if (!base) {
      setApiEstado("Modo estimado — configurá apiBase en site-config.json para calendario PMS.", false);
      return;
    }

    try {
      motorConfig = await apiFetch("/api/public/motor-reserva");
      if (motorConfig && motorConfig.canales && motorConfig.canales.booking_url) {
        siteConfig.bookingUrl = motorConfig.canales.booking_url;
      }
      if (motorConfig && Array.isArray(motorConfig.unidades) && motorConfig.unidades.length) {
        unidad.innerHTML = "";
        motorConfig.unidades.forEach(function (u) {
          const opt = document.createElement("option");
          opt.value = u.id;
          opt.textContent = u.nombre || u.id;
          unidad.appendChild(opt);
        });
      }
      setApiEstado("Conectado al PMS — precios y disponibilidad alineados con Booking.", true);
    } catch (e) {
      setApiEstado("API no disponible — usando tarifa estimada local.", false);
    }
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  checkIn.min = ymd(hoy);
  checkOut.min = ymd(add(hoy, 1));
  checkIn.value = ymd(add(hoy, 14));
  checkOut.value = ymd(add(hoy, 17));

  checkIn.addEventListener("change", function () {
    const ci = parse(checkIn.value);
    if (Number.isNaN(ci.getTime())) return;
    const co = parse(checkOut.value);
    if (Number.isNaN(co.getTime()) || co <= ci) checkOut.value = ymd(add(ci, 2));
    checkOut.min = ymd(add(ci, 1));
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    acciones.innerHTML = "";
    lastCotizacion = null;

    const ci = parse(checkIn.value);
    const co = parse(checkOut.value);
    const noches = Math.round((co.getTime() - ci.getTime()) / 86400000);
    if (!Number.isFinite(noches) || noches <= 0) {
      resultado.hidden = false;
      resultado.className = "result err";
      resultado.textContent = "Revisá fechas: el check-out debe ser posterior al check-in.";
      return;
    }

    const unitId = unidad.value;
    const unitLabel = unidad.options[unidad.selectedIndex]?.textContent || unitId;
    const personasNum = Number(personas.value || 2);
    let total = 0;
    let senia = 0;
    let disponible = null;
    let fuente = "estimado_local";
    let reservaId = null;

    resultado.hidden = false;
    resultado.className = "result";
    resultado.textContent = "Consultando disponibilidad y tarifas…";

    const base = apiBase();
    if (base) {
      try {
        const data = await apiFetch("/api/cotizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unidad_id: unitId,
            check_in: checkIn.value,
            check_out: checkOut.value,
            promo: "ninguna",
            aplicar_precio_efectivo: false,
          }),
        });
        disponible = data.disponible;
        const cot = data.cotizacion || {};
        total = Number(cot.total) || 0;
        senia = Math.round(total * ((motorConfig && motorConfig.reglas && motorConfig.reglas.sena_pct) || 50) / 100);
        fuente = "pms";
        lastCotizacion = { total, senia, disponible, cot };
      } catch (err) {
        const loc = estimadoLocal(unitId, noches, ci);
        total = loc.total;
        senia = loc.senia;
        fuente = "estimado_local";
      }
    } else {
      const loc = estimadoLocal(unitId, noches, ci);
      total = loc.total;
      senia = loc.senia;
    }

    let html = "";
    if (disponible === false) {
      resultado.className = "result warn";
      html =
        `<strong>Sin disponibilidad</strong> en el calendario del complejo (incluye reservas Booking sincronizadas).<br>` +
        `Probá otras fechas o consultanos por WhatsApp.`;
    } else if (disponible === true) {
      resultado.className = "result ok";
      html =
        `<strong>Disponible</strong> · ${fmt(total)} por ${noches} noche(s).<br>` +
        `Seña (50%): <strong>${fmt(senia)}</strong>.`;
    } else {
      resultado.className = "result";
      html =
        `<strong>Estimado:</strong> ${fmt(total)} por ${noches} noche(s).<br>` +
        `Seña de referencia (50%): <strong>${fmt(senia)}</strong>.` +
        (fuente === "estimado_local" ? "<br><small>Conectá el servidor PMS para confirmar ocupación real.</small>" : "");
    }

    resultado.innerHTML = html;

    const msg =
      "Hola, quiero reservar en Terra Natura.\n\n" +
      `Unidad: ${unitLabel}\n` +
      `Fechas: ${checkIn.value} al ${checkOut.value}\n` +
      `Personas: ${personasNum}\n` +
      (nombre && nombre.value ? `Nombre: ${nombre.value}\n` : "") +
      `Canal: ${canal.value}\n` +
      (disponible === true ? "Disponibilidad PMS: sí\n" : disponible === false ? "Disponibilidad PMS: no\n" : "") +
      `Total ${fuente === "pms" ? "PMS" : "estimado"}: ${fmt(total)}\n` +
      `Seña referencia: ${fmt(senia)}\n` +
      (nota.value ? `Comentario: ${nota.value}\n` : "") +
      "\n¿Confirmamos seña y datos de ingreso?";

    const wa = document.createElement("a");
    wa.className = "btn btn-primary";
    wa.href = `${WA_BASE}?text=${encodeURIComponent(msg)}`;
    wa.target = "_blank";
    wa.rel = "noopener noreferrer";
    wa.textContent = "Enviar solicitud por WhatsApp";
    acciones.appendChild(wa);

    if (base && disponible === true && canal.value === "web_directa" && nombre && nombre.value.trim()) {
      const pre = document.createElement("button");
      pre.type = "button";
      pre.className = "btn btn-outline";
      pre.textContent = "Guardar pre-reserva en PMS";
      pre.addEventListener("click", async function () {
        pre.disabled = true;
        pre.textContent = "Guardando…";
        try {
          const r = await apiFetch("/api/reservas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              unidad_id: unitId,
              check_in: checkIn.value,
              check_out: checkOut.value,
              origen: "web_directa",
              huesped_nombre: nombre.value.trim(),
              personas: personasNum,
              estado: "pre_reserva",
              notas_internas: nota.value ? nota.value.slice(0, 500) : null,
            }),
          });
          reservaId = r.id;
          pre.textContent = `Pre-reserva ${r.id.slice(0, 8)}… creada`;
          resultado.innerHTML += `<br><small>ID reserva: ${r.id} — te contactamos para la seña.</small>`;
        } catch (err) {
          pre.disabled = false;
          pre.textContent = "No se pudo guardar (reintentar)";
          alert((err.body && err.body.detail) || err.message || "Error al crear reserva");
        }
      });
      acciones.appendChild(pre);
    }

    const booking = document.createElement("a");
    booking.className = "btn btn-outline";
    booking.href = siteConfig.bookingUrl || BOOKING_URL;
    booking.target = "_blank";
    booking.rel = "noopener noreferrer";
    booking.textContent = "Ver en Booking";
    acciones.appendChild(booking);
  });

  cargarConfig();
})();
