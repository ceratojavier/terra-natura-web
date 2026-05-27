(function () {
  const WA_BASE = "https://wa.me/5493541571190";

  const form = document.getElementById("form-reserva");
  const unidad = document.getElementById("reserva-unidad");
  const checkIn = document.getElementById("reserva-in");
  const checkOut = document.getElementById("reserva-out");
  const personas = document.getElementById("reserva-personas");
  const nota = document.getElementById("reserva-nota");
  const nombre = document.getElementById("reserva-nombre");
  const resultado = document.getElementById("reserva-resultado");
  const acciones = document.getElementById("reserva-acciones");
  const estadoApi = document.getElementById("reserva-api-estado");

  if (!form || !unidad || !checkIn || !checkOut || !personas || !nota || !resultado || !acciones) {
    return;
  }

  let siteConfig = { apiBase: "" };
  let apiDisponible = false;

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
    const res = await fetch(`${base}${path}`, {
      ...options,
      headers: { Accept: "application/json", ...(options && options.headers) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function setApiEstado(text, ok) {
    if (!estadoApi) return;
    estadoApi.hidden = false;
    estadoApi.textContent = text;
    estadoApi.className = ok ? "muted api-ok" : "muted api-off";
  }

  async function cargarConfig() {
    try {
      const sc = await fetch("./assets/data/site-config.json");
      if (sc.ok) siteConfig = { ...siteConfig, ...(await sc.json()) };
    } catch (_) {}

    if (!apiBase()) {
      setApiEstado("Consulta directa por WhatsApp.", false);
      return;
    }

    try {
      const motor = await apiFetch("/api/public/motor-reserva");
      apiDisponible = true;
      if (motor && Array.isArray(motor.unidades) && motor.unidades.length) {
        unidad.innerHTML = "";
        motor.unidades.forEach(function (u) {
          const opt = document.createElement("option");
          opt.value = u.id;
          opt.textContent = u.nombre || u.id;
          unidad.appendChild(opt);
        });
      }
      setApiEstado("Calendario del complejo sincronizado.", true);
    } catch (_) {
      setApiEstado("Consulta directa por WhatsApp.", false);
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

    const ci = parse(checkIn.value);
    const co = parse(checkOut.value);
    const noches = Math.round((co.getTime() - ci.getTime()) / 86400000);
    if (!Number.isFinite(noches) || noches <= 0) {
      resultado.hidden = false;
      resultado.className = "result err";
      resultado.textContent = "Revisá fechas: el check-out debe ser posterior al check-in.";
      return;
    }

    const unitLabel = unidad.options[unidad.selectedIndex]?.textContent || unidad.value;
    const personasNum = Number(personas.value || 2);
    let disponible = null;

    resultado.hidden = false;
    resultado.className = "result";
    resultado.textContent = "Consultando disponibilidad…";

    if (apiDisponible) {
      try {
        const data = await apiFetch("/api/cotizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            unidad_id: unidad.value,
            check_in: checkIn.value,
            check_out: checkOut.value,
            promo: "ninguna",
            aplicar_precio_efectivo: false,
          }),
        });
        disponible = data.disponible;
      } catch (_) {
        disponible = null;
      }
    }

    if (disponible === false) {
      resultado.className = "result warn";
      resultado.innerHTML = "<strong>En esas fechas no vemos lugar por ahora.</strong><br>Escribinos y te ofrecemos alternativas cercanas.";
    } else if (disponible === true) {
      resultado.className = "result ok";
      resultado.innerHTML = "<strong>Excelente, tenemos disponibilidad.</strong><br>Te respondemos por WhatsApp con una propuesta cordial.";
    } else {
      resultado.className = "result";
      resultado.innerHTML = "<strong>Recibimos tu consulta.</strong><br>Te respondemos por WhatsApp con disponibilidad y propuesta directa.";
    }

    const msg =
      "Hola Terra Natura, quiero consultar estadía.\n\n" +
      `Unidad: ${unitLabel}\n` +
      `Fechas: ${checkIn.value} al ${checkOut.value}\n` +
      `Noches: ${noches}\n` +
      `Personas: ${personasNum}\n` +
      (nombre && nombre.value ? `Nombre: ${nombre.value}\n` : "") +
      (nota.value ? `Comentario: ${nota.value}\n` : "") +
      (disponible === true ? "Disponibilidad en calendario: sí\n" : disponible === false ? "Disponibilidad en calendario: no\n" : "") +
      "\nQuisiera recibir propuesta directa desde la cabaña.";

    const wa = document.createElement("a");
    wa.className = "btn btn-primary";
    wa.href = `${WA_BASE}?text=${encodeURIComponent(msg)}`;
    wa.target = "_blank";
    wa.rel = "noopener noreferrer";
    wa.textContent = "Hablar por WhatsApp";
    acciones.appendChild(wa);

    if (apiDisponible && disponible === true && nombre && nombre.value.trim()) {
      const pre = document.createElement("button");
      pre.type = "button";
      pre.className = "btn btn-outline";
      pre.textContent = "Guardar consulta";
      pre.addEventListener("click", async function () {
        pre.disabled = true;
        pre.textContent = "Guardando…";
        try {
          await apiFetch("/api/reservas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              unidad_id: unidad.value,
              check_in: checkIn.value,
              check_out: checkOut.value,
              origen: "web_directa",
              huesped_nombre: nombre.value.trim(),
              personas: personasNum,
              estado: "pre_reserva",
              notas_internas: nota.value ? nota.value.slice(0, 500) : null,
            }),
          });
          pre.textContent = "Consulta guardada";
          resultado.innerHTML += "<br><small>Ya registramos tu consulta y te escribimos enseguida.</small>";
        } catch (_) {
          pre.disabled = false;
          pre.textContent = "Reintentar guardado";
        }
      });
      acciones.appendChild(pre);
    }
  });

  cargarConfig();
})();
