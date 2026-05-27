const API = "";

async function getJson(url, opts = {}) {
  const r = await fetch(API + url, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstChild;
}

function renderStats(hub) {
  const box = document.getElementById("hub-stats");
  box.innerHTML = `
    <div class="stat-card"><strong>${hub.leads_total}</strong>Leads CRM</div>
    <div class="stat-card"><strong>${hub.reservas_activas}</strong>Reservas activas</div>
    <div class="stat-card"><strong>${hub.agentes?.length || 4}</strong>Agentes</div>
  `;
}

function renderAgentCard(meta) {
  const card = el(`
    <article class="agent-card" data-id="${meta.id}">
      <h3>${meta.icono} ${meta.nombre}</h3>
      <p class="desc">${meta.descripcion}</p>
      <ul>${meta.tareas.map((t) => `<li>${t.titulo}</li>`).join("")}</ul>
      <button type="button" class="btn secondary btn-run">Ejecutar agente</button>
      <div class="agent-result hidden"></div>
    </article>
  `);
  card.querySelector(".btn-run").onclick = async () => {
    const resBox = card.querySelector(".agent-result");
    resBox.classList.remove("hidden");
    resBox.textContent = "Ejecutando…";
    try {
      const data = await getJson(`/api/agentes/${meta.id}/ejecutar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      let html = `<p class="status ${data.status}">${data.status.toUpperCase()}</p>`;
      for (const a of data.alertas || []) {
        html += `<p class="alerta">⚠ ${a}</p>`;
      }
      for (const t of data.tareas || []) {
        html += `<p class="tarea">${t.ok ? "✓" : "✗"} <strong>${t.task_id}</strong>: ${t.mensaje}</p>`;
      }
      resBox.innerHTML = html;
    } catch (e) {
      resBox.innerHTML = `<p class="status err">${e.message}</p>`;
    }
  };
  return card;
}

async function loadHub() {
  const hub = await getJson("/api/agentes/hub");
  renderStats(hub);
  const grid = document.getElementById("agentes-grid");
  grid.innerHTML = "";
  for (const a of hub.agentes) {
    grid.appendChild(renderAgentCard(a));
  }
  if (hub.ultimo_ciclo) {
    document.getElementById("ultimo-ciclo").classList.remove("hidden");
    document.getElementById("ciclo-json").textContent = JSON.stringify(
      hub.ultimo_ciclo,
      null,
      2
    );
  }
}

document.getElementById("btn-ciclo").onclick = async () => {
  const btn = document.getElementById("btn-ciclo");
  const st = document.getElementById("ciclo-status");
  btn.disabled = true;
  st.textContent = "Ejecutando ciclo…";
  st.className = "status";
  try {
    const data = await getJson("/api/agentes/ciclo-diario", { method: "POST" });
    st.textContent = data.ok ? "Ciclo OK" : "Ciclo con alertas";
    st.className = data.ok ? "status ok" : "status warn";
    document.getElementById("ultimo-ciclo").classList.remove("hidden");
    document.getElementById("ciclo-json").textContent = JSON.stringify(data, null, 2);
    await loadHub();
  } catch (e) {
    st.textContent = e.message;
    st.className = "status err";
  } finally {
    btn.disabled = false;
  }
};

loadHub().catch((e) => {
  document.getElementById("hub-stats").innerHTML = `<p class="status err">Servidor: ${e.message}. Ejecutá el backend.</p>`;
});
