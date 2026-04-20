const availability = {
  "Segunda, 20/04": ["08:00", "09:30", "11:00", "14:00", "15:30", "17:00"],
  "Terça, 21/04": ["08:30", "10:00", "13:00", "14:30", "16:00", "18:00"],
  "Quarta, 22/04": ["09:00", "10:30", "12:00", "15:00", "16:30"],
  "Quinta, 23/04": ["08:00", "09:00", "11:30", "13:30", "17:30"],
  "Sexta, 24/04": ["08:00", "10:00", "12:30", "14:00", "16:00", "18:30"],
  "Sábado, 25/04": ["09:00", "10:00", "11:00", "13:00", "14:00"]
};

const form = document.getElementById("booking-form");
const dateSelect = document.getElementById("date-select");
const serviceSelect = document.getElementById("service-select");
const timeSlots = document.getElementById("time-slots");
const summaryList = document.getElementById("summary-list");
const summaryMessage = document.getElementById("summary-message");
const whatsappLink = document.getElementById("whatsapp-link");

let selectedTime = "";

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

    if (index === availability[date].length - 1 && date.includes("Quinta")) {
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

  summaryMessage.textContent = hasEnoughData
    ? `${name}, seu atendimento de ${service} foi preparado para ${date} às ${selectedTime}.`
    : "Preencha o formulário para gerar sua mensagem de atendimento.";

  const text = encodeURIComponent(
    `Olá! Quero confirmar meu agendamento no Studio Bella Mãos.\n` +
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

dateSelect.addEventListener("change", (event) => {
  renderTimeSlots(event.target.value);
});

serviceSelect.addEventListener("change", updateSummary);
form.addEventListener("input", updateSummary);

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!selectedTime) {
    summaryMessage.textContent = "Selecione um horário antes de confirmar o agendamento.";
    return;
  }

  updateSummary();

  if (whatsappLink.getAttribute("aria-disabled") === "true") {
    return;
  }

  window.open(whatsappLink.href, "_blank", "noopener,noreferrer");
});

populateDates();
renderTimeSlots("");
