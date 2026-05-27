(function () {
  var logPanel = document.getElementById("log-panel");
  var logTexto = document.getElementById("log-texto");
  var inputDesde = document.getElementById("input-desde");
  var inputHasta = document.getElementById("input-hasta");

  function log(msg) {
    if (!logTexto) return;
    logPanel.hidden = false;
    var t = new Date().toLocaleTimeString("es-AR");
    logTexto.textContent += "[" + t + "] " + msg + "\n";
    logTexto.scrollTop = logTexto.scrollHeight;
  }

  function isoHoy() {
    return new Date().toISOString().slice(0, 10);
  }

  function isoHastaMarzoSiguiente() {
    var h = new Date();
    var y = h.getMonth() >= 3 ? h.getFullYear() + 1 : h.getFullYear();
    return y + "-03-31";
  }

  function initFechas() {
    if (inputDesde && !inputDesde.value) inputDesde.value = isoHoy();
    if (inputHasta && !inputHasta.value) inputHasta.value = isoHastaMarzoSiguiente();
  }

  function queryRango() {
    var q = "?solo_confirmados=true";
    if (inputDesde && inputDesde.value) q += "&desde=" + encodeURIComponent(inputDesde.value);
    if (inputHasta && inputHasta.value) q += "&hasta=" + encodeURIComponent(inputHasta.value);
    return q;
  }

  function bodyRango() {
    return {
      desde: inputDesde && inputDesde.value ? inputDesde.value : null,
      hasta: inputHasta && inputHasta.value ? inputHasta.value : null,
      guardar_en_calendario: true,
    };
  }

  function setBusy(btn, busy, labelBusy) {
    if (!btn) return;
    if (busy) {
      btn.dataset.labelOrig = btn.textContent.trim();
      btn.disabled = true;
      var small = btn.querySelector("small");
      if (small) small.textContent = labelBusy || "Procesando…";
    } else {
      btn.disabled = false;
      var sm = btn.querySelector("small");
      if (sm && btn.id === "btn-recolectar-yt") sm.textContent = "Biblioteca B-roll Punilla / Bialet";
      if (sm && btn.id === "btn-calendario-editorial") sm.textContent = "Posts para todo el rango elegido";
      if (sm && btn.id === "btn-videos-editorial") sm.textContent = "Hasta 5 reels (YouTube + fotos)";
    }
  }

  function cargarEstado() {
    var pill = document.getElementById("estado-servidor");
    fetch("/api/programa/estado")
      .then(function (r) {
        if (!r.ok) throw new Error("sin servidor");
        return r.json();
      })
      .then(function (d) {
        if (pill) {
          pill.textContent = "Programa activo";
          pill.style.background = "rgba(80, 160, 100, 0.25)";
        }
        document.getElementById("stat-yt").textContent = d.youtube_biblioteca;
        document.getElementById("stat-cal").textContent = d.calendario.total;
        document.getElementById("stat-pend").textContent = d.calendario.pendientes;
        var hr = document.getElementById("herramientas-row");
        if (hr && d.herramientas) {
          hr.innerHTML = "";
          var labels = { python: "Python", ffmpeg: "ffmpeg", yt_dlp: "yt-dlp" };
          Object.keys(labels).forEach(function (k) {
            var span = document.createElement("span");
            span.className = d.herramientas[k] ? "tool-ok" : "tool-falta";
            span.textContent = labels[k] + (d.herramientas[k] ? " ✓" : " — falta");
            hr.appendChild(span);
          });
        }
      })
      .catch(function () {
        if (pill) {
          pill.textContent = "Servidor apagado";
          pill.style.background = "rgba(200, 80, 80, 0.3)";
        }
        log("No hay conexión. Abrí de nuevo el icono «Terra Natura» del escritorio.");
      });
  }

  var TIPO_LABEL = {
    feriado_nacional: "Feriado",
    finde_largo: "Finde largo",
    vacaciones_invierno: "Vacaciones invierno",
    promo_invierno: "Promo invierno",
    dia_especial: "Día especial",
    evento_masivo: "Evento masivo",
    evento_local: "Bialet",
    evento_grilla: "Grilla turismo",
    evento_grilla_recurrente: "Grilla (mes)",
    evento_agenda: "Evento",
    evento_confirmado: "Confirmado",
    referencia: "A confirmar",
  };

  var MESES = [
    "",
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  var DIAS_SEM = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  function fmtDDMMYYYY(iso) {
    if (!iso || String(iso).length < 10) return iso || "";
    var p = String(iso).slice(0, 10).split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function parseIsoLocal(iso) {
    var p = String(iso).slice(0, 10).split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  function toIsoLocal(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function rangoTexto(it) {
    var fi = it.fecha_inicio || it.fecha;
    var ff = it.fecha_fin;
    if (!fi) return "";
    if (!ff || ff === fi) return fmtDDMMYYYY(fi);
    return fmtDDMMYYYY(fi) + " – " + fmtDDMMYYYY(ff);
  }

  var agendaPorDia = {};
  var celdaSeleccionada = null;

  function vaEnCeldaCalendario(it) {
    if (it.solo_listado || it.mostrar_en_calendario === false) return false;
    if (it.tipo === "referencia") return false;
    var a = it.fecha_inicio || it.fecha;
    if (!a) return false;
    var b = it.fecha_fin || a;
    var d0 = parseIsoLocal(a);
    var d1 = parseIsoLocal(b);
    var dias = Math.round((d1 - d0) / 86400000) + 1;
    if (dias > 21 && it.tipo !== "finde_largo" && it.tipo !== "vacaciones_invierno") return false;
    return true;
  }

  function indicePorDia(items) {
    var map = {};
    (items || []).forEach(function (it) {
      if (!vaEnCeldaCalendario(it)) return;
      var a = it.fecha_inicio || it.fecha;
      if (!a) return;
      var b = it.fecha_fin || a;
      var cur = parseIsoLocal(a);
      var end = parseIsoLocal(b);
      while (cur <= end) {
        var key = toIsoLocal(cur);
        if (!map[key]) map[key] = [];
        var ya = map[key].some(function (x) {
          return x.nombre === it.nombre && x.tipo === it.tipo && x.fecha_inicio === it.fecha_inicio;
        });
        if (!ya) map[key].push(it);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }

  function mapaDiasPuente(items) {
    var map = {};
    (items || []).forEach(function (it) {
      if (it.tipo !== "finde_largo") return;
      var a = it.fecha_inicio || it.fecha;
      if (!a) return;
      var b = it.fecha_fin || a;
      var cur = parseIsoLocal(a);
      var end = parseIsoLocal(b);
      var keys = [];
      while (cur <= end) {
        keys.push(toIsoLocal(cur));
        cur.setDate(cur.getDate() + 1);
      }
      keys.forEach(function (key, idx) {
        map[key] = {
          puente: it,
          pos: idx === 0 ? "inicio" : idx === keys.length - 1 ? "fin" : "medio",
          total: keys.length,
        };
      });
    });
    return map;
  }

  function escHtml(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function detalleEventoHtml(ev) {
    var tipo = ev.tipo || "evento";
    var h = '<div class="cal-detalle-bloque tipo-' + escHtml(tipo) + '">';
    h += '<span class="pill-confirmado">✓ Fecha confirmada</span>';
    h += '<span class="detalle-etiqueta">' + escHtml(TIPO_LABEL[tipo] || tipo) + "</span>";
    h += "<h4>" + escHtml(ev.nombre || "Sin nombre") + "</h4>";
    h += "<p><strong>Fechas:</strong> " + escHtml(rangoTexto(ev)) + "</p>";
    if (ev.localidad) h += "<p><strong>Lugar:</strong> " + escHtml(ev.localidad) + "</p>";
    if (ev.descripcion) h += "<p>" + escHtml(ev.descripcion) + "</p>";
    if (ev.angulo_comercial)
      h +=
        '<p class="angulo-venta"><strong>Por qué reservar en Terra Natura:</strong> ' +
        escHtml(ev.angulo_comercial) +
        "</p>";
    if (ev.copy_hook) h += "<p><strong>Campaña:</strong> " + escHtml(ev.copy_hook) + "</p>";
    if (ev.estado) h += "<p><em>Estado: " + escHtml(ev.estado) + "</em></p>";
    if (ev.fuente) h += "<p style='font-size:0.8rem;opacity:0.85'>Fuente: " + escHtml(ev.fuente) + "</p>";

    if (tipo === "finde_largo") {
      h += "<p><strong>Finde largo — " + (ev.cantidad_dias || "?") + " días</strong>";
      if (ev.dias_texto) h += " (" + escHtml(ev.dias_texto) + ")";
      h += "</p>";
      if (ev.cantidad_noches)
        h += "<p><strong>Noches sugeridas para reservar:</strong> " + ev.cantidad_noches + "</p>";
      if (ev.dias_calendario && ev.dias_calendario.length) {
        h += "<p><strong>Días del puente:</strong> ";
        h += ev.dias_calendario
          .map(function (d) {
            return fmtDDMMYYYY(d.fecha) + " (" + d.dia_semana + ")";
          })
          .join(" · ");
        h += "</p>";
      }
      if (ev.audiencias_origen && ev.audiencias_origen.length) {
        h += "<p><strong>¿Quién puede venir y desde cuándo?</strong></p>";
        ev.audiencias_origen.forEach(function (a) {
          h += '<div class="cal-detalle-audiencia">';
          h += "<strong>" + escHtml(a.origen) + "</strong><br>";
          h += escHtml(a.salida_desde_trabajo || "") + "<br>";
          h += "Check-in sugerido: <strong>" + escHtml(a.check_in_sugerido) + "</strong> · ";
          h += escHtml(a.noches_recomendadas) + " noches<br>";
          h += "<em>" + escHtml(a.copy_segmento || "") + "</em>";
          h += "</div>";
        });
      }
    }
    h += "</div>";
    return h;
  }

  function abrirDetalleDia(iso, evs) {
    var modal = document.getElementById("cal-dia-modal");
    var titulo = document.getElementById("cal-dia-modal-titulo");
    var cuerpo = document.getElementById("cal-dia-modal-cuerpo");
    if (!modal || !titulo || !cuerpo) return;

    var d = parseIsoLocal(iso);
    var diaNom = DIAS_SEM[(d.getDay() + 6) % 7];
    titulo.textContent =
      diaNom + " " + fmtDDMMYYYY(iso) + " — " + evs.length + (evs.length === 1 ? " actividad" : " actividades");

    var orden = function (a, b) {
      var pri = { finde_largo: 0, feriado_nacional: 1, vacaciones_invierno: 2, evento_masivo: 3 };
      return (pri[a.tipo] != null ? pri[a.tipo] : 9) - (pri[b.tipo] != null ? pri[b.tipo] : 9);
    };
    var sorted = evs.slice().sort(orden);
    cuerpo.innerHTML = sorted.map(detalleEventoHtml).join("");
    if (!sorted.length) {
      cuerpo.innerHTML = "<p>Sin eventos registrados este día.</p>";
    }

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function cerrarDetalleDia() {
    var modal = document.getElementById("cal-dia-modal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "";
    if (celdaSeleccionada) {
      celdaSeleccionada.classList.remove("cal-celda-seleccionada");
      celdaSeleccionada = null;
    }
  }

  function llenarCeldaCalendario(cel, iso, evs, infoPuente) {
    var num = document.createElement("div");
    num.className = "cal-celda-num";
    num.textContent = String(parseInt(iso.slice(8, 10), 10));

    cel.appendChild(num);

    if (infoPuente) {
      var p = infoPuente.puente;
      var et = document.createElement("span");
      et.className = "cal-puente-etiqueta";
      et.textContent = "FINDE LARGO";
      cel.appendChild(et);

      var nom = document.createElement("span");
      nom.className = "cal-puente-nombre";
      nom.textContent = p.nombre || "Puente turístico";
      cel.appendChild(nom);

      var meta = document.createElement("span");
      meta.className = "cal-puente-meta";
      meta.textContent =
        (p.cantidad_dias ? p.cantidad_dias + " días" : "") +
        (p.dias_texto ? " · " + p.dias_texto : "") +
        (p.cantidad_noches ? " · " + p.cantidad_noches + " noches" : "");
      cel.appendChild(meta);

      var otros = evs.filter(function (e) {
        return e.tipo !== "finde_largo";
      });
      if (otros.length) {
        var extra = document.createElement("span");
        extra.className = "cal-celda-resumen";
        extra.textContent = "+ " + otros.length + " evento(s) más este día";
        cel.appendChild(extra);
      }
    } else if (evs.length) {
      var tipos = {};
      evs.forEach(function (e) {
        tipos[e.tipo] = (tipos[e.tipo] || 0) + 1;
      });
      var resumen = document.createElement("span");
      resumen.className = "cal-celda-resumen";
      var partes = [];
      if (tipos.feriado_nacional) partes.push("Feriado");
      if (tipos.evento_masivo) partes.push(tipos.evento_masivo + " evento grande");
      if (tipos.evento_agenda || tipos.evento_grilla)
        partes.push((tipos.evento_agenda || 0) + (tipos.evento_grilla || 0) + " festival/fiesta");
      if (tipos.dia_especial) partes.push("Día especial");
      resumen.textContent = partes.length ? partes.join(" · ") : evs.length + " actividades";
      cel.appendChild(resumen);
      var primero = evs.find(function (e) {
        return e.tipo !== "finde_largo";
      });
      if (primero) {
        var prev = document.createElement("span");
        prev.className = "cal-celda-resumen";
        prev.textContent = primero.nombre || "";
        cel.appendChild(prev);
      }
    }

    var toca = document.createElement("span");
    toca.className = "cal-celda-toca";
    toca.textContent = evs.length ? "Tocá para leer todo" : "";
    cel.appendChild(toca);
  }

  function renderCalendarioGrid(d) {
    var grid = document.getElementById("cal-preview-grid");
    if (!grid) return;
    grid.innerHTML = "";
    agendaPorDia = indicePorDia(d.items);
    var diasPuente = mapaDiasPuente(d.items);
    var inicio = parseIsoLocal(d.desde);
    var fin = parseIsoLocal(d.hasta);
    var hoyIso = isoHoy();
    var y = inicio.getFullYear();
    var m = inicio.getMonth();
    var finY = fin.getFullYear();
    var finM = fin.getMonth();

    while (y < finY || (y === finY && m <= finM)) {
      var bloque = document.createElement("div");
      bloque.className = "cal-mes-bloque";
      var titulo = document.createElement("h3");
      titulo.textContent = MESES[m + 1] + " " + y;
      bloque.appendChild(titulo);

      var head = document.createElement("div");
      head.className = "cal-semana-header";
      DIAS_SEM.forEach(function (lbl) {
        var s = document.createElement("span");
        s.textContent = lbl;
        head.appendChild(s);
      });
      bloque.appendChild(head);

      var cuerpo = document.createElement("div");
      cuerpo.className = "cal-grid-mes";

      var primerDia = new Date(y, m, 1);
      var ultimoDia = new Date(y, m + 1, 0);
      var offset = (primerDia.getDay() + 6) % 7;
      var i;
      for (i = 0; i < offset; i++) {
        var vac = document.createElement("div");
        vac.className = "cal-celda cal-celda-vacia";
        cuerpo.appendChild(vac);
      }
      for (var dia = 1; dia <= ultimoDia.getDate(); dia++) {
        var cel = document.createElement("button");
        cel.type = "button";
        cel.className = "cal-celda";
        var iso = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
        var evs = agendaPorDia[iso] || [];
        var infoPuente = diasPuente[iso];

        if (iso === hoyIso) cel.classList.add("hoy");
        if (
          evs.some(function (e) {
            return e.tipo === "feriado_nacional";
          }) &&
          !infoPuente
        )
          cel.classList.add("tiene-feriado");

        if (infoPuente) {
          cel.classList.add("es-puente");
          if (infoPuente.pos === "inicio") cel.classList.add("puente-inicio");
          else if (infoPuente.pos === "fin") cel.classList.add("puente-fin");
          else cel.classList.add("puente-medio");
        }

        llenarCeldaCalendario(cel, iso, evs, infoPuente);
        cel.setAttribute("data-iso", iso);

        (function (celda, isoKey) {
          celda.addEventListener("click", function () {
            var evsClick = agendaPorDia[isoKey] || [];
            if (celdaSeleccionada) celdaSeleccionada.classList.remove("cal-celda-seleccionada");
            celdaSeleccionada = celda;
            celda.classList.add("cal-celda-seleccionada");
            abrirDetalleDia(isoKey, evsClick);
          });
        })(cel, iso);

        cuerpo.appendChild(cel);
      }
      bloque.appendChild(cuerpo);
      grid.appendChild(bloque);

      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  }

  function renderLeyenda() {
    var el = document.getElementById("cal-preview-leyenda");
    if (!el) return;
    el.innerHTML =
      '<span class="lg-puente">Azul · finde largo (todos los días)</span>' +
      '<span class="lg-feriado">Borde rojo · feriado</span>' +
      '<span class="lg-evento">Dorado · fiesta confirmada</span>' +
      "<span>Tocá un día para leer todo</span>";
  }

  function setVistaAgenda(vista) {
    var grid = document.getElementById("cal-preview-grid");
    var lista = document.getElementById("cal-preview-lista");
    var leyenda = document.getElementById("cal-preview-leyenda");
    var tCal = document.getElementById("tab-vista-calendario");
    var tList = document.getElementById("tab-vista-listado");
    var esCal = vista === "calendario";
    if (grid) grid.hidden = !esCal;
    if (lista) lista.hidden = esCal;
    if (leyenda) leyenda.hidden = !esCal;
    if (tCal) tCal.classList.toggle("active", esCal);
    if (tList) tList.classList.toggle("active", !esCal);
  }

  function mkToast(msg) {
    var old = document.querySelector(".mk-toast");
    if (old) old.remove();
    var t = document.createElement("div");
    t.className = "mk-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      t.remove();
    }, 2200);
  }

  function pillMkTipo(tipo) {
    var cls = "mk-pill-evento";
    var label = TIPO_LABEL[tipo] || tipo;
    if (tipo === "finde_largo") cls = "mk-pill-puente";
    else if (tipo === "feriado_nacional") cls = "mk-pill-feriado";
    return '<span class="mk-pill ' + cls + '">' + escHtml(label) + "</span>";
  }

  function renderTimeline(d) {
    var wrap = document.getElementById("cal-preview-timeline");
    if (!wrap) return;
    wrap.innerHTML = "";

    var items = (d.items || []).filter(function (it) {
      return it.tipo !== "referencia" && !it.solo_listado && (it.fecha_inicio || it.fecha);
    });
    items.sort(function (a, b) {
      return (a.fecha_inicio || a.fecha || "").localeCompare(b.fecha_inicio || b.fecha || "");
    });

    if (!items.length) {
      wrap.innerHTML =
        '<p class="mk-empty" style="border:none">No hay publicaciones en este período. Ampliá fechas o actualizá eventos.</p>';
      return;
    }

    var mesActual = "";
    items.forEach(function (it, idx) {
      var fi = it.fecha_inicio || it.fecha || "";
      var mesKey = fi.slice(0, 7);
      if (mesKey && mesKey !== mesActual) {
        mesActual = mesKey;
        var parts = mesKey.split("-");
        var badge = document.createElement("div");
        badge.className = "mk-month-badge";
        badge.textContent = MESES[parseInt(parts[1], 10)] + " " + parts[0];
        wrap.appendChild(badge);
      }

      var prev = it.post_preview || {};
      var foto = prev.foto_post_url || prev.banner_url || it.banner_url;
      var side = idx % 2 === 0 ? "side-left" : "side-right";
      var cardTipo = it.tipo === "finde_largo" ? "tipo-puente" : it.tipo === "feriado_nacional" ? "tipo-feriado" : "";

      var item = document.createElement("article");
      item.className = "mk-timeline-item " + side + " " + cardTipo;

      var dot = document.createElement("span");
      dot.className = "mk-timeline-dot";
      item.appendChild(dot);

      var card = document.createElement("div");
      card.className = "mk-event-card " + cardTipo;

      var banner = document.createElement("div");
      banner.className = "mk-event-banner";
      if (foto) {
        var img = document.createElement("img");
        img.src = foto;
        img.alt = it.nombre || "Evento";
        img.loading = "lazy";
        img.onerror = function () {
          banner.innerHTML =
            '<div class="mk-event-banner-placeholder"><strong>Sin imagen</strong>Agregá foto en archivos multimedia/FESTIVALES o PARQUE</div>';
        };
        banner.appendChild(img);
      } else {
        banner.innerHTML =
          '<div class="mk-event-banner-placeholder"><strong>Falta foto del evento</strong>Subí una imagen en <code>archivos multimedia/fotos terra natura/FESTIVALES</code> con el nombre del festival en el archivo.</div>';
      }
      var datePill = document.createElement("span");
      datePill.className = "mk-date-pill";
      datePill.textContent = prev.fecha_legible || rangoTexto(it);
      banner.appendChild(datePill);
      card.appendChild(banner);

      var body = document.createElement("div");
      body.className = "mk-event-body";

      var meta = document.createElement("div");
      meta.className = "mk-event-meta";
      meta.innerHTML = pillMkTipo(it.tipo);
      if (prev.tiene_foto_real) {
        meta.innerHTML += ' <span class="mk-pill mk-pill-foto-ok">Foto real</span>';
      } else {
        meta.innerHTML += ' <span class="mk-pill mk-pill-foto-falta">Falta asset</span>';
      }
      body.appendChild(meta);

      var h3 = document.createElement("h3");
      h3.textContent = prev.titulo || it.nombre || "";
      body.appendChild(h3);

      if (it.localidad) {
        var lug = document.createElement("p");
        lug.className = "mk-event-lugar";
        lug.textContent = "📍 " + it.localidad;
        body.appendChild(lug);
      }

      var angulo = it.angulo_comercial || prev.copy_instagram || "";
      if (angulo && angulo.length < 400) {
        var ang = document.createElement("p");
        ang.className = "mk-event-angulo";
        ang.textContent = angulo;
        body.appendChild(ang);
      }

      var mock = document.createElement("div");
      mock.className = "mk-post-mockup";
      mock.innerHTML =
        '<div class="mk-post-mockup-head"><span class="mk-post-mockup-avatar"></span> terranatura.bialet</div>';
      var mockImg = document.createElement("div");
      mockImg.className = "mk-post-mockup-img";
      if (foto) {
        var img2 = document.createElement("img");
        img2.src = foto;
        img2.alt = "Vista previa post";
        img2.loading = "lazy";
        mockImg.appendChild(img2);
      } else {
        mockImg.innerHTML = '<div class="mk-event-banner-placeholder" style="min-height:120px">Vista cuadrada del post</div>';
      }
      mock.appendChild(mockImg);

      var copyText = prev.copy_con_hashtags || prev.copy_instagram || "";
      var ta = document.createElement("textarea");
      ta.className = "mk-post-copy";
      ta.readOnly = true;
      ta.value = copyText;
      mock.appendChild(ta);

      var actions = document.createElement("div");
      actions.className = "mk-post-actions";
      var btnCopy = document.createElement("button");
      btnCopy.type = "button";
      btnCopy.className = "mk-btn mk-btn-primary";
      btnCopy.textContent = "Copiar texto";
      btnCopy.addEventListener("click", function () {
        navigator.clipboard.writeText(copyText).then(
          function () {
            mkToast("Texto copiado para Instagram");
          },
          function () {
            ta.select();
            document.execCommand("copy");
            mkToast("Texto copiado");
          }
        );
      });
      actions.appendChild(btnCopy);
      if (prev.whatsapp_url) {
        var btnWa = document.createElement("a");
        btnWa.className = "mk-btn mk-btn-outline";
        btnWa.href = prev.whatsapp_url;
        btnWa.target = "_blank";
        btnWa.rel = "noopener";
        btnWa.textContent = "WhatsApp";
        actions.appendChild(btnWa);
      }
      mock.appendChild(actions);
      body.appendChild(mock);

      card.appendChild(body);
      item.appendChild(card);
      wrap.appendChild(item);
    });
  }

  function renderStatsChips(d) {
    var el = document.getElementById("agenda-stats-chips");
    if (!el) return;
    el.innerHTML = "";
    el.innerHTML = "";
    var pt = d.por_tipo || {};
    var labels = {
      finde_largo: "Puentes",
      feriado_nacional: "Feriados",
      evento_confirmado: "Fiestas confirmadas",
      evento_masivo: "Eventos grandes",
      evento_local: "Bialet",
      vacaciones_invierno: "Vacaciones",
      dia_especial: "Días especiales",
    };
    Object.keys(labels).forEach(function (k) {
      if (pt[k]) {
        var s = document.createElement("span");
        s.className = "stat-chip";
        s.innerHTML = "<strong>" + pt[k] + "</strong> " + labels[k];
        el.appendChild(s);
      }
    });
    var tot = document.createElement("span");
    tot.className = "stat-chip";
    tot.innerHTML = "<strong>" + (d.total || 0) + "</strong> total";
    el.appendChild(tot);
  }

  function pillTipoHtml(tipo) {
    var cls = "evento";
    if (tipo === "finde_largo") cls = "puente";
    else if (tipo === "feriado_nacional") cls = "feriado";
    else if (tipo === "evento_confirmado") cls = "confirmado";
    return (
      '<span class="pill-tipo ' +
      cls +
      '">' +
      escHtml(TIPO_LABEL[tipo] || tipo) +
      '</span> <span class="pill-estado-ok">✓ Confirmado</span>'
    );
  }

  function renderAgenda(d) {
    var panel = document.getElementById("panel-calendario-importantes");
    var resumen = document.getElementById("cal-preview-resumen");
    if (panel) panel.hidden = false;
    var df = d.desde_fmt || fmtDDMMYYYY(d.desde);
    var hf = d.hasta_fmt || fmtDDMMYYYY(d.hasta);
    if (resumen) {
      resumen.textContent =
        (d.total || 0) + " fechas confirmadas · " + df + " al " + hf + " (feriados + fiestas con fecha oficial)";
    }
    var chips = document.getElementById("agenda-stats-chips");
    if (chips) renderStatsChips(d);
    renderLeyenda();
    renderCalendarioGrid(d);
    renderListado(d);
    setVistaAgenda("listado");
  }

  document.querySelectorAll(".agenda-tab, .cal-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setVistaAgenda(btn.getAttribute("data-vista"));
    });
  });

  function cargarPublicaciones() {
    var panel = document.getElementById("panel-calendario-importantes");
    var timeline = document.getElementById("cal-preview-timeline");
    if (panel) panel.hidden = false;
    if (timeline) timeline.innerHTML = "<p style='text-align:center;padding:2rem;color:#6b7f76'>Cargando publicaciones…</p>";
    return fetch("/api/programa/calendario-importantes" + queryRango())
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        renderAgenda(d);
        log("Publicaciones: " + d.total + " · " + (d.desde_fmt || d.desde) + " → " + (d.hasta_fmt || d.hasta));
      });
  }

  function renderListado(d) {
    var lista = document.getElementById("cal-preview-lista");
    if (!lista) return;
    lista.innerHTML = "";
    var items = (d.items || []).filter(function (it) {
      return it.tipo !== "referencia" && !it.solo_listado;
    });
    items.sort(function (a, b) {
      return (a.fecha_inicio || a.fecha || "").localeCompare(b.fecha_inicio || b.fecha || "");
    });
    items.forEach(function (it) {
      var card = document.createElement("article");
      card.className = "agenda-event-card";
      var fi = it.fecha_inicio || it.fecha || "";
      card.innerHTML =
        '<div class="card-fecha">' +
        escHtml(rangoTexto(it)) +
        "</div><div>" +
        pillTipoHtml(it.tipo) +
        "<h4>" +
        escHtml(it.nombre || "") +
        "</h4>" +
        (it.localidad ? "<p>📍 " + escHtml(it.localidad) + "</p>" : "") +
        (it.angulo_comercial
          ? '<p class="angulo-venta">' + escHtml(it.angulo_comercial) + "</p>"
          : "") +
        (it.descripcion ? "<p>" + escHtml(it.descripcion) + "</p>" : "") +
        (it.fuente ? '<p class="pill-estado-ok">Fuente: ' + escHtml(it.fuente) + "</p>" : "") +
        "</div>";
      lista.appendChild(card);
    });
    if (!items.length) {
      lista.innerHTML = "<p class='agenda-lead'>No hay eventos confirmados en este período.</p>";
    }
  }

  var btnActualizar = document.getElementById("btn-actualizar-agenda");
  if (btnActualizar) {
    btnActualizar.addEventListener("click", function () {
      log("Actualizando agenda de eventos…");
      btnActualizar.disabled = true;
      fetch("/api/programa/actualizar-agenda-eventos" + queryRango(), { method: "POST" })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          var msg = d.mensaje || "Listo";
          if (d.fotos_web && d.fotos_web.mensaje) msg += "\n\n" + d.fotos_web.mensaje;
          log(msg);
          alert(msg);
          return fetch("/api/programa/calendario-importantes" + queryRango());
        })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          renderAgenda(d);
          log("Vista calendario: " + d.total + " ítems");
        })
        .catch(function () {
          log("Error al actualizar agenda.");
          alert("¿Servidor encendido?");
        })
        .finally(function () {
          btnActualizar.disabled = false;
        });
    });
  }

  var btnCalPrev = document.getElementById("btn-ver-calendario-importantes");
  if (btnCalPrev) {
    btnCalPrev.addEventListener("click", function () {
      btnCalPrev.disabled = true;
      cargarPublicaciones()
        .catch(function () {
          var timeline = document.getElementById("cal-preview-timeline");
          if (timeline) {
            timeline.innerHTML =
              "<p style='text-align:center;padding:2rem;color:#b83232'>No se pudo cargar. Abrí el icono Terra Natura del escritorio.</p>";
          }
          log("Error al cargar publicaciones.");
        })
        .finally(function () {
          btnCalPrev.disabled = false;
        });
    });
  }

  var btnFuentes = document.getElementById("btn-ver-fuentes");
  if (btnFuentes) {
    btnFuentes.addEventListener("click", function () {
      var panel = document.getElementById("panel-fuentes-agenda");
      panel.hidden = false;
      panel.innerHTML = "Cargando fuentes…";
      fetch("/api/programa/fuentes-agenda")
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          var html = "<strong>Dónde busca el programa:</strong><ul>";
          ["fuentes_oficiales", "medios_regionales", "deportes", "musica_recitales"].forEach(function (k) {
            (d[k] || []).forEach(function (f) {
              html += "<li>" + f.nombre + (f.url ? ' — <a href="' + f.url + '" target="_blank" rel="noopener">link</a>' : "") + "</li>";
            });
          });
          html += "</ul>";
          if (d.localidades_prioridad) {
            html += "<p>Punilla: " + (d.localidades_prioridad.valle_punilla || []).join(", ") + "</p>";
          }
          panel.innerHTML = html;
        });
    });
  }

  var btnYt = document.getElementById("btn-recolectar-yt");
  if (btnYt) {
    btnYt.addEventListener("click", function () {
      if (!confirm("¿Buscar videos en YouTube y guardarlos en la biblioteca?\n(Necesitás YOUTUBE_API_KEY en .env)")) return;
      log("Recolectando videos YouTube…");
      setBusy(btnYt, true, "Buscando en YouTube…");
      fetch("/api/turismo/youtube/recolectar", { method: "POST" })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d.ok === false) {
            log("Error: " + (d.error || "revisá API key"));
            alert(d.error || "Error YouTube API");
            return;
          }
          log(
            "Listo: " +
              (d.nuevos || 0) +
              " nuevos · total " +
              (d.total_youtube || 0) +
              (d.errores && d.errores.length ? "\nAvisos: " + d.errores.length : "")
          );
          alert(
            "Biblioteca YouTube actualizada.\nNuevos: " +
              (d.nuevos || 0) +
              " · Total: " +
              (d.total_youtube || 0)
          );
          cargarEstado();
        })
        .catch(function () {
          log("Falló la conexión con el programa.");
          alert("¿Está encendido el servidor? Usá el icono del escritorio.");
        })
        .finally(function () {
          setBusy(btnYt, false);
        });
    });
  }

  var btnCal = document.getElementById("btn-calendario-editorial");
  if (btnCal) {
    btnCal.addEventListener("click", function () {
      var body = bodyRango();
      var dias =
        inputDesde && inputHasta && inputDesde.value && inputHasta.value
          ? Math.ceil(
              (new Date(inputHasta.value) - new Date(inputDesde.value)) / 86400000
            ) + 1
          : 90;
      if (
        !confirm(
            "¿Generar calendario editorial desde " +
            (body.desde ? fmtDDMMYYYY(body.desde) : "hoy") +
            " hasta " +
            (body.hasta ? fmtDDMMYYYY(body.hasta) : "marzo") +
            "?\nAprox. " +
            Math.round((dias / 7) * 7) +
            " publicaciones borrador."
        )
      )
        return;
      log("Generando calendario editorial (" + dias + " días)…");
      setBusy(btnCal, true, "Planificando…");
      fetch("/api/ama/generar-calendario-editorial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          var res = d.resumen || {};
          log(
            "Calendario: " +
              (d.guardadas || res.total || 0) +
              " piezas · " +
              fmtDDMMYYYY(d.desde) +
              " → " +
              fmtDDMMYYYY(d.hasta)
          );
          alert(
            "Calendario listo: " +
              (d.guardadas || res.total || 0) +
              " publicaciones\nDel " +
              fmtDDMMYYYY(d.desde) +
              " al " +
              fmtDDMMYYYY(d.hasta) +
              " (" +
              (d.dias || dias) +
              " días)."
          );
          cargarEstado();
        })
        .catch(function () {
          log("Error al generar calendario.");
          alert("Error de conexión.");
        })
        .finally(function () {
          setBusy(btnCal, false);
        });
    });
  }

  var btnVid = document.getElementById("btn-videos-editorial");
  if (btnVid) {
    btnVid.addEventListener("click", function () {
      if (
        !confirm(
          "¿Generar hasta 5 videos editoriales?\n(B-roll YouTube + fotos — puede tardar varios minutos)"
        )
      )
        return;
      log("Generando videos editoriales (puede tardar)…");
      setBusy(btnVid, true, "Montando videos…");
      fetch("/api/ama/video/lote-calendario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dias: 14, max_videos: 5 }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          log("Videos generados: " + (d.generados || 0));
          if (d.videos && d.videos.length) {
            d.videos.forEach(function (v) {
              log("  · " + (v.fecha || "") + " → " + (v.ruta || ""));
            });
          }
          if (d.errores && d.errores.length) {
            d.errores.forEach(function (e) {
              log("  Error: " + (e.error || e.id));
            });
          }
          alert(
            "Videos listos: " +
              (d.generados || 0) +
              "\nRevisá en Marketing → Calendario o carpeta videos marketing/editorial"
          );
          window.open("/marketing", "_blank");
          cargarEstado();
        })
        .catch(function () {
          log("Error generando videos.");
          alert("Error. Verificá ffmpeg y yt-dlp instalados.");
        })
        .finally(function () {
          setBusy(btnVid, false);
        });
    });
  }

  var btnCarpeta = document.getElementById("btn-abrir-videos");
  if (btnCarpeta) {
    btnCarpeta.addEventListener("click", function () {
      log("Abrí en el Explorador: archivos multimedia\\videos marketing\\editorial");
      alert(
        "Carpeta de videos:\narchivos multimedia\\videos marketing\\editorial\\\n(dentro del proyecto Terra Natura)"
      );
    });
  }

  var modalCerrar = document.getElementById("cal-dia-modal-cerrar");
  var modalBackdrop = document.getElementById("cal-dia-modal-backdrop");
  if (modalCerrar) modalCerrar.addEventListener("click", cerrarDetalleDia);
  if (modalBackdrop) modalBackdrop.addEventListener("click", cerrarDetalleDia);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") cerrarDetalleDia();
  });

  initFechas();
  cargarEstado();
})();
