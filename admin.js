const dailySlots = {
  1: ["08:00", "09:30", "11:00", "14:00", "15:30", "17:00"],
  2: ["08:30", "10:00", "13:00", "14:30", "16:00", "18:00"],
  3: ["09:00", "10:30", "12:00", "15:00", "16:30"],
  4: ["08:00", "09:00", "11:30", "13:30", "17:30"],
  5: ["08:00", "10:00", "12:30", "14:00", "16:00", "18:30"],
  6: ["09:00", "10:00", "11:00", "13:00", "14:00"]
};

const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
let availability = {};
let availabilityGroups = [];
let users = [];

const cardsContainer = document.getElementById("appointment-cards");
const editor = document.getElementById("appointment-editor");
const editorTitle = document.getElementById("editor-title");
const editorDate = document.getElementById("editor-date");
const editorTime = document.getElementById("editor-time");
const editorFeedback = document.getElementById("editor-feedback");
const duplicateButton = document.getElementById("duplicate-appointment");
const cancelButton = document.getElementById("cancel-appointment");
const deleteButton = document.getElementById("delete-appointment");
const searchInput = document.getElementById("appointment-search");
const statusFilter = document.getElementById("status-filter");
const dateFilter = document.getElementById("date-filter");
const metrics = document.getElementById("appointments-metrics");
const toast = document.getElementById("site-toast");
const logoutButton = document.getElementById("logout-button");
const sessionBadge = document.getElementById("session-badge");
const availabilityBoard = document.getElementById("availability-board");
const usersBoard = document.getElementById("users-board");

let selectedId = "";
let appointments = [];
let searchTimer = 0;

function buildAvailability() {
  const dates = {};
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (Object.keys(dates).length < 6) {
    const day = cursor.getDay();

    if (dailySlots[day]) {
      const weekday = weekdayFormatter.format(cursor);
      const label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${shortDateFormatter.format(cursor)}`;
      dates[label] = dailySlots[day];
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

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
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const result = await response.json();

  if (response.status === 401) {
    window.location.href = "admin-login.html";
    throw new Error("Login necessário.");
  }

  if (response.status === 403) {
    window.location.href = "agendamentos.html";
    throw new Error("Acesso não permitido.");
  }

  if (!response.ok) {
    throw new Error(result.error || "Não foi possível concluir a operação.");
  }

  return result;
}

async function loadSession() {
  const result = await requestJson("/api/auth/me");

  if (!result.authenticated) {
    window.location.href = "admin-login.html";
    return false;
  }

  if (result.session.role !== "admin") {
    window.location.href = "agendamentos.html";
    return false;
  }

  sessionBadge.textContent = `Admin · ${result.session.admin.name}`;
  return true;
}

function populateDateOptions(selectedDate = "") {
  const dates = Object.keys(availability);

  if (selectedDate && !dates.includes(selectedDate)) {
    dates.unshift(selectedDate);
  }

  editorDate.innerHTML = dates
    .map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`)
    .join("");
}

function populateDateFilter() {
  dateFilter.innerHTML = '<option value="">Todas as datas</option>';

  Object.keys(availability).forEach((date) => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = date;
    dateFilter.appendChild(option);
  });
}

function populateTimeOptions(date, selectedTime = "") {
  const slots = [...(availability[date] || [])]
    .filter((slot) => slot.isAvailable || slot.time === selectedTime)
    .map((slot) => slot.time || slot);

  if (selectedTime && !slots.includes(selectedTime)) {
    slots.unshift(selectedTime);
  }

  editorTime.innerHTML = slots
    .map((time) => `<option value="${escapeHtml(time)}">${escapeHtml(time)}</option>`)
    .join("");

  if (selectedTime) {
    editorTime.value = selectedTime;
  }
}

async function loadAvailability() {
  const result = await requestJson("/api/availability");
  availabilityGroups = result.availability || [];
  availability = {};

  availabilityGroups.forEach((dateGroup) => {
    availability[dateGroup.date] = dateGroup.slots || [];
  });

  populateDateOptions(editorDate.value);
  populateDateFilter();
  populateTimeOptions(editorDate.value || Object.keys(availability)[0]);
  renderAvailability();
}

function renderAvailability() {
  if (!availabilityBoard) {
    return;
  }

  if (!availabilityGroups.length) {
    availabilityBoard.innerHTML = "<div class='empty-state'>Nenhum horario encontrado.</div>";
    return;
  }

  availabilityBoard.innerHTML = availabilityGroups
    .map((dateGroup) => `
      <section class="availability-day">
        <h3>${escapeHtml(dateGroup.date)}</h3>
        <div class="availability-slots">
          ${(dateGroup.slots || []).map((slot) => `
            <button
              class="availability-slot ${slot.isAvailable ? "is-free" : "is-blocked"}"
              type="button"
              data-date="${escapeHtml(dateGroup.date)}"
              data-time="${escapeHtml(slot.time)}"
              aria-pressed="${slot.isAvailable ? "true" : "false"}"
            >
              <strong>${escapeHtml(slot.time)}</strong>
              <span>${slot.isAvailable ? "Livre" : "Bloqueado"}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `)
    .join("");
}

async function toggleAvailability(button) {
  const date = button.dataset.date;
  const time = button.dataset.time;
  const isAvailable = button.getAttribute("aria-pressed") !== "true";

  button.disabled = true;

  try {
    await requestJson("/api/availability", {
      method: "POST",
      body: JSON.stringify({ date, time, isAvailable })
    });
    await loadAvailability();
    showToast(isAvailable ? "Horario liberado." : "Horario bloqueado.");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function loadUsers() {
  if (!usersBoard) {
    return;
  }

  usersBoard.innerHTML = "<div class='empty-state'>Carregando usuarios...</div>";

  try {
    const result = await requestJson("/api/users");
    users = result.users || [];
    renderUsers();
  } catch (error) {
    usersBoard.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderUsers() {
  if (!users.length) {
    usersBoard.innerHTML = "<div class='empty-state'>Nenhum usuario cadastrado.</div>";
    return;
  }

  usersBoard.innerHTML = users
    .map((user) => `
      <form class="user-card" data-id="${escapeHtml(user.id)}">
        <div class="user-card-header">
          <strong>${escapeHtml(user.name)}</strong>
          <span>${Number(user.appointmentCount || 0)} agendamentos</span>
        </div>
        <label>
          Nome
          <input type="text" name="name" value="${escapeHtml(user.name)}" required>
        </label>
        <label>
          Telefone
          <input type="tel" name="phone" value="${escapeHtml(user.phone)}" required>
        </label>
        <label>
          WhatsApp
          <input type="tel" name="whatsapp" value="${escapeHtml(user.whatsapp || user.phone)}" required>
        </label>
        <div class="user-actions">
          <button class="secondary-button" type="submit">Salvar usuario</button>
          <button class="danger-button delete-user-button" type="button" data-id="${escapeHtml(user.id)}">Excluir usuario</button>
        </div>
        <p class="editor-feedback" role="status"></p>
      </form>
    `)
    .join("");
}

async function updateUser(event) {
  event.preventDefault();

  const form = event.target.closest(".user-card");
  const feedback = form.querySelector(".editor-feedback");
  const formData = new FormData(form);
  const payload = {
    name: formData.get("name").toString().trim(),
    phone: formData.get("phone").toString().trim(),
    whatsapp: formData.get("whatsapp").toString().trim()
  };

  try {
    feedback.textContent = "Salvando usuario...";
    const result = await requestJson(`/api/users/${form.dataset.id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    const index = users.findIndex((user) => String(user.id) === String(result.user.id));

    if (index >= 0) {
      users[index] = result.user;
    }

    renderUsers();
    showToast("Usuario atualizado.");
  } catch (error) {
    feedback.textContent = error.message;
    showToast(error.message);
  }
}

async function deleteUser(button) {
  const form = button.closest(".user-card");
  const user = users.find((item) => String(item.id) === String(button.dataset.id));
  const feedback = form.querySelector(".editor-feedback");
  const name = user?.name || "este usuario";

  if (!window.confirm(`Excluir ${name}? Todos os agendamentos deste usuario tambem serao removidos.`)) {
    return;
  }

  try {
    feedback.textContent = "Excluindo usuario...";
    await requestJson(`/api/users/${button.dataset.id}`, { method: "DELETE" });
    users = users.filter((item) => String(item.id) !== String(button.dataset.id));
    renderUsers();
    await loadAppointments();
    showToast("Usuario excluido.");
  } catch (error) {
    feedback.textContent = error.message;
    showToast(error.message);
  }
}

function buildAppointmentsUrl() {
  const params = new URLSearchParams();

  if (statusFilter.value) {
    params.set("status", statusFilter.value);
  }

  if (dateFilter.value) {
    params.set("date", dateFilter.value);
  }

  if (searchInput.value.trim()) {
    params.set("search", searchInput.value.trim());
  }

  return `/api/appointments${params.toString() ? `?${params.toString()}` : ""}`;
}

async function loadAppointments() {
  cardsContainer.innerHTML = "<div class='empty-state'>Carregando agendamentos...</div>";

  try {
    const result = await requestJson(buildAppointmentsUrl());
    appointments = result.appointments || [];
    renderAppointments();

    const selected = appointments.find((appointment) => appointment.id === selectedId) || appointments[0];

    if (selected) {
      fillEditor(selected);
    } else {
      resetEditor();
    }
  } catch (error) {
    cardsContainer.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    resetEditor();
  }
}

function renderMetrics() {
  const confirmed = appointments.filter((appointment) => appointment.status === "Confirmado").length;
  const changed = appointments.filter((appointment) => appointment.status === "Alterado").length;
  const canceled = appointments.filter((appointment) => appointment.status === "Cancelado").length;

  metrics.innerHTML = `
    <div>
      <strong>${appointments.length}</strong>
      <span>Total</span>
    </div>
    <div>
      <strong>${confirmed}</strong>
      <span>Confirmados</span>
    </div>
    <div>
      <strong>${changed}</strong>
      <span>Alterados</span>
    </div>
    <div>
      <strong>${canceled}</strong>
      <span>Cancelados</span>
    </div>
  `;
}

function renderAppointments() {
  renderMetrics();

  if (!appointments.length) {
    cardsContainer.innerHTML = `
      <div class="empty-state">
        Nenhum agendamento encontrado para os filtros atuais.
      </div>
    `;
    return;
  }

  cardsContainer.innerHTML = appointments
    .map((appointment) => {
      const dateParts = getDateParts(appointment.date);
      const notes = appointment.notes
        ? `<span class="appointment-note">${escapeHtml(appointment.notes)}</span>`
        : "";

      return `
        <article class="appointment-card ${appointment.id === selectedId ? "active" : ""}" role="button" tabindex="0" data-id="${escapeHtml(appointment.id)}" data-status="${escapeHtml(appointment.status)}">
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
    if (element.type !== "hidden") {
      element.disabled = isDisabled;
    }
  });
  duplicateButton.disabled = isDisabled;
  cancelButton.disabled = isDisabled;
  deleteButton.disabled = isDisabled;
}

function resetEditor() {
  selectedId = "";
  editor.reset();
  populateDateOptions();
  populateTimeOptions(Object.keys(availability)[0] || "");
  editorTitle.textContent = "Selecione um agendamento";
  editorFeedback.textContent = "";
  setEditorDisabled(true);
  renderMetrics();
}

function fillEditor(appointment) {
  selectedId = appointment.id;
  populateDateOptions(appointment.date);
  populateTimeOptions(appointment.date, appointment.time);

  editorTitle.textContent = `${appointment.service} às ${appointment.time}`;
  editor.elements.id.value = appointment.id;
  editor.elements.name.value = appointment.name;
  editor.elements.phone.value = appointment.phone;
  editor.elements.service.value = appointment.service;
  editor.elements.status.value = appointment.status;
  editor.elements.notes.value = appointment.notes || "";
  editorDate.value = appointment.date;
  editorTime.value = appointment.time;
  editorFeedback.textContent = "";
  setEditorDisabled(false);
  cancelButton.disabled = appointment.status === "Cancelado";
  deleteButton.disabled = false;
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
    name: formData.get("name").toString().trim(),
    phone: formData.get("phone").toString().trim(),
    service: formData.get("service").toString(),
    date: formData.get("date").toString(),
    time: formData.get("time").toString(),
    status: formData.get("status").toString(),
    notes: formData.get("notes").toString().trim()
  };

  try {
    editorFeedback.textContent = "Salvando alterações...";
    const result = await requestJson(`/api/appointments/${selectedId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    const index = appointments.findIndex((appointment) => appointment.id === selectedId);

    if (index >= 0) {
      appointments[index] = result.appointment;
    }

    fillEditor(result.appointment);
    editorFeedback.textContent = "Agendamento atualizado.";
    showToast("Agendamento atualizado.");
  } catch (error) {
    editorFeedback.textContent = error.message;
    showToast(error.message);
  }
}

async function duplicateAppointment() {
  if (!selectedId) {
    editorFeedback.textContent = "Selecione um agendamento para duplicar.";
    return;
  }

  try {
    editorFeedback.textContent = "Criando cópia...";
    const result = await requestJson(`/api/appointments/${selectedId}/duplicate`, {
      method: "POST"
    });
    appointments.unshift(result.appointment);
    fillEditor(result.appointment);
    editorFeedback.textContent = "Cópia criada como pendente.";
    showToast("Cópia criada como pendente.");
  } catch (error) {
    editorFeedback.textContent = error.message;
    showToast(error.message);
  }
}

async function cancelAppointment() {
  if (!selectedId) {
    editorFeedback.textContent = "Selecione um agendamento para cancelar.";
    return;
  }

  const current = appointments.find((appointment) => appointment.id === selectedId);

  if (current?.status === "Cancelado") {
    editorFeedback.textContent = "Este agendamento já está cancelado.";
    return;
  }

  try {
    editorFeedback.textContent = "Cancelando agendamento...";
    const result = await requestJson(`/api/appointments/${selectedId}/cancel`, {
      method: "POST"
    });
    const index = appointments.findIndex((appointment) => appointment.id === selectedId);

    if (index >= 0) {
      appointments[index] = result.appointment;
    }

    fillEditor(result.appointment);
    editorFeedback.textContent = "Agendamento cancelado.";
    showToast("Agendamento cancelado.");
  } catch (error) {
    editorFeedback.textContent = error.message;
    showToast(error.message);
  }
}

async function deleteAppointment() {
  if (!selectedId) {
    editorFeedback.textContent = "Selecione um agendamento para excluir.";
    return;
  }

  const current = appointments.find((appointment) => appointment.id === selectedId);
  const label = current ? `${current.service} de ${current.name}` : "este agendamento";

  if (!window.confirm(`Excluir ${label}? Esta acao nao pode ser desfeita.`)) {
    return;
  }

  try {
    editorFeedback.textContent = "Excluindo agendamento...";
    await requestJson(`/api/appointments/${selectedId}`, { method: "DELETE" });
    appointments = appointments.filter((appointment) => appointment.id !== selectedId);
    selectedId = "";
    renderAppointments();
    resetEditor();
    await loadUsers();
    showToast("Agendamento excluido.");
  } catch (error) {
    editorFeedback.textContent = error.message;
    showToast(error.message);
  }
}

function selectCard(card) {
  const appointment = appointments.find((item) => item.id === card.dataset.id);

  if (appointment) {
    fillEditor(appointment);
  }
}

cardsContainer.addEventListener("click", (event) => {
  const card = event.target.closest(".appointment-card");

  if (card) {
    selectCard(card);
  }
});

cardsContainer.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const card = event.target.closest(".appointment-card");

  if (!card) {
    return;
  }

  event.preventDefault();
  selectCard(card);
});

editorDate.addEventListener("change", () => {
  populateTimeOptions(editorDate.value);
});

statusFilter.addEventListener("change", loadAppointments);
dateFilter.addEventListener("change", loadAppointments);
searchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadAppointments, 220);
});
editor.addEventListener("submit", updateAppointment);
duplicateButton.addEventListener("click", duplicateAppointment);
cancelButton.addEventListener("click", cancelAppointment);
deleteButton.addEventListener("click", deleteAppointment);
availabilityBoard.addEventListener("click", (event) => {
  const button = event.target.closest(".availability-slot");

  if (button) {
    toggleAvailability(button);
  }
});
usersBoard.addEventListener("submit", updateUser);
usersBoard.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-user-button");

  if (button) {
    deleteUser(button);
  }
});
logoutButton.addEventListener("click", async () => {
  await requestJson("/api/auth/logout", { method: "POST" });
  window.location.href = "admin-login.html";
});

resetEditor();

loadSession().then(async (isAuthenticated) => {
  if (isAuthenticated) {
    await loadAvailability();
    loadAppointments();
    loadUsers();
  }
});
