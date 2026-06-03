const clientForm = document.getElementById("client-login-form");
const clientRegisterForm = document.getElementById("client-register-form");
const adminForm = document.getElementById("admin-login-form");
const clientFeedback = document.getElementById("client-login-feedback");
const clientRegisterFeedback = document.getElementById("client-register-feedback");
const adminFeedback = document.getElementById("admin-login-feedback");
const toast = document.getElementById("site-toast");
const showRegisterButton = document.getElementById("show-register-button");
const showLoginButton = document.getElementById("show-login-button");
const passwordToggleButtons = document.querySelectorAll("[data-password-toggle]");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

function formPayload(form) {
  const formData = new FormData(form);
  const payload = {};

  formData.forEach((value, key) => {
    payload[key] = key === "password" ? value.toString() : value.toString().trim();
  });

  return payload;
}

function registerPayload() {
  const payload = formPayload(clientRegisterForm);
  payload.phone = payload.whatsapp;
  return payload;
}

function showClientRegister() {
  clientForm.hidden = true;
  clientRegisterForm.hidden = false;
  clientRegisterFeedback.textContent = "";
  clientRegisterForm.querySelector("input")?.focus();
}

function showClientLogin() {
  clientRegisterForm.hidden = true;
  clientForm.hidden = false;
  clientFeedback.textContent = "";
  clientForm.querySelector("input")?.focus();
}

function togglePasswordVisibility(event) {
  const button = event.currentTarget;
  const input = button.closest(".password-field")?.querySelector("input");

  if (!input) {
    return;
  }

  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  button.textContent = shouldShow ? "Ocultar" : "Ver";
  button.setAttribute("aria-label", shouldShow ? "Ocultar senha" : "Mostrar senha");
}

async function requestJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Não foi possível entrar.");
  }

  return result;
}

async function submitClientLogin(event) {
  event.preventDefault();
  clientFeedback.textContent = "Entrando...";

  try {
    await requestJson("/api/auth/login", formPayload(clientForm));
    showToast("Acesso liberado.");
    window.location.href = "agendamentos.html";
  } catch (error) {
    clientFeedback.textContent = error.message;
    showToast(error.message);
  }
}

async function submitClientRegister(event) {
  event.preventDefault();
  clientRegisterFeedback.textContent = "Criando cadastro...";

  try {
    await requestJson("/api/auth/register", registerPayload());
    showToast("Cadastro criado.");
    window.location.href = "agendamentos.html";
  } catch (error) {
    clientRegisterFeedback.textContent = error.message;
    showToast(error.message);
  }
}

async function submitAdminLogin(event) {
  event.preventDefault();
  adminFeedback.textContent = "Entrando...";

  try {
    await requestJson("/api/auth/admin-login", formPayload(adminForm));
    showToast("Acesso administrativo liberado.");
    window.location.href = "admin.html";
  } catch (error) {
    adminFeedback.textContent = error.message;
    showToast(error.message);
  }
}

if (clientForm) {
  clientForm.addEventListener("submit", submitClientLogin);
}

if (clientRegisterForm) {
  clientRegisterForm.addEventListener("submit", submitClientRegister);
}

if (showRegisterButton && clientForm && clientRegisterForm) {
  showRegisterButton.addEventListener("click", showClientRegister);
}

if (showLoginButton && clientForm && clientRegisterForm) {
  showLoginButton.addEventListener("click", showClientLogin);
}

passwordToggleButtons.forEach((button) => {
  button.addEventListener("click", togglePasswordVisibility);
});

if (adminForm) {
  adminForm.addEventListener("submit", submitAdminLogin);
}
