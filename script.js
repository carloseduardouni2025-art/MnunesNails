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

const form = document.getElementById("booking-form");
const dateSelect = document.getElementById("date-select");
const datePickerTrigger = document.getElementById("date-picker-trigger");
const serviceSelect = document.getElementById("service-select");
const servicesGrid = document.getElementById("service-grid");
const timeSlots = document.getElementById("time-slots");
const summaryList = document.getElementById("summary-list");
const summaryMessage = document.getElementById("summary-message");
const whatsappLink = document.getElementById("whatsapp-link");
const submitButton = form.querySelector(".form-submit");
let serviceCards = document.querySelectorAll(".service-card[data-service]");
const bookingSteps = document.querySelectorAll(".booking-step");
const toast = document.getElementById("site-toast");
const BOOKING_DRAFT_KEY = "mnunes-booking-draft";

let selectedTime = "";
let lastSavedSignature = "";
let isSaving = false;
let currentUser = null;
let servicesSignature = "";
let isBookingDatePickerOpen = false;

function storeBookingDraft() {
  sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(getAppointmentPayload()));
}

function clearBookingDraft() {
  sessionStorage.removeItem(BOOKING_DRAFT_KEY);
}

function redirectToRegister() {
  storeBookingDraft();
  showToast("Crie seu cadastro para confirmar o agendamento.");
  window.location.href = "login.html?mode=register&next=booking";
}

function requireAuthenticatedUser() {
  if (currentUser) {
    return true;
  }

  redirectToRegister();
  return false;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function populateDates() {
  dateSelect.innerHTML = '<option value="">Escolha uma data</option>';

  Object.keys(availability).forEach((date) => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = date;
    dateSelect.appendChild(option);
  });

  updateDatePickerTrigger();
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

function updateDatePickerTrigger() {
  datePickerTrigger.textContent = dateSelect.value || "Escolha uma data";
  datePickerTrigger.classList.toggle("has-value", Boolean(dateSelect.value));
}

function renderBookingDatePicker() {
  document.querySelector(".booking-date-dialog")?.remove();

  if (!isBookingDatePickerOpen) {
    return;
  }

  const dates = Object.keys(availability);
  const monthGroups = [];

  dates.forEach((dateLabel) => {
    const dateParts = getAvailabilityDateParts(dateLabel);
    const monthLabel = dateParts.month || "mes";
    let monthGroup = monthGroups.find((item) => item.month === monthLabel);

    if (!monthGroup) {
      monthGroup = { month: monthLabel, dates: [] };
      monthGroups.push(monthGroup);
    }

    monthGroup.dates.push(dateLabel);
  });

  const dialog = document.createElement("div");
  dialog.className = "availability-date-dialog booking-date-dialog open";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Escolher data do agendamento");
  dialog.innerHTML = `
    <div class="date-dialog-backdrop" data-close-booking-date-picker></div>
    <div class="date-dialog-panel">
      <div class="date-dialog-heading">
        <div>
          <p class="eyebrow">Calendario</p>
          <h3>Escolha uma data</h3>
        </div>
        <button class="date-dialog-close" type="button" data-close-booking-date-picker aria-label="Fechar calendario">&times;</button>
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
              ${Array.from({ length: getWeekdayColumn(monthGroup.dates[0]) }).map(() => `
                <span class="date-dialog-empty" aria-hidden="true"></span>
              `).join("")}
              ${monthGroup.dates.map((dateLabel) => {
                const dateParts = getAvailabilityDateParts(dateLabel);
                const isActive = dateLabel === dateSelect.value;

                return `
                  <button
                    class="date-dialog-day ${isActive ? "active" : ""}"
                    type="button"
                    data-booking-date="${escapeHtml(dateLabel)}"
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
    </div>
  `;
  document.body.appendChild(dialog);
}

function closeBookingDatePicker() {
  isBookingDatePickerOpen = false;
  renderBookingDatePicker();
}

function renderServices(services) {
  const selectedService = serviceSelect.value;
  servicesGrid.dataset.count = String(services.length);

  if (!services.length) {
    servicesGrid.innerHTML = "<div class='empty-state'>Nenhum servico disponivel no momento.</div>";
    serviceSelect.innerHTML = '<option value="">Nenhum servico disponivel</option>';
    updateSummary();
    return;
  }

  const maxAppointments = Math.max(...services.map((service) => Number(service.appointmentCount || 0)));
  const mostBookedIndex = maxAppointments > 0
    ? services.findIndex((service) => Number(service.appointmentCount || 0) === maxAppointments)
    : 0;

  servicesGrid.innerHTML = services
    .map((service, index) => `
      <article class="service-card ${index === mostBookedIndex ? "featured" : ""}" data-service="${escapeHtml(service.name)}">
        ${index === mostBookedIndex ? '<p class="service-tag">Mais pedido</p>' : ""}
        <h3>${escapeHtml(service.name)}</h3>
        <p>${escapeHtml(service.description || "Atendimento personalizado para cuidar das suas unhas.")}</p>
        <div class="service-meta">
          <strong>${escapeHtml(service.price || "Consultar")}</strong>
          <span>${escapeHtml(service.duration || "Sob medida")}</span>
        </div>
        <button class="service-select-button" type="button">Selecionar</button>
      </article>
    `)
    .join("");

  serviceSelect.innerHTML = '<option value="">Selecione um servico</option>';
  services.forEach((service) => {
    const option = document.createElement("option");
    option.value = service.name;
    option.textContent = service.name;
    serviceSelect.appendChild(option);
  });

  if (selectedService && services.some((service) => service.name === selectedService)) {
    serviceSelect.value = selectedService;
  }

  serviceCards = document.querySelectorAll(".service-card[data-service]");
  updateSummary();
}

async function loadServices({ silent = false } = {}) {
  if (!servicesGrid) {
    return;
  }

  try {
    const response = await fetch("/api/services");
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Nao foi possivel carregar os servicos.");
    }

    const services = result.services || [];
    const nextSignature = JSON.stringify(
      services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        price: service.price,
        duration: service.duration,
        appointmentCount: service.appointmentCount
      }))
    );

    if (nextSignature !== servicesSignature) {
      servicesSignature = nextSignature;
      renderServices(services);
    }
  } catch (error) {
    if (!silent) {
      showToast(error.message);
    }
  }
}

function renderTimeSlots(date) {
  timeSlots.innerHTML = "";
  selectedTime = "";

  if (!date || !availability[date]) {
    timeSlots.innerHTML = "<p class='empty-state'>Escolha um dia para ver os horários.</p>";
    updateSummary();
    return;
  }

  availability[date].forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-slot";
    button.textContent = slot.time;

    if (!slot.isAvailable) {
      button.disabled = true;
      button.textContent = `${slot.time} indisponivel`;
    }

    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }

      document.querySelectorAll(".time-slot").forEach((slot) => slot.classList.remove("active"));
      button.classList.add("active");
      selectedTime = slot.time;
      updateSummary();
    });

    timeSlots.appendChild(button);
  });

  updateSummary();
}

function selectTimeSlot(time) {
  if (!time) {
    return;
  }

  const buttons = document.querySelectorAll(".time-slot");
  buttons.forEach((button) => {
    const isSelected = button.textContent.trim() === time;
    button.classList.toggle("active", isSelected && !button.disabled);

    if (isSelected && !button.disabled) {
      selectedTime = time;
    }
  });

  updateSummary();
}

function restoreBookingDraft() {
  const rawDraft = sessionStorage.getItem(BOOKING_DRAFT_KEY);

  if (!rawDraft) {
    return;
  }

  let draft;

  try {
    draft = JSON.parse(rawDraft);
  } catch (error) {
    clearBookingDraft();
    return;
  }

  if (!currentUser) {
    return;
  }

  form.elements.service.value = draft.service || "";
  form.elements.notes.value = draft.notes || "";

  if (draft.date && availability[draft.date]) {
    dateSelect.value = draft.date;
    updateDatePickerTrigger();
    renderTimeSlots(draft.date);
    selectTimeSlot(draft.time);
  }

  clearBookingDraft();
  showToast("Cadastro concluido. Revise e confirme seu agendamento.");
  document.getElementById("agendamento").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadAvailability() {
  try {
    const response = await fetch("/api/availability");
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Nao foi possivel carregar os horarios.");
    }

    availability = {};
    (result.availability || []).forEach((dateGroup) => {
      const freeSlots = dateGroup.slots.filter((slot) => slot.isAvailable);

      if (freeSlots.length) {
        availability[dateGroup.date] = freeSlots;
      }
    });

    const previousDate = dateSelect.value;
    populateDates();
    if (previousDate && availability[previousDate]) {
      dateSelect.value = previousDate;
      updateDatePickerTrigger();
      renderTimeSlots(previousDate);
    } else {
      dateSelect.value = "";
      updateDatePickerTrigger();
      renderTimeSlots("");
    }
  } catch (error) {
    timeSlots.innerHTML = `<p class='empty-state'>${error.message}</p>`;
  }
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

async function loadCurrentUser() {
  try {
    const response = await fetch("/api/auth/me");
    const result = await response.json();

    if (!response.ok || !result.authenticated || result.session?.role !== "user") {
      return;
    }

    currentUser = result.session.user;
    form.elements.name.value = currentUser.name || "";
    form.elements.phone.value = currentUser.whatsapp || currentUser.phone || "";
    form.elements.name.readOnly = true;
    form.elements.phone.readOnly = true;
    form.elements.name.closest("label")?.classList.add("field-prefilled");
    form.elements.phone.closest("label")?.classList.add("field-prefilled");
    updateSummary();
  } catch (error) {
    currentUser = null;
  }
}

function setSavingState(isActive) {
  isSaving = isActive;
  submitButton.disabled = isActive;
  whatsappLink.setAttribute("aria-busy", isActive ? "true" : "false");

  if (isActive) {
    submitButton.textContent = "Salvando...";
  } else {
    submitButton.textContent = "Confirmar agendamento";
  }
}

function updateBookingSteps(hasInfo, hasService, hasTime) {
  bookingSteps.forEach((step) => {
    const stepName = step.dataset.step;
    const isDone =
      (stepName === "info" && hasInfo) ||
      (stepName === "service" && hasService) ||
      (stepName === "time" && hasTime);

    step.classList.toggle("done", isDone);
    step.classList.remove("active");
  });

  const activeStep = !hasInfo ? "info" : !hasService ? "service" : "time";
  document.querySelector(`.booking-step[data-step="${activeStep}"]`)?.classList.add("active");
}

function updateSelectedServiceCard(service) {
  serviceCards.forEach((card) => {
    card.classList.toggle("selected", card.dataset.service === service);
  });
}

function updateSummary() {
  const formData = new FormData(form);
  const name = formData.get("name")?.toString().trim() || "-";
  const phone = formData.get("phone")?.toString().trim() || "-";
  const service = formData.get("service")?.toString().trim() || "-";
  const date = formData.get("date")?.toString().trim() || "-";
  const notes = formData.get("notes")?.toString().trim() || "Sem observações.";

  summaryList.innerHTML = `
    <div><span>Serviço</span><strong>${service}</strong></div>
    <div><span>Dia</span><strong>${date}</strong></div>
    <div><span>Horário</span><strong>${selectedTime || "-"}</strong></div>
    <div><span>Contato</span><strong>${phone}</strong></div>
  `;

  const hasEnoughData = name !== "-" && phone !== "-" && service !== "-" && date !== "-" && selectedTime;
  const hasInfo = name !== "-" && phone !== "-";
  const hasService = service !== "-";
  const hasTime = date !== "-" && Boolean(selectedTime);

  updateBookingSteps(hasInfo, hasService, hasTime);
  updateSelectedServiceCard(service);

  summaryMessage.textContent = hasEnoughData
    ? `${name}, seu atendimento de ${service} foi preparado para ${date} às ${selectedTime}.`
    : "Preencha o formulário para gerar sua mensagem de atendimento.";

  const text = encodeURIComponent(
    `Olá! Quero confirmar meu agendamento no Studio MNunesnails.\n` +
    `Nome: ${name}\n` +
    `WhatsApp: ${phone}\n` +
    `Serviço: ${service}\n` +
    `Data: ${date}\n` +
    `Horário: ${selectedTime || "-"}\n` +
    `Observações: ${notes}`
  );

  whatsappLink.href = hasEnoughData ? `https://wa.me/5511999999999?text=${text}` : "#";
  whatsappLink.setAttribute("aria-disabled", hasEnoughData ? "false" : "true");
}

function getAppointmentPayload() {
  const formData = new FormData(form);
  return {
    name: formData.get("name").toString().trim(),
    phone: formData.get("phone").toString().trim(),
    service: formData.get("service").toString().trim(),
    date: formData.get("date").toString().trim(),
    time: selectedTime,
    notes: formData.get("notes").toString().trim()
  };
}

async function saveAppointment() {
  if (isSaving) {
    return;
  }

  const appointment = getAppointmentPayload();
  const signature = `${appointment.name}|${appointment.phone}|${appointment.service}|${appointment.date}|${appointment.time}|${appointment.notes}`;

  if (signature === lastSavedSignature) {
    return;
  }

  setSavingState(true);

  const response = await fetch("/api/appointments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(appointment)
  });

  const result = await response.json();

  if (!response.ok) {
    setSavingState(false);
    if (response.status === 401) {
      redirectToRegister();
      return null;
    }
    throw new Error(result.error || "Não foi possível salvar o agendamento.");
  }

  lastSavedSignature = signature;
  setSavingState(false);
  return result.appointment;
}

function askToOpenWhatsapp() {
  const wantsToSend = window.confirm("Agendamento salvo. Gostaria de enviar a mensagem pelo WhatsApp?");

  if (wantsToSend) {
    window.open(whatsappLink.href, "_blank", "noopener,noreferrer");
    return;
  }

  showToast("Agendamento salvo sem enviar mensagem pelo WhatsApp.");
}

dateSelect.addEventListener("change", (event) => {
  renderTimeSlots(event.target.value);
  updateDatePickerTrigger();
});

serviceSelect.addEventListener("change", updateSummary);
form.addEventListener("input", updateSummary);

datePickerTrigger.addEventListener("click", () => {
  isBookingDatePickerOpen = true;
  renderBookingDatePicker();
});

document.addEventListener("click", (event) => {
  const selectedDate = event.target.closest("[data-booking-date]");

  if (selectedDate) {
    dateSelect.value = selectedDate.dataset.bookingDate;
    renderTimeSlots(dateSelect.value);
    updateDatePickerTrigger();
    closeBookingDatePicker();
    return;
  }

  if (event.target.closest("[data-close-booking-date-picker]")) {
    closeBookingDatePicker();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isBookingDatePickerOpen) {
    closeBookingDatePicker();
  }
});

servicesGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".service-select-button");
  const card = event.target.closest(".service-card[data-service]");

  if (!button || !card) {
    return;
  }

  serviceSelect.value = card.dataset.service;
  updateSummary();
  document.getElementById("agendamento").scrollIntoView({ behavior: "smooth", block: "start" });
  dateSelect.focus({ preventScroll: true });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSaving) {
    return;
  }

  if (!selectedTime) {
    summaryMessage.textContent = "Selecione um horário antes de confirmar o agendamento.";
    return;
  }

  updateSummary();

  if (whatsappLink.getAttribute("aria-disabled") === "true") {
    return;
  }

  if (!requireAuthenticatedUser()) {
    return;
  }

  try {
    summaryMessage.textContent = "Salvando agendamento no banco de dados...";
    await saveAppointment();
    updateSummary();
    showToast("Agendamento salvo no banco de dados.");
    askToOpenWhatsapp();
    await loadAvailability();
  } catch (error) {
    setSavingState(false);
    summaryMessage.textContent = error.message;
    showToast(error.message);
  }
});

whatsappLink.addEventListener("click", async (event) => {
  if (isSaving) {
    event.preventDefault();
    return;
  }

  if (whatsappLink.getAttribute("aria-disabled") === "true") {
    event.preventDefault();
    return;
  }

  event.preventDefault();

  if (!requireAuthenticatedUser()) {
    return;
  }

  try {
    summaryMessage.textContent = "Salvando agendamento no banco de dados...";
    await saveAppointment();
    updateSummary();
    showToast("Agendamento salvo no banco de dados.");
    askToOpenWhatsapp();
    await loadAvailability();
  } catch (error) {
    setSavingState(false);
    summaryMessage.textContent = error.message;
    showToast(error.message);
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === "mnunes-services-updated") {
    loadServices({ silent: true });
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    loadServices({ silent: true });
  }
});

window.setInterval(() => {
  if (!document.hidden) {
    loadServices({ silent: true });
  }
}, 8000);

async function initializePage() {
  await loadServices();
  await loadAvailability();
  await loadCurrentUser();
  restoreBookingDraft();
}

initializePage();
