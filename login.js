const clientForm = document.getElementById("client-login-form");
const clientRegisterForm = document.getElementById("client-register-form");
const clientRecoverForm = document.getElementById("client-recover-form");
const adminForm = document.getElementById("admin-login-form");
const clientFeedback = document.getElementById("client-login-feedback");
const clientRegisterFeedback = document.getElementById("client-register-feedback");
const clientRecoverFeedback = document.getElementById("client-recover-feedback");
const adminFeedback = document.getElementById("admin-login-feedback");
const toast = document.getElementById("site-toast");
const showRegisterButton = document.getElementById("show-register-button");
const showLoginButton = document.getElementById("show-login-button");
const showRecoverButton = document.getElementById("show-recover-button");
const showLoginFromRecoverButton = document.getElementById("show-login-from-recover-button");
const passwordToggleButtons = document.querySelectorAll("[data-password-toggle]");
const params = new URLSearchParams(window.location.search);

function nextUrl() {
  return params.get("next") === "booking" ? "index.html#agendamento" : "agendamentos.html";
}

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

function recoverPayload() {
  const payload = formPayload(clientRecoverForm);

  if (payload.password !== payload.confirmPassword) {
    throw new Error("As senhas nao conferem.");
  }

  delete payload.confirmPassword;
  return payload;
}

function hideClientForms() {
  if (clientForm) {
    clientForm.hidden = true;
  }

  if (clientRegisterForm) {
    clientRegisterForm.hidden = true;
  }

  if (clientRecoverForm) {
    clientRecoverForm.hidden = true;
  }
}

function showClientRegister() {
  hideClientForms();
  clientRegisterForm.hidden = false;
  clientRegisterFeedback.textContent = "";
  clientRegisterForm.querySelector("input")?.focus();
}

function showClientLogin() {
  hideClientForms();
  clientForm.hidden = false;
  clientFeedback.textContent = "";
  clientForm.querySelector("input")?.focus();
}

function showClientRecover() {
  hideClientForms();
  clientRecoverForm.hidden = false;
  clientRecoverFeedback.textContent = "";
  clientRecoverForm.querySelector("input")?.focus();
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
    window.location.href = nextUrl();
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
    window.location.href = nextUrl();
  } catch (error) {
    clientRegisterFeedback.textContent = error.message;
    showToast(error.message);
  }
}

async function submitPasswordRecovery(event) {
  event.preventDefault();
  clientRecoverFeedback.textContent = "Atualizando senha...";

  try {
    await requestJson("/api/auth/recover-password", recoverPayload());
    showToast("Senha atualizada. Entre com a nova senha.");
    showClientLogin();
    clientForm.elements.phone.value = clientRecoverForm.elements.phone.value;
  } catch (error) {
    clientRecoverFeedback.textContent = error.message;
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

if (clientRecoverForm) {
  clientRecoverForm.addEventListener("submit", submitPasswordRecovery);
}

if (showRegisterButton && clientForm && clientRegisterForm) {
  showRegisterButton.addEventListener("click", showClientRegister);
}

if (showLoginButton && clientForm && clientRegisterForm) {
  showLoginButton.addEventListener("click", showClientLogin);
}

if (showRecoverButton && clientRecoverForm) {
  showRecoverButton.addEventListener("click", showClientRecover);
}

if (showLoginFromRecoverButton && clientForm) {
  showLoginFromRecoverButton.addEventListener("click", showClientLogin);
}

passwordToggleButtons.forEach((button) => {
  button.addEventListener("click", togglePasswordVisibility);
});

if (adminForm) {
  adminForm.addEventListener("submit", submitAdminLogin);
}

if (params.get("mode") === "register" && clientRegisterForm) {
  showClientRegister();
}
