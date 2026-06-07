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
const editorService = document.getElementById("editor-service");
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
const servicesBoard = document.getElementById("services-board");
const serviceCreateForm = document.getElementById("service-create-form");
const tabButtons = document.querySelectorAll("[data-admin-tab]");
const tabPanels = document.querySelectorAll("[data-admin-panel]");

let selectedId = "";
let appointments = [];
let services = [];
let searchTimer = 0;
let selectedAvailabilityDate = "";
let isDatePickerOpen = false;

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

function activateAdminTab(tabName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.adminTab === tabName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.adminPanel === tabName;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
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

function getAvailabilityDateParts(dateLabel) {
  const [weekday = "", date = ""] = String(dateLabel || "").split(", ");
  const [day = "--", month = ""] = date.split("/");
  const monthNames = {
    "01": "jan.",
    "02": "fev.",
    "03": "mar.",
    "04": "abr.",
    "05": "mai.",
    "06": "jun.",
    "07": "jul.",
    "08": "ago.",
    "09": "set.",
    "10": "out.",
    "11": "nov.",
    "12": "dez."
  };

  return {
    weekday: weekday.slice(0, 3).toUpperCase(),
    day,
    month: monthNames[month] || month
  };
}

function getWeekdayColumn(dateLabel) {
  const [weekday = ""] = String(dateLabel || "").split(", ");
  const columns = {
    Domingo: 0,
    "Segunda-feira": 1,
    "Terca-feira": 2,
    "Quarta-feira": 3,
    "Quinta-feira": 4,
    "Sexta-feira": 5,
    Sabado: 6
  };

  return columns[weekday] || 0;
}

function renderAvailabilityDatePicker() {
  const selectedIndex = availabilityGroups.findIndex((dateGroup) => dateGroup.date === selectedAvailabilityDate);
  const monthGroups = [];

  availabilityGroups.forEach((dateGroup) => {
    const dateParts = getAvailabilityDateParts(dateGroup.date);
    const monthLabel = dateParts.month || "mes";
    let monthGroup = monthGroups.find((item) => item.month === monthLabel);

    if (!monthGroup) {
      monthGroup = { month: monthLabel, dates: [] };
      monthGroups.push(monthGroup);
    }

    monthGroup.dates.push(dateGroup);
  });

  return `
    <div class="availability-date-dialog ${isDatePickerOpen ? "open" : ""}" role="dialog" aria-modal="true" aria-label="Escolher data" ${isDatePickerOpen ? "" : "hidden"}>
      <div class="date-dialog-backdrop" data-close-date-picker></div>
      <div class="date-dialog-panel">
        <div class="date-dialog-heading">
          <div>
            <p class="eyebrow">Calendario</p>
            <h3>Escolha uma data</h3>
          </div>
          <button class="date-dialog-close" type="button" data-close-date-picker aria-label="Fechar calendario">&times;</button>
        </div>
        <div class="date-dialog-body">
          ${monthGroups.map((monthGroup) => `
            <section class="date-dialog-month">
              <h4>${escapeHtml(monthGroup.month)}</h4>
              <div class="date-dialog-weekdays" aria-hidden="true">
                <span>DOM</span>
                <span>SEG</span>
                <span>TER</span>
                <span>QUA</span>
                <span>QUI</span>
                <span>SEX</span>
                <span>SAB</span>
              </div>
              <div class="date-dialog-grid">
                ${Array.from({ length: getWeekdayColumn(monthGroup.dates[0]?.date) }).map(() => `
                  <span class="date-dialog-empty" aria-hidden="true"></span>
                `).join("")}
                ${monthGroup.dates.map((dateGroup) => {
                  const dateParts = getAvailabilityDateParts(dateGroup.date);
                  const isActive = dateGroup.date === selectedAvailabilityDate;

                  return `
                    <button
                      class="date-dialog-day ${isActive ? "active" : ""}"
                      type="button"
                      data-date="${escapeHtml(dateGroup.date)}"
                    >
                      <span>${escapeHtml(dateParts.weekday)}</span>
                      <strong>${escapeHtml(dateParts.day)}</strong>
                    </button>
                  `;
                }).join("")}
              </div>
            </section>
          `).join("")}
        </div>
        <div class="date-dialog-footer">
          <button class="secondary-button date-dialog-jump" type="button" data-date="${escapeHtml(availabilityGroups[Math.max(0, selectedIndex - 7)]?.date || selectedAvailabilityDate)}">Semana anterior</button>
          <button class="secondary-button date-dialog-jump" type="button" data-date="${escapeHtml(availabilityGroups[Math.min(availabilityGroups.length - 1, selectedIndex + 7)]?.date || selectedAvailabilityDate)}">Proxima semana</button>
        </div>
      </div>
    </div>
  `;
}

async function loadAvailability() {
  const result = await requestJson("/api/availability");
  availabilityGroups = result.availability || [];
  availability = {};

  availabilityGroups.forEach((dateGroup) => {
    availability[dateGroup.date] = dateGroup.slots || [];
  });

  if (!availability[selectedAvailabilityDate]) {
    selectedAvailabilityDate = availabilityGroups[0]?.date || "";
  }

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

  const selectedGroup = availabilityGroups.find((dateGroup) => dateGroup.date === selectedAvailabilityDate) || availabilityGroups[0];
  selectedAvailabilityDate = selectedGroup.date;
  const selectedSlots = selectedGroup.slots || [];
  const hasAvailableSlot = selectedSlots.some((slot) => slot.isAvailable);
  const dayToggleLabel = hasAvailableSlot ? "Desativar todos os horarios do dia" : "Ativar todos os horarios do dia";

  availabilityBoard.innerHTML = `
    <div class="availability-calendar">
      <div class="availability-calendar-section">
        <h3>Data</h3>
        <div class="availability-date-strip" role="listbox" aria-label="Datas disponiveis">
          ${availabilityGroups.map((dateGroup) => {
            const dateParts = getAvailabilityDateParts(dateGroup.date);
            const isActive = dateGroup.date === selectedAvailabilityDate;

            return `
              <button
                class="availability-date ${isActive ? "active" : ""}"
                type="button"
                data-date="${escapeHtml(dateGroup.date)}"
                role="option"
                aria-selected="${isActive ? "true" : "false"}"
              >
                <span>${escapeHtml(dateParts.weekday)}</span>
                <strong>${escapeHtml(dateParts.day)}</strong>
                <small>${escapeHtml(dateParts.month)}</small>
              </button>
            `;
          }).join("")}
        </div>
        <button class="calendar-picker-button" type="button" data-open-date-picker>
          Escolher data
        </button>
        <button
          class="day-availability-toggle ${hasAvailableSlot ? "is-on" : ""}"
          type="button"
          data-date="${escapeHtml(selectedAvailabilityDate)}"
          data-is-available="${hasAvailableSlot ? "false" : "true"}"
          aria-label="${dayToggleLabel}"
          aria-pressed="${hasAvailableSlot ? "true" : "false"}"
        >
          <span></span>
        </button>
        ${renderAvailabilityDatePicker()}
      </div>

      <div class="availability-calendar-section">
        <div class="availability-selected-day">
          <h3>Horario</h3>
          <span>${escapeHtml(selectedAvailabilityDate)}</span>
        </div>
        <div class="availability-slots">
          ${selectedSlots.map((slot) => `
            <button
              class="availability-slot ${slot.isAvailable ? "is-free" : "is-blocked"}"
              type="button"
              data-date="${escapeHtml(selectedGroup.date)}"
              data-time="${escapeHtml(slot.time)}"
              aria-pressed="${slot.isAvailable ? "true" : "false"}"
            >
              <strong>${escapeHtml(slot.time)}</strong>
              <span>${slot.isAvailable ? "Livre" : "Bloqueado"}</span>
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

async function toggleDayAvailability(button) {
  const date = button.dataset.date;
  const isAvailable = button.dataset.isAvailable === "true";

  button.disabled = true;

  try {
    await requestJson("/api/availability/day", {
      method: "POST",
      body: JSON.stringify({ date, isAvailable })
    });
    await loadAvailability();
    showToast(isAvailable ? "Todos os horarios do dia foram ativados." : "Todos os horarios do dia foram bloqueados.");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
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

async function loadServices() {
  if (!servicesBoard) {
    return;
  }

  servicesBoard.innerHTML = "<div class='empty-state'>Carregando servicos...</div>";

  try {
    const result = await requestJson("/api/services");
    services = result.services || [];
    renderAdminServiceOptions();
    renderServices();
  } catch (error) {
    servicesBoard.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderAdminServiceOptions(selectedService = editorService.value) {
  if (!editorService) {
    return;
  }

  const currentValue = selectedService || editorService.value;
  editorService.innerHTML = services
    .map((service) => `
      <option value="${escapeHtml(service.name)}">
        ${escapeHtml(service.name)}${service.isActive ? "" : " (inativo)"}
      </option>
    `)
    .join("");

  if (currentValue && !services.some((service) => service.name === currentValue)) {
    const option = document.createElement("option");
    option.value = currentValue;
    option.textContent = `${currentValue} (removido)`;
    editorService.appendChild(option);
  }

  if (currentValue) {
    editorService.value = currentValue;
  }
}

function renderServices() {
  if (!services.length) {
    servicesBoard.innerHTML = "<div class='empty-state'>Nenhum servico cadastrado.</div>";
    return;
  }

  servicesBoard.innerHTML = services
    .map((service) => {
      const durationMinutes = String(service.duration || "").replace(/\D/g, "") || "30";

      return `
      <form class="service-admin-card ${service.isActive ? "" : "is-disabled"}" data-id="${escapeHtml(service.id)}">
        <button class="service-delete-button" type="button" data-service-delete aria-label="Excluir servico">&times;</button>
        <div class="service-admin-header">
          <div>
            <strong>${escapeHtml(service.name)}</strong>
            <span>${service.isActive ? "Ativo no site" : "Inativo para clientes"}</span>
          </div>
          <button
            class="service-status-toggle ${service.isActive ? "is-on" : ""}"
            type="button"
            data-service-toggle
            aria-label="${service.isActive ? "Desativar servico" : "Ativar servico"}"
            aria-pressed="${service.isActive ? "true" : "false"}"
          >
            <span></span>
          </button>
        </div>
        <label>
          Nome
          <input type="text" name="name" value="${escapeHtml(service.name)}" required>
        </label>
        <div class="service-admin-row">
          <label>
            Valor em real
            <input type="text" name="price" value="${escapeHtml(service.price || "R$ ")}" placeholder="R$ 0">
          </label>
          <label>
            Duracao em minutos
            <input type="number" name="duration" value="${escapeHtml(durationMinutes)}" min="1" step="1">
          </label>
        </div>
        <label>
          Descricao
          <textarea name="description" rows="3">${escapeHtml(service.description)}</textarea>
        </label>
        <button class="secondary-button" type="submit">Salvar servico</button>
        <p class="editor-feedback" role="status"></p>
      </form>
    `;
    })
    .join("");
}

function getServiceFormPayload(form, isActive) {
  const formData = new FormData(form);
  const priceValue = formData.get("price").toString().trim();
  const durationValue = formData.get("duration").toString().trim();

  return {
    name: formData.get("name").toString().trim(),
    description: formData.get("description").toString().trim(),
    price: priceValue ? `R$ ${priceValue.replace(/[^\d,.]/g, "")}` : "",
    duration: durationValue ? `${durationValue.replace(/\D/g, "")} min` : "",
    isActive
  };
}

function notifyServicesUpdated() {
  try {
    window.localStorage.setItem("mnunes-services-updated", String(Date.now()));
  } catch (error) {
    return;
  }
}

async function createService(event) {
  event.preventDefault();

  const payload = getServiceFormPayload(serviceCreateForm, true);

  try {
    await requestJson("/api/services", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    serviceCreateForm.reset();
    await loadServices();
    notifyServicesUpdated();
    showToast("Servico adicionado.");
  } catch (error) {
    showToast(error.message);
  }
}

async function updateServiceCard(form, isActive) {
  const feedback = form.querySelector(".editor-feedback");
  const payload = getServiceFormPayload(form, isActive);

  try {
    feedback.textContent = "Salvando servico...";
    const result = await requestJson(`/api/services/${form.dataset.id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    const index = services.findIndex((service) => String(service.id) === String(result.service.id));

    if (index >= 0) {
      services[index] = result.service;
    }

    renderAdminServiceOptions();
    renderServices();
    notifyServicesUpdated();
    showToast("Servico atualizado.");
  } catch (error) {
    feedback.textContent = error.message;
    showToast(error.message);
  }
}

async function deleteServiceCard(button) {
  const form = button.closest(".service-admin-card");
  const service = services.find((item) => String(item.id) === String(form.dataset.id));
  const name = service?.name || "este servico";

  if (!window.confirm(`Excluir ${name}? Esta acao remove o servico do site.`)) {
    return;
  }

  try {
    await requestJson(`/api/services/${form.dataset.id}`, { method: "DELETE" });
    services = services.filter((item) => String(item.id) !== String(form.dataset.id));
    renderAdminServiceOptions();
    renderServices();
    notifyServicesUpdated();
    showToast("Servico excluido.");
  } catch (error) {
    showToast(error.message);
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
  renderAdminServiceOptions(appointment.service);

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
    await loadAvailability();
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
    await loadAvailability();
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
    await loadAvailability();
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

  if (!window.confirm(`Excluir ${label}? Se ele ainda nao estiver cancelado, o sistema vai pedir para cancelar antes.`)) {
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
    await loadAvailability();
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
  const openDatePicker = event.target.closest("[data-open-date-picker]");

  if (openDatePicker) {
    isDatePickerOpen = true;
    renderAvailability();
    return;
  }

  const closeDatePicker = event.target.closest("[data-close-date-picker]");

  if (closeDatePicker) {
    isDatePickerOpen = false;
    renderAvailability();
    return;
  }

  const calendarDay = event.target.closest(".date-dialog-day, .date-dialog-jump");

  if (calendarDay) {
    selectedAvailabilityDate = calendarDay.dataset.date;
    isDatePickerOpen = false;
    renderAvailability();
    return;
  }

  const dateButton = event.target.closest(".availability-date");

  if (dateButton) {
    selectedAvailabilityDate = dateButton.dataset.date;
    isDatePickerOpen = false;
    renderAvailability();
    return;
  }

  const dayToggle = event.target.closest(".day-availability-toggle");

  if (dayToggle) {
    toggleDayAvailability(dayToggle);
    return;
  }

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
serviceCreateForm.addEventListener("submit", createService);
servicesBoard.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target.closest(".service-admin-card");
  const service = services.find((item) => String(item.id) === String(form.dataset.id));
  updateServiceCard(form, service?.isActive ?? true);
});
servicesBoard.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-service-delete]");

  if (deleteButton) {
    deleteServiceCard(deleteButton);
    return;
  }

  const toggle = event.target.closest("[data-service-toggle]");

  if (!toggle) {
    return;
  }

  const form = toggle.closest(".service-admin-card");
  const service = services.find((item) => String(item.id) === String(form.dataset.id));
  updateServiceCard(form, !(service?.isActive ?? false));
});
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activateAdminTab(button.dataset.adminTab);
  });

  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();
    const tabs = Array.from(tabButtons);
    const currentIndex = tabs.indexOf(button);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    activateAdminTab(tabs[nextIndex].dataset.adminTab);
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isDatePickerOpen) {
    isDatePickerOpen = false;
    renderAvailability();
  }
});
logoutButton.addEventListener("click", async () => {
  await requestJson("/api/auth/logout", { method: "POST" });
  window.location.href = "admin-login.html";
});

activateAdminTab("agendamentos");
resetEditor();

loadSession().then(async (isAuthenticated) => {
  if (isAuthenticated) {
    await loadAvailability();
    await loadServices();
    loadAppointments();
    loadUsers();
  }
});
