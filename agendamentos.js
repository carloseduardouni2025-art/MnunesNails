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
const availability = buildAvailability();

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

let selectedId = "";
let appointments = [];

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
  return {
    weekday,
    date
  };
}

function showToast(message) {
  if (!toast) {
    return;
  }

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

  if (!response.ok) {
    throw new Error(result.error || "Não foi possível concluir a operação.");
  }

  return result;
}

async function loadAppointments() {
  cardsContainer.innerHTML = "<div class='empty-state'>Carregando agendamentos...</div>";

  try {
    const result = await requestJson("/api/appointments");
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

function populateDateOptions(selectedDate = "") {
  const dates = Object.keys(availability);

  if (selectedDate && !dates.includes(selectedDate)) {
    dates.unshift(selectedDate);
  }

  editorDate.innerHTML = dates
    .map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`)
    .join("");
}

function populateTimeOptions(date, selectedTime = "") {
  const slots = [...(availability[date] || [])];

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

function getFilteredAppointments() {
  const filter = statusFilter.value;
  const searchTerm = searchInput.value.trim().toLowerCase();
  let filteredAppointments = appointments;

  if (filter !== "Todos") {
    filteredAppointments = filteredAppointments.filter((appointment) => appointment.status === filter);
  }

  if (!searchTerm) {
    return filteredAppointments;
  }

  return filteredAppointments.filter((appointment) => {
    const searchable = [
      appointment.name,
      appointment.phone,
      appointment.service,
      appointment.date,
      appointment.status
    ].join(" ").toLowerCase();

    return searchable.includes(searchTerm);
  });
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
  const filteredAppointments = getFilteredAppointments();
  renderMetrics();

  if (!filteredAppointments.length) {
    cardsContainer.innerHTML = `
      <div class="empty-state">
        Nenhum agendamento encontrado. Crie um novo horário para ele aparecer aqui.
      </div>
    `;
    return;
  }

  cardsContainer.innerHTML = filteredAppointments
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
}

function resetEditor() {
  selectedId = "";
  editor.reset();
  populateDateOptions();
  populateTimeOptions(Object.keys(availability)[0]);
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

cardsContainer.addEventListener("click", (event) => {
  const card = event.target.closest(".appointment-card");

  if (!card) {
    return;
  }

  const appointment = appointments.find((item) => item.id === card.dataset.id);

  if (appointment) {
    fillEditor(appointment);
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
  const appointment = appointments.find((item) => item.id === card.dataset.id);

  if (appointment) {
    fillEditor(appointment);
  }
});

editorDate.addEventListener("change", () => {
  populateTimeOptions(editorDate.value);
});

statusFilter.addEventListener("change", renderAppointments);
searchInput.addEventListener("input", renderAppointments);
editor.addEventListener("submit", updateAppointment);
duplicateButton.addEventListener("click", duplicateAppointment);
cancelButton.addEventListener("click", cancelAppointment);

populateDateOptions();
populateTimeOptions(Object.keys(availability)[0]);
resetEditor();
loadAppointments();
