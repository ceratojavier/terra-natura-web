/**
 * Configurador Terra Natura — wizard paso a paso
 */
(function () {
  const API = "/api/setup";
  let estadoGlobal = null;
  let pasoActual = null;
  let indiceActual = 0;
  let pasosIds = [];

  const $ = (id) => document.getElementById(id);

  async function fetchJson(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || r.statusText);
    }
    return r.json();
  }

  function pillServidor(ok) {
    const el = $("estado-servidor");
    if (!el) return;
    el.textContent = ok ? "Servidor OK" : "Sin servidor";
    el.classList.toggle("modo-ok", ok);
  }

  async function health() {
    try {
      await fetchJson("/health");
      pillServidor(true);
      return true;
    } catch {
      pillServidor(false);
      return false;
    }
  }

  function renderProgreso(estado) {
    $("barra-progreso").style.width = `${estado.progreso_pct || 0}%`;
    $("texto-progreso").textContent =
      `${estado.progreso_pct || 0}% · ${estado.obligatorios_ok || 0}/${estado.obligatorios_total || 0} pasos obligatorios listos`;
    const mini = $("pasos-mini");
    mini.innerHTML = "";
    (estado.pasos || []).forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `config-paso-dot ${p.estado}${p.id === pasoActual ? " activo" : ""}`;
      b.title = `${p.titulo} — ${p.mensaje}`;
      b.setAttribute("aria-label", p.titulo);
      b.addEventListener("click", () => irAPaso(p.id));
      mini.appendChild(b);
    });
  }

  function renderAyuda(instrucciones) {
    const bloque = $("bloque-ayuda");
    const body = $("ayuda-body");
    if (!instrucciones || !instrucciones.length) {
      bloque.hidden = true;
      return;
    }
    bloque.hidden = false;
    body.innerHTML = instrucciones
      .map(
        (g) =>
          `<div class="config-ayuda-item"><strong>${escapeHtml(g.titulo)}</strong><span>${escapeHtml(g.texto)}</span></div>`
      )
      .join("");
    body.hidden = true;
    $("btn-toggle-ayuda").setAttribute("aria-expanded", "false");
  }

  $("btn-toggle-ayuda")?.addEventListener("click", () => {
    const body = $("ayuda-body");
    const open = body.hidden;
    body.hidden = !open;
    $("btn-toggle-ayuda").setAttribute("aria-expanded", open ? "true" : "false");
    $("btn-toggle-ayuda").textContent = open ? "¿Cómo consigo esto? ▴" : "¿Cómo consigo esto? ▾";
  });

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function leerValoresForm(container) {
    const valores = {};
    container.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.getAttribute("data-key");
      if (el.type === "checkbox") valores[key] = el.checked;
      else valores[key] = el.value;
    });
    return valores;
  }

  function newFeedId() {
    return `feed-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  function renderIcalFila(feed, unidades, plataformas) {
    const f = feed || {};
    const uid = f.unidad_id || "";
    const plat = f.plataforma || "booking";
    const url = f.url || "";
    const notas = f.notas || "";
    const fid = f.id || newFeedId();
    const optsU = (unidades || [])
      .map(
        (u) =>
          `<option value="${escapeHtml(u.id)}"${u.id === uid ? " selected" : ""}>${escapeHtml(u.nombre)}</option>`
      )
      .join("");
    const optsP = (plataformas || [])
      .map(
        (p) =>
          `<option value="${escapeHtml(p.id)}"${p.id === plat ? " selected" : ""}>${escapeHtml(p.nombre)}</option>`
      )
      .join("");
    return `<div class="config-ical-fila" data-feed-id="${escapeHtml(fid)}">
      <div class="config-ical-fila-top">
        <select data-ical-unidad class="config-ical-select" aria-label="Unidad">
          <option value="">— Unidad —</option>${optsU}
        </select>
        <select data-ical-plataforma class="config-ical-select" aria-label="Plataforma">${optsP}</select>
        <button type="button" class="btn-config btn-sec config-ical-quitar" title="Quitar enlace">✕</button>
      </div>
      <input type="url" class="config-ical-url" data-ical-url placeholder="https://ical.booking.com/… o enlace Airbnb" value="${escapeHtml(url)}" />
      <input type="text" class="config-ical-notas" data-ical-notas placeholder="Nota opcional (ej. nombre del anuncio en Booking)" value="${escapeHtml(notas)}" />
    </div>`;
  }

  function leerCanalesIcal(container) {
    const out = {
      modo_solo_reserva_directa: !!container.querySelector("#f-modo_solo_reserva_directa")?.checked,
      booking_habilitado: !!container.querySelector("#f-booking_habilitado")?.checked,
      airbnb_habilitado: !!container.querySelector("#f-airbnb_habilitado")?.checked,
      feeds_ical: [],
    };
    container.querySelectorAll(".config-ical-fila").forEach((row) => {
      const url = row.querySelector("[data-ical-url]")?.value?.trim();
      if (!url) return;
      out.feeds_ical.push({
        id: row.getAttribute("data-feed-id") || newFeedId(),
        unidad_id: row.querySelector("[data-ical-unidad]")?.value || "",
        plataforma: row.querySelector("[data-ical-plataforma]")?.value || "booking",
        url,
        notas: row.querySelector("[data-ical-notas]")?.value?.trim() || "",
      });
    });
    return out;
  }

  function badgeScraper(estado) {
    if (estado === "activo") return '<span class="config-fuente-badge activo">Automático</span>';
    if (estado === "personalizada") return '<span class="config-fuente-badge custom">Tuya</span>';
    return '<span class="config-fuente-badge ref">Referencia</span>';
  }

  function renderFuenteFila(f, habilitadas) {
    const on = habilitadas[f.id] !== false;
    const url = f.url
      ? `<a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" class="config-fuente-link">Abrir</a>`
      : "";
    const nota = f.nota || f.archivo ? `<span class="config-fuente-meta">${escapeHtml(f.archivo || f.nota || "")}</span>` : "";
    return `<label class="config-fuente-fila">
      <input type="checkbox" data-fuente-id="${escapeHtml(f.id)}" ${on ? "checked" : ""} />
      <span class="config-fuente-body">
        <span class="config-fuente-nombre">${escapeHtml(f.nombre)} ${badgeScraper(f.estado_scraper)}</span>
        ${nota}
        ${url}
      </span>
    </label>`;
  }

  function renderFuenteCustom(c, idx) {
    return `<div class="config-fuente-custom" data-custom-idx="${idx}">
      <div class="config-ical-fila-top">
        <input type="text" data-custom-nombre placeholder="Nombre (ej. Agenda La Falda)" value="${escapeHtml(c.nombre || "")}" />
        <button type="button" class="btn-config btn-sec config-custom-quitar">✕</button>
      </div>
      <input type="url" data-custom-url placeholder="https://…" value="${escapeHtml(c.url || "")}" />
      <input type="text" data-custom-notas placeholder="Notas (opcional)" value="${escapeHtml(c.notas || "")}" />
    </div>`;
  }

  function leerFuentesEventos(container) {
    const habilitadas = {};
    container.querySelectorAll("[data-fuente-id]").forEach((el) => {
      habilitadas[el.getAttribute("data-fuente-id")] = el.checked;
    });
    const fuentes_personalizadas = [];
    container.querySelectorAll(".config-fuente-custom").forEach((row, i) => {
      const url = row.querySelector("[data-custom-url]")?.value?.trim();
      const nombre = row.querySelector("[data-custom-nombre]")?.value?.trim();
      if (!url && !nombre) return;
      fuentes_personalizadas.push({
        id: `custom-${i + 1}`,
        nombre: nombre || "Fuente personalizada",
        url: url || "",
        habilitada: true,
        notas: row.querySelector("[data-custom-notas]")?.value?.trim() || "",
        categoria: "otro",
      });
    });
    return { habilitadas, fuentes_personalizadas };
  }

  function bindFuentesEventos(cont) {
    cont.querySelector("#btn-add-fuente")?.addEventListener("click", () => {
      const lista = cont.querySelector("#fuentes-custom-lista");
      const n = lista.querySelectorAll(".config-fuente-custom").length;
      lista.insertAdjacentHTML("beforeend", renderFuenteCustom({}, n));
    });
    cont.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".config-custom-quitar");
      if (btn) btn.closest(".config-fuente-custom")?.remove();
    });
  }

  function bindIcalCanales(cont, unidades, plataformas) {
    const lista = cont.querySelector("#ical-lista");
    cont.querySelector("#btn-add-ical")?.addEventListener("click", () => {
      lista.insertAdjacentHTML("beforeend", renderIcalFila({ plataforma: "booking" }, unidades, plataformas));
    });
    lista?.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".config-ical-quitar");
      if (!btn) return;
      btn.closest(".config-ical-fila")?.remove();
    });
  }

  function renderCampo(c, valores) {
    const v = valores[c.key];
    if (c.tipo === "checkbox") {
      const checked = v !== undefined ? v : c.default === true;
      return `<div class="config-check">
        <input type="checkbox" id="f-${c.key}" data-key="${c.key}" ${checked ? "checked" : ""} />
        <label for="f-${c.key}">${escapeHtml(c.label)}</label>
      </div>`;
    }
    const val = v !== undefined && v !== null ? escapeHtml(String(v)) : "";
    const ph = c.placeholder ? ` placeholder="${escapeHtml(c.placeholder)}"` : "";
    const def = c.default && !val ? ` value="${escapeHtml(c.default)}"` : val ? ` value="${val}"` : "";
    if (c.tipo === "textarea") {
      return `<div class="config-campo">
        <label for="f-${c.key}">${escapeHtml(c.label)}</label>
        <textarea id="f-${c.key}" data-key="${c.key}"${ph}>${val}</textarea>
      </div>`;
    }
    const type = c.tipo === "tel" ? "tel" : c.tipo || "text";
    return `<div class="config-campo">
      <label for="f-${c.key}">${escapeHtml(c.label)}</label>
      <input type="${type}" id="f-${c.key}" data-key="${c.key}"${def}${ph} />
    </div>`;
  }

  async function renderPaso(data) {
    const {
      paso,
      valores,
      check,
      instrucciones,
      indice,
      total,
      adjuntos,
      vista_coeficientes,
      inventario_fotos,
      unidades_ical,
      plataformas_ical,
      catalogo_fuentes_eventos,
    } = data;
    pasoActual = paso.id;
    indiceActual = indice;
    pasosIds = estadoGlobal?.pasos?.map((p) => p.id) || [];

    $("paso-num").textContent = `Paso ${indice + 1} de ${total}`;
    $("paso-titulo").textContent = paso.titulo;
    $("paso-subtitulo").textContent = paso.subtitulo || "";
    const pill = $("paso-estado-pill");
    pill.hidden = false;
    pill.textContent = check.mensaje || "";
    pill.className = `config-estado-pill ${check.estado || "pendiente"}`;

    renderAyuda(instrucciones);
    const cont = $("paso-contenido");
    const btnAdj = $("btn-adjuntar");
    const btnSaltar = $("btn-saltar");
    btnAdj.hidden = true;
    btnSaltar.hidden = !!paso.obligatorio;

    if (paso.tipo === "info") {
      cont.innerHTML = `<div class="config-info">
        <p>Este configurador guarda todo en tu PC (<code>local/config-dueño.json</code>). No se sube a internet.</p>
        <p>Vas a completar, en orden:</p>
        <ul>
          <li>Datos del complejo y WhatsApp</li>
          <li>Objetivos y voz de marca</li>
          <li>Instagram, fotos y herramientas (ffmpeg)</li>
          <li>Canales Booking / directo y agenda de eventos</li>
        </ul>
        <p>Cuando termines, el <strong>programa</strong> y los <strong>agentes</strong> usan lo que cargaste acá.</p>
      </div>`;
    } else if (paso.tipo === "form" && paso.campos) {
      cont.innerHTML = paso.campos.map((c) => renderCampo(c, valores || {})).join("");
      if (paso.id === "precios") {
        const filas = vista_coeficientes || [];
        const rows = filas
          .map(
            (f) =>
              `<tr><td>${escapeHtml(f.etiqueta)}</td><td>${f.coeficiente_pct}%</td><td>$${Number(f.precio_alpina_ejemplo).toLocaleString("es-AR")}</td><td style="font-size:0.8rem;color:var(--muted)">${escapeHtml(f.tramo)}</td></tr>`
          )
          .join("");
        const box = document.createElement("div");
        box.className = "config-inflacion-auto";
        box.innerHTML = `<div class="config-info" style="margin-bottom:1rem">
          <p><strong>Coeficiente variable</strong> (no es un solo % anual): el sistema lo recalcula por fecha.</p>
          <table class="config-tabla-coef" style="width:100%;font-size:0.85rem;margin:0.5rem 0">
            <thead><tr><th>Período</th><th>Coef.</th><th>Alpina ej.</th><th>Tramo REM</th></tr></thead>
            <tbody>${rows || "<tr><td colspan='4'>Cargá base verano para ver ejemplos</td></tr>"}</tbody>
          </table>
          <button type="button" class="btn-config btn-sec" id="btn-refresh-inflacion">Actualizar serie REM</button>
        </div>`;
        cont.prepend(box);
        $("btn-refresh-inflacion")?.addEventListener("click", async () => {
          try {
            await fetchJson(`${API}/inflacion-proyeccion/actualizar`, { method: "POST" });
            await cargarPaso("precios");
          } catch (e) {
            alert("No se pudo actualizar: " + e.message);
          }
        });
      }
      if (paso.id === "instagram" && !valores?.bio_borrador) {
        const ta = cont.querySelector('[data-key="bio_borrador"]');
        if (ta && !ta.value) {
          ta.value =
            "Cabañas Alpinas Terra Natura\nEscapada a las sierras · Bialet Massé\nParejas (ideal) · Familia · 5 unidades\n600 m lago San Roque · pileta\nReservá directo 👇 WhatsApp";
        }
      }
    } else if (paso.tipo === "ical_canales") {
      const v = valores || {};
      const feeds = v.feeds_ical || [];
      const filas = feeds.length
        ? feeds.map((f) => renderIcalFila(f, unidades_ical, plataformas_ical)).join("")
        : renderIcalFila({ plataforma: "booking" }, unidades_ical, plataformas_ical);
      const solo = v.modo_solo_reserva_directa === true;
      const book = v.booking_habilitado !== false;
      const air = v.airbnb_habilitado === true;
      cont.innerHTML = `<div class="config-info" style="margin-bottom:1rem">
        <p>En Booking tenés <strong>varios anuncios</strong> (una por cabaña). Pegá el enlace <strong>export iCal</strong> de cada uno y elegí la unidad.</p>
      </div>
      <div class="config-check">
        <input type="checkbox" id="f-modo_solo_reserva_directa" data-key="modo_solo_reserva_directa" ${solo ? "checked" : ""} />
        <label for="f-modo_solo_reserva_directa">Priorizar solo reserva directa (pausar OTAs en copy)</label>
      </div>
      <div class="config-check">
        <input type="checkbox" id="f-booking_habilitado" data-key="booking_habilitado" ${book ? "checked" : ""} />
        <label for="f-booking_habilitado">Booking activo</label>
      </div>
      <div class="config-check">
        <input type="checkbox" id="f-airbnb_habilitado" data-key="airbnb_habilitado" ${air ? "checked" : ""} />
        <label for="f-airbnb_habilitado">Airbnb activo</label>
      </div>
      <h3 class="config-ical-titulo">Enlaces iCal (importar ocupación)</h3>
      <div id="ical-lista" class="config-ical-lista">${filas}</div>
      <button type="button" class="btn-config btn-sec" id="btn-add-ical" style="margin-top:0.75rem">+ Agregar enlace iCal</button>`;
      bindIcalCanales(cont, unidades_ical, plataformas_ical);
    } else if (paso.tipo === "upload") {
      btnAdj.hidden = false;
      const lista = (adjuntos || []).map((a) => `<li>${escapeHtml(a)}</li>`).join("");
      let invHtml = "";
      if (paso.id === "fotos" && inventario_fotos) {
        const inv = inventario_fotos;
        const filas = Object.entries(inv.por_carpeta || {})
          .filter(([, n]) => n > 0)
          .map(([nombre, n]) => `<li>${escapeHtml(nombre)} — ${n}</li>`)
          .join("");
        invHtml = `<div class="config-info" style="margin-bottom:1rem">
          <p><strong>${inv.en_carpetas || 0}</strong> fotos/videos en <strong>${(inv.carpetas || []).length}</strong> carpetas
          ${inv.en_raiz ? ` · ${inv.en_raiz} archivo(s) sueltos en la raíz (capturas, etc.)` : ""}</p>
          ${filas ? `<p style="font-size:0.85rem;margin:0.5rem 0">Por carpeta:</p><ul style="font-size:0.85rem;max-height:10rem;overflow:auto">${filas}</ul>` : ""}
          <p style="font-size:0.85rem;color:var(--muted)">No hace falta volver a subir lo que ya está en subcarpetas.</p>
        </div>`;
      }
      cont.innerHTML = `${invHtml}<div class="config-info">
        <p>Opcional: subí más desde «Adjuntar», o copiá a:</p>
        <p><code>archivos multimedia/fotos terra natura/</code></p>
      </div>
      <div class="config-adjuntos" id="lista-adjuntos">
        ${lista ? `<p>Archivos subidos en este paso:</p><ul>${lista}</ul>` : "<p>No subiste archivos extra en este paso (las carpetas alcanzan).</p>"}
      </div>`;
    } else if (paso.tipo === "checklist_auto") {
      const h = await fetchJson(`${API}/herramientas`);
      const items = [
        ["python", "Python"],
        ["ffmpeg", "ffmpeg (videos)"],
        ["yt_dlp", "yt-dlp (YouTube)"],
        ["musica_fondo", "Música de fondo (MP3)"],
      ];
      cont.innerHTML = `<ul class="config-checklist">${items
        .map(([k, label]) => {
          const ok = h[k];
          return `<li class="${ok ? "ok" : "no"}">${escapeHtml(label)}</li>`;
        })
        .join("")}</ul>
        <p class="config-info">Si falta algo, abrí «¿Cómo consigo esto?» arriba.</p>`;
    } else if (paso.tipo === "fuentes_eventos") {
      const cat = catalogo_fuentes_eventos || {};
      const v = cat.valores || valores || {};
      const hab = v.habilitadas || {};
      const grupos = (cat.grupos || []).map((g) => {
        const filas = (g.fuentes || []).map((f) => renderFuenteFila(f, hab)).join("");
        return `<fieldset class="config-fuente-grupo"><legend>${escapeHtml(g.titulo)}</legend>${filas}</fieldset>`;
      }).join("");
      const custom = (v.fuentes_personalizadas || [])
        .map((c, i) => renderFuenteCustom(c, i))
        .join("");
      cont.innerHTML = `<div class="config-info" style="margin-bottom:1rem">
        <p><strong>Automático</strong> = el sistema trae datos al sincronizar.
        <strong>Referencia</strong> = link para revisar vos (running, Kempes web, diarios…).
        Los de Bialet y Punilla también están en el calendario importante y fiestas recurrentes.</p>
      </div>
      <div class="config-fuentes-catalogo">${grupos}</div>
      <h3 class="config-ical-titulo">Tus fuentes extra</h3>
      <div id="fuentes-custom-lista" class="config-fuentes-custom">${custom}</div>
      <button type="button" class="btn-config btn-sec" id="btn-add-fuente" style="margin:0.5rem 0 1rem">+ Agregar fuente (URL)</button>
      <button type="button" class="btn-config btn-prim config-accion-btn" id="btn-sync-agenda">
        Sincronizar agenda ahora
      </button>
      <p class="config-msg-ok" id="sync-msg" hidden></p>`;
      bindFuentesEventos(cont);
      $("btn-sync-agenda")?.addEventListener("click", async () => {
        const msg = $("sync-msg");
        msg.hidden = false;
        msg.className = "config-msg-ok";
        msg.textContent = "Sincronizando…";
        try {
          await fetchJson(`${API}/paso/eventos`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ valores: leerFuentesEventos(cont), marcar_completo: true }),
          });
          const res = await fetchJson(`${API}/sincronizar-agenda`, { method: "POST" });
          msg.textContent = res.mensaje || `Listo — ${res.total || 0} eventos.`;
          await cargarEstado();
          await cargarPaso("eventos");
        } catch (e) {
          msg.className = "config-msg-err";
          msg.textContent = e.message;
        }
      });
    } else if (paso.tipo === "accion") {
      cont.innerHTML = `<div class="config-info"><p>Acción pendiente de configurar.</p></div>`;
    } else if (paso.tipo === "resumen") {
      const filas = (estadoGlobal?.pasos || [])
        .filter((p) => p.id !== "resumen")
        .map(
          (p) =>
            `<div class="config-resumen-fila"><span>${escapeHtml(p.titulo)}</span><span class="config-estado-pill ${p.estado}">${escapeHtml(p.estado)}</span></div>`
        )
        .join("");
      cont.innerHTML = `<div class="config-resumen-grid">${filas}</div>
        <p class="config-info" style="margin-top:1rem">Config guardado en: <code>${escapeHtml(estadoGlobal?.ruta_config || "local/config-dueño.json")}</code></p>
        <p><a href="/programa" class="btn-config btn-prim" style="display:inline-block;text-decoration:none;margin-top:0.5rem">Abrir programa</a></p>`;
    }

    $("btn-atras").disabled = indice <= 0;
    $("btn-siguiente").textContent = indice >= total - 1 ? "Finalizar" : "Siguiente";
    btnSaltar.hidden = !!paso.obligatorio;
  }

  async function cargarPaso(stepId) {
    const data = await fetchJson(`${API}/paso/${stepId}`);
    await renderPaso(data);
  }

  async function guardarActual() {
    if (!pasoActual) return;
    const cont = $("paso-contenido");
    const pasoDef = estadoGlobal?.pasos?.find((p) => p.id === pasoActual);
    const tipo = pasoDef ? await fetchJson(`${API}/paso/${pasoActual}`).then((d) => d.paso.tipo) : "form";

    if (tipo === "form" || tipo === "upload" || tipo === "ical_canales" || tipo === "fuentes_eventos") {
      const valores =
        tipo === "ical_canales"
          ? leerCanalesIcal(cont)
          : tipo === "fuentes_eventos"
            ? leerFuentesEventos(cont)
            : tipo === "form"
              ? leerValoresForm(cont)
              : {};
      await fetchJson(`${API}/paso/${pasoActual}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valores, marcar_completo: true }),
      });
    } else if (tipo === "checklist_auto" || tipo === "info" || tipo === "accion") {
      await fetchJson(`${API}/paso/${pasoActual}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valores: { revisado: true }, marcar_completo: true }),
      });
    }
    await cargarEstado();
  }

  async function cargarEstado() {
    estadoGlobal = await fetchJson(`${API}/estado`);
    renderProgreso(estadoGlobal);
    return estadoGlobal;
  }

  function siguienteId() {
    const ids = estadoGlobal.pasos.map((p) => p.id);
    const i = ids.indexOf(pasoActual);
    return i < ids.length - 1 ? ids[i + 1] : null;
  }

  function anteriorId() {
    const ids = estadoGlobal.pasos.map((p) => p.id);
    const i = ids.indexOf(pasoActual);
    return i > 0 ? ids[i - 1] : null;
  }

  async function irAPaso(stepId) {
    try {
      if (pasoActual) await guardarActual();
    } catch (e) {
      console.warn("Guardar al cambiar paso:", e);
    }
    await cargarPaso(stepId);
    estadoGlobal.pasos.forEach((p) => {
      if (p.id === stepId) pasoActual = stepId;
    });
    renderProgreso(estadoGlobal);
  }

  $("btn-siguiente")?.addEventListener("click", async () => {
    try {
      await guardarActual();
      const next = siguienteId();
      if (next) await irAPaso(next);
      else await cargarPaso("resumen");
    } catch (e) {
      alert("No se pudo guardar: " + e.message);
    }
  });

  $("btn-atras")?.addEventListener("click", async () => {
    const prev = anteriorId();
    if (prev) await irAPaso(prev);
  });

  $("btn-saltar")?.addEventListener("click", async () => {
    const next = siguienteId();
    if (next) await irAPaso(next);
  });

  $("btn-adjuntar")?.addEventListener("click", () => $("input-adjunto").click());

  $("input-adjunto")?.addEventListener("change", async (ev) => {
    const files = ev.target.files;
    if (!files?.length || !pasoActual) return;
    for (const file of files) {
      const fd = new FormData();
      fd.append("archivo", file);
      await fetch(`${API}/paso/${pasoActual}/adjunto`, { method: "POST", body: fd });
    }
    ev.target.value = "";
    await cargarPaso(pasoActual);
    await cargarEstado();
  });

  async function init() {
    const ok = await health();
    if (!ok) {
      $("texto-progreso").textContent = "Iniciá el servidor (icono Terra Natura o local/Abrir-Terra-Natura.bat)";
    }
    await cargarEstado();
    const start = estadoGlobal.paso_actual || "intro";
    await cargarPaso(start);
  }

  init();
})();
