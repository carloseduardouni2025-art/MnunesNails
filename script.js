let servicesDurationByName = {};

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
let servicesById = {};
let calendarCurrentDate = new Date();

const CALENDAR_DAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const CALENDAR_DAYS_LONG = ["Domingo", "Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sabado"];
const CALENDAR_MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const SLOTS_START_MINUTES = 7 * 60;
const SLOTS_END_MINUTES = 19 * 60;

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
  if (currentUser) return true;
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

function parseDuration(durationStr) {
  const match = String(durationStr || "").match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 30;
}

function generateTimeSlots(durationMinutes) {
  const slots = [];
  for (let m = SLOTS_START_MINUTES; m <= SLOTS_END_MINUTES; m += durationMinutes) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${h}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}

function getDateLabel(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${CALENDAR_DAYS_LONG[date.getDay()]}, ${day}/${month}/${year}`;
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function updateDatePickerTrigger() {
  datePickerTrigger.textContent = dateSelect.value || "Escolha uma data";
  datePickerTrigger.classList.toggle("has-value", Boolean(dateSelect.value));
}

function renderBookingDatePicker() {
  document.querySelector(".booking-date-dialog")?.remove();

  if (!isBookingDatePickerOpen) return;

  const weekStart = getWeekStart(calendarCurrentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthYear = `${CALENDAR_MONTHS[calendarCurrentDate.getMonth()]} ${calendarCurrentDate.getFullYear()}`;

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
        <div class="date-dialog-week-nav">
          <button class="date-dialog-nav-today" type="button" data-calendar-today>Hoje</button>
          <button class="date-dialog-nav-arrow" type="button" data-calendar-prev>&lt;</button>
          <span class="date-dialog-nav-month">${escapeHtml(monthYear)}</span>
          <button class="date-dialog-nav-arrow" type="button" data-calendar-next>&gt;</button>
        </div>
        <div class="date-dialog-grid">
          ${weekDays.map((date) => {
            const dateLabel = getDateLabel(date);
            const isActive = dateLabel === dateSelect.value;
            const isToday = date.getTime() === today.getTime();
            return `
              <button
                class="date-dialog-day${isActive ? " active" : ""}${isToday ? " today" : ""}"
                type="button"
                data-booking-date="${escapeHtml(dateLabel)}"
              >
                <span>${CALENDAR_DAYS_SHORT[date.getDay()]}</span>
                <strong>${date.getDate()}</strong>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);
}

function closeBookingDatePicker() {
  isBookingDatePickerOpen = false;
  renderBookingDatePicker();
}

async function renderTimeSlotsForDate() {
  timeSlots.innerHTML = "";
  selectedTime = "";

  if (!dateSelect.value) {
    timeSlots.innerHTML = "<p class='empty-state'>Escolha um dia para ver os horários.</p>";
    updateSummary();
    return;
  }

  if (!serviceSelect.value) {
    timeSlots.innerHTML = "<p class='empty-state'>Selecione um serviço para ver os horários.</p>";
    updateSummary();
    return;
  }

  timeSlots.innerHTML = "<p class='empty-state'>Carregando horários...</p>";

  let takenTimes = [];
  try {
    const result = await apiFetch(`/api/appointments/taken?date=${encodeURIComponent(dateSelect.value)}`);
    takenTimes = result.takenTimes || [];
  } catch (err) {
    console.error("[horários] falha ao buscar horários ocupados:", err);
  }

  const duration = servicesDurationByName[serviceSelect.value] || 30;
  const availableSlots = generateTimeSlots(duration).filter((time) => !takenTimes.includes(time));

  timeSlots.innerHTML = "";

  if (!availableSlots.length) {
    timeSlots.innerHTML = "<p class='empty-state'>Nenhum horário disponível neste dia.</p>";
    updateSummary();
    return;
  }

  availableSlots.forEach((time) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-slot";
    button.textContent = time;
    button.addEventListener("click", () => {
      document.querySelectorAll(".time-slot").forEach((s) => s.classList.remove("active"));
      button.classList.add("active");
      selectedTime = time;
      updateSummary();
    });
    timeSlots.appendChild(button);
  });

  updateSummary();
}

function renderServices(services) {
  const selectedService = serviceSelect.value;
  servicesById = {};
  servicesDurationByName = {};
  servicesGrid.dataset.count = String(services.length);

  if (!services.length) {
    servicesGrid.innerHTML = "<div class='empty-state'>Nenhum servico disponivel no momento.</div>";
    serviceSelect.innerHTML = '<option value="">Nenhum servico disponivel</option>';
    updateSummary();
    return;
  }

  const activeServices = services.filter((s) => s.isActive !== false);
  const maxAppointments = Math.max(...activeServices.map((service) => Number(service.appointmentCount || 0)));
  const mostBookedIndex = maxAppointments > 0
    ? activeServices.findIndex((service) => Number(service.appointmentCount || 0) === maxAppointments)
    : 0;

  servicesGrid.innerHTML = activeServices
    .map((service, index) => {
      servicesById[service.name] = service.id;
      servicesDurationByName[service.name] = parseDuration(service.duration);
      return `
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
      `;
    })
    .join("");

  serviceSelect.innerHTML = '<option value="">Selecione um servico</option>';
  activeServices.forEach((service) => {
    const option = document.createElement("option");
    option.value = service.name;
    option.textContent = service.name;
    serviceSelect.appendChild(option);
  });

  if (selectedService && activeServices.some((service) => service.name === selectedService)) {
    serviceSelect.value = selectedService;
  }

  serviceCards = document.querySelectorAll(".service-card[data-service]");
  updateSummary();
}

async function loadServices({ silent = false } = {}) {
  if (!servicesGrid) return;

  try {
    const result = await apiFetch("/api/services");
    const services = result.services || [];
    const nextSignature = JSON.stringify(services.map((s) => s.id));

    if (nextSignature !== servicesSignature) {
      servicesSignature = nextSignature;
      renderServices(services);
    }
  } catch (error) {
    if (!silent) showToast(error?.message || "Nao foi possivel carregar os servicos.");
  }
}

function selectTimeSlot(time) {
  if (!time) return;

  const buttons = document.querySelectorAll(".time-slot");
  buttons.forEach((button) => {
    const isSelected = button.textContent.trim() === time;
    button.classList.toggle("active", isSelected && !button.disabled);
    if (isSelected && !button.disabled) selectedTime = time;
  });

  updateSummary();
}

async function restoreBookingDraft() {
  const rawDraft = sessionStorage.getItem(BOOKING_DRAFT_KEY);
  if (!rawDraft) return;

  let draft;
  try {
    draft = JSON.parse(rawDraft);
  } catch {
    clearBookingDraft();
    return;
  }

  if (!currentUser) return;

  form.elements.service.value = draft.service || "";
  form.elements.notes.value = draft.notes || "";

  if (draft.date) {
    dateSelect.value = draft.date;
    updateDatePickerTrigger();
    await renderTimeSlotsForDate();
    selectTimeSlot(draft.time);
  }

  clearBookingDraft();
  showToast("Cadastro concluido. Revise e confirme seu agendamento.");
  document.getElementById("agendamento").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

async function loadCurrentUser() {
  if (!getToken()) {
    currentUser = null;
    return;
  }

  try {
    const user = await apiFetch("/api/auth/me");

    if (!user || !user.id) {
      currentUser = null;
      return;
    }

    currentUser = user;
    form.elements.name.value = currentUser.name || "";
    form.elements.phone.value = currentUser.phone || "";
    form.elements.name.readOnly = true;
    form.elements.phone.readOnly = true;
    form.elements.name.closest("label")?.classList.add("field-prefilled");
    form.elements.phone.closest("label")?.classList.add("field-prefilled");
    updateSummary();
  } catch {
    currentUser = null;
  }
}

function setSavingState(isActive) {
  isSaving = isActive;
  submitButton.disabled = isActive;
  whatsappLink.setAttribute("aria-busy", isActive ? "true" : "false");
  submitButton.textContent = isActive ? "Salvando..." : "Confirmar agendamento";
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
    `Nome: ${name}\nWhatsApp: ${phone}\nServiço: ${service}\n` +
    `Data: ${date}\nHorário: ${selectedTime || "-"}\nObservações: ${notes}`
  );

  whatsappLink.href = `https://wa.me/?text=${text}`;
  whatsappLink.setAttribute("aria-disabled", hasEnoughData ? "false" : "true");
}

function getAppointmentPayload() {
  const formData = new FormData(form);
  const serviceName = formData.get("service").toString().trim();
  return {
    name: formData.get("name").toString().trim(),
    phone: formData.get("phone").toString().trim(),
    service: serviceName,
    service_id: servicesById[serviceName] || null,
    date: formData.get("date").toString().trim(),
    time: selectedTime,
    notes: formData.get("notes").toString().trim()
  };
}

async function saveAppointment() {
  if (isSaving) return;

  const appointment = getAppointmentPayload();
  const signature = `${appointment.service}|${appointment.date}|${appointment.time}|${appointment.notes}`;

  if (signature === lastSavedSignature) return;

  setSavingState(true);

  try {
    const result = await apiFetch("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        dia: appointment.date,
        hora: appointment.time,
        service_id: appointment.service_id,
        notas: appointment.notes,
      }),
    });

    lastSavedSignature = signature;
    setSavingState(false);
    return result.appointment;
  } catch (error) {
    setSavingState(false);
    if (error?.message?.includes("401") || String(error).includes("401")) {
      redirectToRegister();
      return null;
    }
    const err = new Error(error?.message || "Não foi possível salvar o agendamento.");
    if (error?.message === "Horário já está agendado") err.conflict = true;
    throw err;
  }
}

function redirectToAppointments(appointment) {
  const params = appointment?.id ? `?appointment=${encodeURIComponent(appointment.id)}` : "";
  window.location.href = `agendamentos.html${params}`;
}

serviceSelect.addEventListener("change", () => {
  updateSummary();
  if (dateSelect.value) renderTimeSlotsForDate();
});

form.addEventListener("input", updateSummary);

datePickerTrigger.addEventListener("click", () => {
  isBookingDatePickerOpen = true;
  renderBookingDatePicker();
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-calendar-today]")) {
    calendarCurrentDate = new Date();
    renderBookingDatePicker();
    return;
  }

  if (event.target.closest("[data-calendar-prev]")) {
    calendarCurrentDate = new Date(calendarCurrentDate);
    calendarCurrentDate.setDate(calendarCurrentDate.getDate() - 7);
    renderBookingDatePicker();
    return;
  }

  if (event.target.closest("[data-calendar-next]")) {
    calendarCurrentDate = new Date(calendarCurrentDate);
    calendarCurrentDate.setDate(calendarCurrentDate.getDate() + 7);
    renderBookingDatePicker();
    return;
  }

  const selectedDate = event.target.closest("[data-booking-date]");
  if (selectedDate) {
    dateSelect.value = selectedDate.dataset.bookingDate;
    updateDatePickerTrigger();
    closeBookingDatePicker();
    renderTimeSlotsForDate();
    return;
  }

  if (event.target.closest("[data-close-booking-date-picker]")) {
    closeBookingDatePicker();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isBookingDatePickerOpen) closeBookingDatePicker();
});

servicesGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".service-select-button");
  const card = event.target.closest(".service-card[data-service]");
  if (!button || !card) return;

  serviceSelect.value = card.dataset.service;
  updateSummary();
  document.getElementById("agendamento").scrollIntoView({ behavior: "smooth", block: "start" });
  datePickerTrigger.focus({ preventScroll: true });
});

async function handleSubmit(event) {
  event.preventDefault();
  if (isSaving) return;

  if (!selectedTime) {
    summaryMessage.textContent = "Selecione um horário antes de confirmar o agendamento.";
    return;
  }

  updateSummary();

  if (whatsappLink.getAttribute("aria-disabled") === "true") return;
  if (!requireAuthenticatedUser()) return;

  try {
    summaryMessage.textContent = "Salvando agendamento no banco de dados...";
    const appointment = await saveAppointment();
    updateSummary();
    showToast("Agendamento salvo no banco de dados.");
    redirectToAppointments(appointment);
  } catch (error) {
    setSavingState(false);
    summaryMessage.textContent = error.message;
    showToast(error.message);
    if (error.conflict) renderTimeSlotsForDate();
  }
}

form.addEventListener("submit", handleSubmit);

whatsappLink.addEventListener("click", async (event) => {
  if (isSaving) { event.preventDefault(); return; }
  if (whatsappLink.getAttribute("aria-disabled") === "true") { event.preventDefault(); return; }
  event.preventDefault();
  if (!requireAuthenticatedUser()) return;

  try {
    summaryMessage.textContent = "Salvando agendamento no banco de dados...";
    const appointment = await saveAppointment();
    updateSummary();
    showToast("Agendamento salvo no banco de dados.");
    redirectToAppointments(appointment);
  } catch (error) {
    setSavingState(false);
    summaryMessage.textContent = error.message;
    showToast(error.message);
    if (error.conflict) renderTimeSlotsForDate();
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === "mnunes-services-updated") loadServices({ silent: true });
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadServices({ silent: true });
});

window.setInterval(() => {
  if (!document.hidden) loadServices({ silent: true });
}, 8000);

async function initializePage() {
  await loadServices();
  await loadCurrentUser();
  timeSlots.innerHTML = "<p class='empty-state'>Escolha um dia para ver os horários.</p>";
  await restoreBookingDraft();
}

initializePage();
