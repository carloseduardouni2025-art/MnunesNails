let availabilityData = [];
let servicesData = [];

const cardsContainer = document.getElementById("appointment-cards");
const editor = document.getElementById("appointment-editor");
const editorTitle = document.getElementById("editor-title");
const editorDate = document.getElementById("editor-date");
const editorTime = document.getElementById("editor-time");
const editorFeedback = document.getElementById("editor-feedback");
const duplicateButton = document.getElementById("duplicate-appointment");
const cancelButton = document.getElementById("cancel-appointment");
const searchInput = document.getElementById("appointment-search");
const statusFilter = document.getElementById("status-filter");
const metrics = document.getElementById("appointments-metrics");
const toast = document.getElementById("site-toast");
const logoutButton = document.getElementById("logout-button");
const sessionBadge = document.getElementById("session-badge");
const params = new URLSearchParams(window.location.search);

let selectedId = params.get("appointment") ? Number(params.get("appointment")) : null;
let appointments = [];
let currentUser = null;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStatusClass(status) {
  const statusClasses = {
    Confirmado: "status-confirmado",
    Alterado: "status-alterado",
    Pendente: "status-pendente",
    Cancelado: "status-cancelado"
  };
  return statusClasses[status] || "status-pendente";
}

function getDateParts(dateLabel) {
  const [weekday = "Dia", date = dateLabel || "--/--"] = String(dateLabel || "").split(", ");
  return { weekday, date };
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

async function loadSession() {
  if (!getToken()) {
    window.location.href = "login.html";
    return false;
  }

  try {
    const user = await apiFetch("/api/auth/me");

    if (!user || !user.id) {
      window.location.href = "login.html";
      return false;
    }

    if (user.role === "admin") {
      window.location.href = "admin.html";
      return false;
    }

    currentUser = user;
    if (sessionBadge) sessionBadge.textContent = `Cliente · ${currentUser.name || currentUser.phone}`;
    return true;
  } catch {
    window.location.href = "login.html";
    return false;
  }
}

async function loadAppointments() {
  cardsContainer.innerHTML = "<div class='empty-state'>Carregando agendamentos...</div>";

  try {
    const result = await apiFetch("/api/appointments");
    appointments = result.appointments || [];
    renderAppointments();

    const selected = appointments.find((a) => a.id === selectedId) || appointments[0];

    if (selected) {
      fillEditor(selected);
    } else {
      resetEditor();
    }
  } catch (error) {
    cardsContainer.innerHTML = `<div class="empty-state">${escapeHtml(error?.message || "Erro ao carregar agendamentos.")}</div>`;
    resetEditor();
  }
}

function populateDateOptions(selectedDate = "") {
  const dates = availabilityData
    .filter((group) => group.slots.some((s) => s.isAvailable))
    .map((group) => group.date);

  if (selectedDate && !dates.includes(selectedDate)) {
    dates.unshift(selectedDate);
  }

  editorDate.innerHTML = dates
    .map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`)
    .join("");
}

function populateTimeOptions(date, selectedTime = "") {
  const group = availabilityData.find((g) => g.date === date);
  const slots = group ? group.slots.filter((s) => s.isAvailable).map((s) => s.time) : [];

  if (selectedTime && !slots.includes(selectedTime)) {
    slots.unshift(selectedTime);
  }

  editorTime.innerHTML = slots
    .map((time) => `<option value="${escapeHtml(time)}">${escapeHtml(time)}</option>`)
    .join("");

  if (selectedTime) editorTime.value = selectedTime;
}

function populateServiceOptions(selectedService = "") {
  const editorService = document.getElementById("editor-service");
  if (!editorService) return;
  editorService.innerHTML = servicesData
    .filter((s) => s.isActive !== false)
    .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`)
    .join("");
  if (selectedService) editorService.value = selectedService;
}

function getFilteredAppointments() {
  const filter = statusFilter.value;
  const searchTerm = searchInput.value.trim().toLowerCase();
  let filtered = appointments;

  if (filter !== "Todos") {
    filtered = filtered.filter((a) => a.status === filter);
  }

  if (!searchTerm) return filtered;

  return filtered.filter((a) =>
    [a.name, a.phone, a.service, a.date, a.status].join(" ").toLowerCase().includes(searchTerm)
  );
}

function renderMetrics() {
  const confirmed = appointments.filter((a) => a.status === "Confirmado").length;
  const changed = appointments.filter((a) => a.status === "Alterado").length;
  const canceled = appointments.filter((a) => a.status === "Cancelado").length;

  metrics.innerHTML = `
    <div><strong>${appointments.length}</strong><span>Total</span></div>
    <div><strong>${confirmed}</strong><span>Confirmados</span></div>
    <div><strong>${changed}</strong><span>Alterados</span></div>
    <div><strong>${canceled}</strong><span>Cancelados</span></div>
  `;
}

function renderAppointments() {
  const filtered = getFilteredAppointments();
  renderMetrics();

  if (!filtered.length) {
    cardsContainer.innerHTML = `<div class="empty-state">Nenhum agendamento encontrado. Crie um novo horário para ele aparecer aqui.</div>`;
    return;
  }

  cardsContainer.innerHTML = filtered
    .map((appointment) => {
      const dateParts = getDateParts(appointment.date);
      const notes = appointment.notes
        ? `<span class="appointment-note">${escapeHtml(appointment.notes)}</span>`
        : "";

      return `
        <article class="appointment-card ${appointment.id === selectedId ? "active" : ""}" role="button" tabindex="0" data-id="${appointment.id}" data-status="${escapeHtml(appointment.status)}">
          <span class="appointment-date-badge">
            <strong>${escapeHtml(dateParts.date)}</strong>
            <span>${escapeHtml(dateParts.weekday)}</span>
          </span>
          <span class="appointment-card-body">
            <span class="appointment-card-top">
              <span class="status-pill ${getStatusClass(appointment.status)}">${escapeHtml(appointment.status)}</span>
              <span class="appointment-time">${escapeHtml(appointment.time)}</span>
            </span>
            <strong class="appointment-service">${escapeHtml(appointment.service)}</strong>
            <span class="appointment-client">${escapeHtml(appointment.name)}</span>
            <span class="appointment-contact">${escapeHtml(appointment.phone)}</span>
            ${notes}
          </span>
        </article>
      `;
    })
    .join("");
}

function setEditorDisabled(isDisabled) {
  Array.from(editor.elements).forEach((element) => {
    if (element.type !== "hidden") element.disabled = isDisabled;
  });
  duplicateButton.disabled = isDisabled;
  cancelButton.disabled = isDisabled;
}

function resetEditor() {
  selectedId = null;
  editor.reset();
  populateServiceOptions();
  populateDateOptions();
  const firstDate = availabilityData.find((g) => g.slots.some((s) => s.isAvailable))?.date || "";
  populateTimeOptions(firstDate);
  editorTitle.textContent = "Selecione um agendamento";
  editorFeedback.textContent = "";
  setEditorDisabled(true);
  renderMetrics();
}

function fillEditor(appointment) {
  selectedId = appointment.id;
  populateServiceOptions(appointment.service);
  populateDateOptions(appointment.date);
  populateTimeOptions(appointment.date, appointment.time);

  editorTitle.textContent = `${appointment.service} às ${appointment.time}`;
  editor.elements.id.value = appointment.id;
  editor.elements.name.value = appointment.name;
  editor.elements.phone.value = appointment.phone;
  editor.elements.status.value = appointment.status;
  editor.elements.notes.value = appointment.notes || "";
  editorDate.value = appointment.date;
  editorTime.value = appointment.time;
  editorFeedback.textContent = "";
  setEditorDisabled(false);
  cancelButton.disabled = appointment.status === "Cancelado";
  renderAppointments();
}

async function updateAppointment(event) {
  event.preventDefault();

  if (!selectedId) {
    editorFeedback.textContent = "Selecione um agendamento para editar.";
    return;
  }

  const formData = new FormData(editor);
  const payload = {
    date: formData.get("date").toString(),
    time: formData.get("time").toString(),
    status: formData.get("status").toString(),
    notes: formData.get("notes").toString().trim()
  };

  try {
    editorFeedback.textContent = "Salvando alterações...";
    const result = await apiFetch(`/api/appointments/${selectedId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    const index = appointments.findIndex((a) => a.id === selectedId);
    if (index >= 0) appointments[index] = result.appointment;
    fillEditor(result.appointment);
    editorFeedback.textContent = "Agendamento atualizado.";
    showToast("Agendamento atualizado.");
  } catch (error) {
    editorFeedback.textContent = error?.message || "Erro ao atualizar agendamento.";
    showToast(error?.message || "Erro ao atualizar agendamento.");
  }
}

async function duplicateAppointment() {
  if (!selectedId) {
    editorFeedback.textContent = "Selecione um agendamento para duplicar.";
    return;
  }

  try {
    editorFeedback.textContent = "Criando cópia...";
    const result = await apiFetch(`/api/appointments/${selectedId}/duplicate`, { method: "POST" });
    appointments.unshift(result.appointment);
    fillEditor(result.appointment);
    editorFeedback.textContent = "Cópia criada como pendente.";
    showToast("Cópia criada como pendente.");
  } catch (error) {
    editorFeedback.textContent = error?.message || "Erro ao duplicar agendamento.";
    showToast(error?.message || "Erro ao duplicar agendamento.");
  }
}

async function cancelAppointment() {
  if (!selectedId) {
    editorFeedback.textContent = "Selecione um agendamento para cancelar.";
    return;
  }

  const current = appointments.find((a) => a.id === selectedId);

  if (current?.status === "Cancelado") {
    editorFeedback.textContent = "Este agendamento já está cancelado.";
    return;
  }

  try {
    editorFeedback.textContent = "Cancelando agendamento...";
    const result = await apiFetch(`/api/appointments/${selectedId}/cancel`, { method: "POST" });
    const index = appointments.findIndex((a) => a.id === selectedId);
    if (index >= 0) appointments[index] = result.appointment;
    fillEditor(result.appointment);
    editorFeedback.textContent = "Agendamento cancelado.";
    showToast("Agendamento cancelado.");
  } catch (error) {
    editorFeedback.textContent = error?.message || "Erro ao cancelar agendamento.";
    showToast(error?.message || "Erro ao cancelar agendamento.");
  }
}

cardsContainer.addEventListener("click", (event) => {
  const card = event.target.closest(".appointment-card");
  if (!card) return;
  const appointment = appointments.find((a) => a.id === Number(card.dataset.id));
  if (appointment) fillEditor(appointment);
});

cardsContainer.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".appointment-card");
  if (!card) return;
  event.preventDefault();
  const appointment = appointments.find((a) => a.id === Number(card.dataset.id));
  if (appointment) fillEditor(appointment);
});

editorDate.addEventListener("change", () => populateTimeOptions(editorDate.value));
statusFilter.addEventListener("change", renderAppointments);
searchInput.addEventListener("input", renderAppointments);
editor.addEventListener("submit", updateAppointment);
duplicateButton.addEventListener("click", duplicateAppointment);
cancelButton.addEventListener("click", cancelAppointment);

logoutButton.addEventListener("click", async () => {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {
    // ignore logout errors
  }
  localStorage.removeItem("authToken");
  window.location.href = "login.html";
});

async function loadAvailability() {
  try {
    const result = await apiFetch("/api/availability");
    availabilityData = result.availability || [];
  } catch {
    availabilityData = [];
  }
}

async function loadServices() {
  try {
    const result = await apiFetch("/api/services");
    servicesData = result.services || [];
  } catch {
    servicesData = [];
  }
}

loadSession().then(async (isAuthenticated) => {
  if (isAuthenticated) {
    await Promise.all([loadAvailability(), loadServices()]);
    resetEditor();
    loadAppointments();
  }
});
