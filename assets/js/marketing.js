(function () {
  function showPane(name) {
    document.querySelectorAll("[data-pane]").forEach(function (el) {
      el.hidden = el.getAttribute("data-pane") !== name;
    });
    if (name === "calendario") cargarCalendario();
  }

  document.querySelectorAll("[data-show-pane]").forEach(function (el) {
    el.addEventListener("click", function () {
      showPane(el.getAttribute("data-show-pane") || "menu");
    });
  });

  var ultimoCopy = "";

  function ymdLocal(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  var fechaCopy = document.getElementById("copy-fecha");
  if (fechaCopy && !fechaCopy.value) fechaCopy.value = ymdLocal(new Date());

  function cargarDashboard() {
    fetch("/api/ama/dashboard")
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        document.getElementById("stat-hoy").textContent = d.publicaciones_hoy;
        document.getElementById("stat-pend").textContent = d.pendientes_aprobacion;
        document.getElementById("stat-total").textContent = d.total_calendario;
        var pill = document.getElementById("modo-pill");
        if (pill) pill.textContent = d.modo_publicacion === "automatico" ? "Automático" : "Con tu aprobación";
      })
      .catch(function () {});
  }

  function cargarCalendario() {
    var lista = document.getElementById("lista-calendario");
    var msg = document.getElementById("msg-calendario");
    if (!lista) return;
    lista.innerHTML = "";
    msg.textContent = "Cargando…";
    fetch("/api/ama/calendario")
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        var items = d.publicaciones || [];
        msg.textContent = items.length ? "" : "Calendario vacío. Usá «Llenar semana» o «Crear texto».";
        items.forEach(function (p) {
          var li = document.createElement("li");
          li.className = "cal-item estado-" + (p.estado || "borrador");
          li.innerHTML =
            "<strong>" +
            (p.fecha_publicacion || "") +
            " " +
            (p.hora || "") +
            " · " +
            (p.canal || "") +
            "</strong><br>" +
            "<span class=\"cal-meta\">" +
            (p.estado || "") +
            " · " +
            (p.objetivo || p.angulo || "") +
            " · " +
            (p.formato || "") +
            "</span><p style=\"margin:0.5rem 0 0;font-size:0.88rem;\">" +
            (p.copy || "").slice(0, 200) +
            (p.copy && p.copy.length > 200 ? "…" : "") +
            "</p>" +
            (p.video_ruta
              ? "<p class=\"cal-meta\"><a href=\"/api/ama/video/archivo?ruta=" +
                encodeURIComponent(p.video_ruta) +
                "\" target=\"_blank\">▶ Ver video</a></p>"
              : "") +
            (p.formato === "reel" && !p.video_ruta
              ? "<button type=\"button\" class=\"btn btn-outline btn-sm btn-gen-vid\" data-pub=\"" +
                p.id +
                "\" style=\"margin-top:0.4rem;font-size:0.8rem;\">Generar video</button>"
              : "");
          lista.appendChild(li);
        });
        lista.querySelectorAll(".btn-gen-vid").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-pub");
            btn.disabled = true;
            btn.textContent = "Generando…";
            fetch("/api/ama/video/editorial", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pub_id: id }),
            })
              .then(function (r) {
                return r.json();
              })
              .then(function (d) {
                if (d.ok) {
                  alert(d.mensaje || "Video listo");
                  cargarCalendario();
                } else {
                  alert(d.mensaje || "No se pudo generar");
                }
              })
              .catch(function () {
                alert("Error de conexión");
              })
              .finally(function () {
                btn.disabled = false;
                btn.textContent = "Generar video";
              });
          });
        });
      })
      .catch(function () {
        msg.textContent = "No se pudo cargar. ¿Está encendido el programa?";
      });
  }

  function mostrarCopy(gen) {
    ultimoCopy = gen.copy || "";
    var prev = document.getElementById("copy-preview");
    var acc = document.getElementById("copy-acciones");
    if (prev) {
      prev.hidden = false;
      prev.textContent = ultimoCopy;
    }
    if (acc) acc.hidden = false;
  }

  function generarCopy(guardar) {
    var body = {
      angulo: document.getElementById("copy-angulo").value,
      canal: document.getElementById("copy-canal").value,
      cuerpo_extra: document.getElementById("copy-extra").value || null,
    };
    return fetch("/api/ama/generar-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (gen) {
        mostrarCopy(gen);
        if (guardar) {
          var fd = document.getElementById("copy-fecha").value;
          return fetch("/api/ama/calendario", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fecha_publicacion: fd,
              hora: "10:00",
              canal: body.canal,
              angulo: body.angulo,
              titulo: gen.titulo,
              texto: gen.copy,
              hashtags: gen.hashtags,
              estado: "pendiente_aprobacion",
            }),
          }).then(function () {
            cargarDashboard();
            alert("Guardado en el calendario. Revisá en «Calendario» y copiá para publicar.");
          });
        }
      });
  }

  var formCopy = document.getElementById("form-copy");
  if (formCopy) {
    formCopy.addEventListener("submit", function (e) {
      e.preventDefault();
      generarCopy(true).catch(function () {
        alert("Error al generar.");
      });
    });
  }

  var btnPreview = document.getElementById("btn-solo-preview");
  if (btnPreview) {
    btnPreview.addEventListener("click", function () {
      generarCopy(false);
    });
  }

  var btnCopiar = document.getElementById("btn-copiar-copy");
  if (btnCopiar) {
    btnCopiar.addEventListener("click", function () {
      navigator.clipboard.writeText(ultimoCopy).then(
        function () {
          btnCopiar.textContent = "¡Copiado!";
          setTimeout(function () {
            btnCopiar.textContent = "Copiar texto";
          }, 1500);
        },
        function () {
          window.prompt("Copiá:", ultimoCopy);
        }
      );
    });
  }

  var btnVideos = document.getElementById("btn-videos-editorial");
  if (btnVideos) {
    btnVideos.addEventListener("click", function () {
      if (
        !confirm(
          "¿Generar hasta 5 videos profesionales para los próximos reels?\n(Solo fotos del complejo, ~1–2 min cada uno)"
        )
      )
        return;
      btnVideos.disabled = true;
      fetch("/api/ama/video/lote-calendario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dias: 14, max_videos: 5 }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          alert(
            "Videos generados: " +
              (d.generados || 0) +
              (d.errores && d.errores.length ? "\nErrores: " + d.errores.length : "")
          );
          cargarDashboard();
          showPane("calendario");
        })
        .catch(function () {
          alert("Error. ¿Servidor y ffmpeg instalados?");
        })
        .finally(function () {
          btnVideos.disabled = false;
        });
    });
  }

  var btn90 = document.getElementById("btn-calendario-90");
  if (btn90) {
    btn90.addEventListener("click", function () {
      if (
        !confirm(
          "¿Generar ~90 publicaciones borrador (90 días, 7 por semana)?\nIncluye copy, guion y fotos/YouTube. Revisá después en Calendario."
        )
      )
        return;
      btn90.disabled = true;
      fetch("/api/ama/generar-calendario-90", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dias: 90, guardar_en_calendario: true }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          var res = d.resumen || {};
          alert(
            "Listo: " +
              (d.guardadas || res.total || 0) +
              " piezas.\nCanales: " +
              JSON.stringify(res.por_canal || {}) +
              "\nObjetivos: " +
              JSON.stringify(res.por_objetivo || {})
          );
          cargarDashboard();
          showPane("calendario");
        })
        .catch(function () {
          alert("Error. ¿Servidor encendido?");
        })
        .finally(function () {
          btn90.disabled = false;
        });
    });
  }

  var btnSemana = document.getElementById("btn-semana");
  if (btnSemana) {
    btnSemana.addEventListener("click", function () {
      if (!confirm("¿Crear 7 publicaciones borrador para esta semana?")) return;
      btnSemana.disabled = true;
      fetch("/api/ama/generar-semana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dias: 7, guardar_en_calendario: true }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          alert("Listo: " + (d.guardadas || 0) + " publicaciones en el calendario.");
          cargarDashboard();
          showPane("calendario");
        })
        .catch(function () {
          alert("Error. ¿Servidor encendido?");
        })
        .finally(function () {
          btnSemana.disabled = false;
        });
    });
  }

  var formVideo = document.getElementById("form-video");
  if (formVideo) {
    formVideo.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = document.getElementById("msg-video");
      var link = document.getElementById("link-video");
      msg.textContent = "Generando… puede tardar unos minutos.";
      link.hidden = true;
      fetch("/api/ama/video/slideshow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo_en_video: document.getElementById("video-titulo").value,
          carpeta_media: document.getElementById("video-carpeta").value || null,
        }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d.ok && d.ruta) {
            msg.textContent = d.mensaje;
            link.href = "/api/ama/video/archivo?ruta=" + encodeURIComponent(d.ruta);
            link.hidden = false;
          } else {
            msg.textContent = (d.mensaje || "No se generó") + "\n\n" + (d.brief_canva || "");
          }
        })
        .catch(function () {
          msg.textContent = "Error de conexión con el servidor.";
        });
    });
  }

  var btnWa = document.getElementById("btn-wa-sugerir");
  if (btnWa) {
    btnWa.addEventListener("click", function () {
      var txt = document.getElementById("wa-cliente").value.trim();
      if (!txt) return;
      fetch("/api/ama/whatsapp/borrador-respuesta?mensaje_cliente=" + encodeURIComponent(txt), {
        method: "POST",
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          var prev = document.getElementById("wa-preview");
          var cop = document.getElementById("btn-copiar-wa");
          var sugerencia = d.sugerencia_corta;
          if (d.escalar_humano) sugerencia += "\n\n(Atención: conviene responder vos en persona.)";
          ultimoCopy = sugerencia;
          prev.hidden = false;
          prev.textContent = sugerencia;
          cop.hidden = false;
        });
    });
  }

  var btnCopiarWa = document.getElementById("btn-copiar-wa");
  if (btnCopiarWa) {
    btnCopiarWa.addEventListener("click", function () {
      navigator.clipboard.writeText(ultimoCopy);
      btnCopiarWa.textContent = "¡Copiado!";
    });
  }

  cargarDashboard();
})();
