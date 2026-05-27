(function () {
  function showPane(name) {
    document.querySelectorAll("[data-pane]").forEach(function (el) {
      el.hidden = el.getAttribute("data-pane") !== name;
    });
  }

  document.querySelectorAll("[data-show-pane]").forEach(function (el) {
    el.addEventListener("click", function () {
      var target = el.getAttribute("data-show-pane");
      showPane(target || "menu");

      if (target === "reservas") {
        cargarReservas();
      }
      if (target === "ical") {
        cargarEnlacesIcal();
      }
    });
  });

  window.addEventListener("hashchange", function () {
    if (window.location.hash === "#/reservas") {
      showPane("reservas");
      cargarReservas();
    }
  });

  if (window.location.hash === "#/reservas") {
    showPane("reservas");
    cargarReservas();
  }

  function ymdISO(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function fmtFechaISO(s) {
    if (!s) return "";
    var d = new Date(s + "T12:00:00");
    return d.toLocaleDateString("es-AR");
  }

  function fmtMoney(n, moneda) {
    var code = moneda === "USD" ? "USD" : "ARS";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(n || 0);
  }

  var tb = document.getElementById("tabla-reservas-body");
  var msgReservas = document.getElementById("msg-reservas");
  var desdeEl = document.getElementById("panel-desde");
  var hastaEl = document.getElementById("panel-hasta");

  if (desdeEl && hastaEl && !desdeEl.value) {
    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    var fin = new Date(hoy.getTime());
    fin.setMonth(fin.getMonth() + 4);
    desdeEl.value = ymdISO(hoy);
    hastaEl.value = ymdISO(fin);
  }

  window.recargarReservas = function () {
    cargarReservas();
  };

  function cargarReservas() {
    if (!tb || !msgReservas || !desdeEl || !hastaEl) return;
    tb.innerHTML = "";
    msgReservas.textContent = "Cargando…";

    var u = {};

    fetch("/api/unidades")
      .then(function (r) {
        return r.json();
      })
      .then(function (json) {
        (json.unidades || []).forEach(function (x) {
          u[x.id] = x.nombre;
        });

        var url =
          "/api/reservas?desde=" +
          encodeURIComponent(desdeEl.value) +
          "&hasta=" +
          encodeURIComponent(hastaEl.value);

        return fetch(url).then(function (r) {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        }).then(function (lista) {
          return { lista: lista, unitNames: u };
        });
      })
      .then(function (pair) {
        msgReservas.textContent =
          pair.lista.length === 0
            ? "No hay reservas registradas en este rango (o base vacía)."
            : pair.lista.length + " reserva(s).";

        pair.lista
          .sort(function (a, b) {
            return (b.check_in || "").localeCompare(a.check_in || "");
          })
          .forEach(function (r) {
            var tr = document.createElement("tr");
            var un =
              pair.unitNames[r.unidad_id] || r.unidad_id;

            [
              fmtFechaISO(r.check_in),
              fmtFechaISO(r.check_out),
              un,
              r.estado,
              r.origen || "—",
              r.huesped_nombre || "—",
              fmtMoney(r.precio_total, r.moneda),
            ].forEach(function (txt) {
              var td = document.createElement("td");
              td.textContent = txt;
              tr.appendChild(td);
            });
            tb.appendChild(tr);
          });
      })
      .catch(function () {
        msgReservas.textContent =
          "No se pudo cargar. ¿Tenés el servidor encendido? Abrí desde la dirección donde corre Terra Natura (no desde el archivo suelto).";
      });
  }

  var listaIcal = document.getElementById("lista-ical");

  window.copiadoHint = "";

  function cargarEnlacesIcal() {
    if (!listaIcal) return;
    listaIcal.innerHTML = "<p class=\"cotiza-muted\">Cargando unidades…</p>";

    fetch("/api/unidades?solo_alquilables=true")
      .then(function (r) {
        return r.json();
      })
      .then(function (json) {
        listaIcal.innerHTML = "";

        var base = window.location.origin;
        var items = json.unidades || [];

        items.forEach(function (unidad) {
          var relUrl = "/api/unidades/" + encodeURIComponent(unidad.id) + "/ical";
          var full = base + relUrl;

          var card = document.createElement("article");
          card.className = "ical-card";

          var h = document.createElement("strong");
          h.textContent = unidad.nombre;
          card.appendChild(h);

          var p = document.createElement("p");
          p.className = "ical-muted";
          p.style.fontSize = "0.82rem";
          p.style.margin = "0";
          p.style.color = "var(--muted)";
          p.textContent =
            "Copiá el enlace y pegalo donde Airbnb u otro sistema te deje importar un calendario (ocupación).";
          card.appendChild(p);

          var code = document.createElement("div");
          code.className = "ical-url";
          code.textContent = full;

          card.appendChild(code);

          var row = document.createElement("div");
          row.className = "btn-row";

          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-primary";
          btn.textContent = "Copiar enlace";
          btn.addEventListener("click", function () {
            navigator.clipboard.writeText(full).then(
              function () {
                btn.textContent = "¡Copiado!";
                window.setTimeout(function () {
                  btn.textContent = "Copiar enlace";
                }, 1800);
              },
              function () {
                window.prompt("Copiá este enlace:", full);
              }
            );
          });

          row.appendChild(btn);
          card.appendChild(row);
          listaIcal.appendChild(card);
        });

        if (items.length === 0) {
          listaIcal.textContent =
            "No aparecen unidades alquilables. Revisá configuración desde el equipo técnico.";
        }
      })
      .catch(function () {
        listaIcal.textContent = "No se pudieron obtener las unidades.";
      });
  }

  (function cargarAma() {
    var fase = document.getElementById("ama-fase");
    var det = document.getElementById("ama-detalle");
    if (!fase || !det) return;
    fetch("/api/ama/estado")
      .then(function (r) {
        return r.ok ? r.json() : Promise.reject(new Error());
      })
      .then(function (j) {
        fase.textContent = j.fase || "—";
        det.textContent = j.mensaje || "";
      })
      .catch(function () {
        fase.textContent = "no disponible";
        det.textContent = "No se pudo leer el estado. ¿Está encendido el programa?";
      });
  })();

  window.TerraPanel = { showPane: showPane };
})();
