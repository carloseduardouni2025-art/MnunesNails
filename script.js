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

const form = document.getElementById("booking-form");
const dateSelect = document.getElementById("date-select");
const serviceSelect = document.getElementById("service-select");
const timeSlots = document.getElementById("time-slots");
const summaryList = document.getElementById("summary-list");
const summaryMessage = document.getElementById("summary-message");
const whatsappLink = document.getElementById("whatsapp-link");
const submitButton = form.querySelector(".form-submit");
const serviceCards = document.querySelectorAll(".service-card[data-service]");
const bookingSteps = document.querySelectorAll(".booking-step");
const toast = document.getElementById("site-toast");

let selectedTime = "";
let lastSavedSignature = "";
let isSaving = false;

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

function populateDates() {
  Object.keys(availability).forEach((date) => {
    const option = document.createElement("option");
    option.value = date;
    option.textContent = date;
    dateSelect.appendChild(option);
  });
}

function renderTimeSlots(date) {
  timeSlots.innerHTML = "";
  selectedTime = "";

  if (!date || !availability[date]) {
    timeSlots.innerHTML = "<p class='empty-state'>Escolha um dia para ver os horários.</p>";
    updateSummary();
    return;
  }

  availability[date].forEach((time, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-slot";
    button.textContent = time;

    if (index === availability[date].length - 1 && date.startsWith("Quinta")) {
      button.disabled = true;
      button.textContent = `${time} indisponível`;
    }

    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }

      document.querySelectorAll(".time-slot").forEach((slot) => slot.classList.remove("active"));
      button.classList.add("active");
      selectedTime = time;
      updateSummary();
    });

    timeSlots.appendChild(button);
  });

  updateSummary();
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
    throw new Error(result.error || "Não foi possível salvar o agendamento.");
  }

  lastSavedSignature = signature;
  setSavingState(false);
  return result.appointment;
}

dateSelect.addEventListener("change", (event) => {
  renderTimeSlots(event.target.value);
});

serviceSelect.addEventListener("change", updateSummary);
form.addEventListener("input", updateSummary);

serviceCards.forEach((card) => {
  const selectService = () => {
    serviceSelect.value = card.dataset.service;
    updateSummary();
    document.getElementById("agendamento").scrollIntoView({ behavior: "smooth", block: "start" });
    dateSelect.focus({ preventScroll: true });
  };

  card.querySelector(".service-select-button")?.addEventListener("click", selectService);
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

  try {
    summaryMessage.textContent = "Salvando agendamento no banco de dados...";
    await saveAppointment();
    updateSummary();
    showToast("Agendamento salvo no banco de dados.");
    window.open(whatsappLink.href, "_blank", "noopener,noreferrer");
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

  try {
    summaryMessage.textContent = "Salvando agendamento no banco de dados...";
    await saveAppointment();
    updateSummary();
    showToast("Agendamento salvo no banco de dados.");
    window.open(whatsappLink.href, "_blank", "noopener,noreferrer");
  } catch (error) {
    setSavingState(false);
    summaryMessage.textContent = error.message;
    showToast(error.message);
  }
});

populateDates();
renderTimeSlots("");
