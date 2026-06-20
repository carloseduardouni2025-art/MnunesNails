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
const sendRecoveryCodeButton = document.getElementById("send-recovery-code-button");
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

function friendlyErrorMessage(error, fallback = "Nao foi possivel concluir a solicitacao.") {
  const message = error?.message || fallback;

  if (message.includes("Unexpected end of JSON input")) {
    return "O servidor nao retornou resposta. Recarregue a pagina e tente novamente.";
  }

  return message;
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
  if (payload.password !== payload.confirmPassword) {
    throw new Error("As senhas nao conferem.");
  }
  delete payload.confirmPassword;
  return payload;
}

function recoverPayload() {
  const payload = formPayload(clientRecoverForm);

  if (payload.password !== payload.confirmPassword) {
    throw new Error("As senhas nao conferem.");
  }

  if (!payload.smsCode) {
    throw new Error("Informe o codigo de recuperacao recebido.");
  }

  return {
    phone: payload.phone,
    token: payload.smsCode,
    newPassword: payload.password,
  };
}

function hideClientForms() {
  if (clientForm) clientForm.hidden = true;
  if (clientRegisterForm) clientRegisterForm.hidden = true;
  if (clientRecoverForm) clientRecoverForm.hidden = true;
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

  if (!input) return;

  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  button.textContent = shouldShow ? "Ocultar" : "Ver";
  button.setAttribute("aria-label", shouldShow ? "Ocultar senha" : "Mostrar senha");
}

async function sendRecoveryCode() {
  if (!clientRecoverForm) return;

  const phone = clientRecoverForm.elements.phone.value.trim();
  if (!phone) {
    clientRecoverFeedback.textContent = "Informe o telefone cadastrado.";
    return;
  }

  sendRecoveryCodeButton.disabled = true;
  clientRecoverFeedback.textContent = "Enviando codigo...";

  try {
    await apiFetch("/api/auth/request-recovery", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
    clientRecoverFeedback.textContent = "Codigo enviado. Verifique seu WhatsApp e preencha abaixo.";
    showToast("Codigo enviado.");
    clientRecoverForm.elements.smsCode?.focus();
  } catch (error) {
    clientRecoverFeedback.textContent = friendlyErrorMessage(error, "Nao foi possivel enviar o codigo.");
    showToast(clientRecoverFeedback.textContent);
  } finally {
    sendRecoveryCodeButton.disabled = false;
  }
}

async function submitClientLogin(event) {
  event.preventDefault();
  clientFeedback.textContent = "Entrando...";

  try {
    const result = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(formPayload(clientForm)),
    });
    localStorage.setItem("authToken", result.token);
    showToast("Acesso liberado.");
    window.location.href = nextUrl();
  } catch (error) {
    clientFeedback.textContent = friendlyErrorMessage(error);
    showToast(clientFeedback.textContent);
  }
}

async function submitClientRegister(event) {
  event.preventDefault();
  clientRegisterFeedback.textContent = "Criando cadastro...";

  try {
    const payload = registerPayload();
    const result = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    localStorage.setItem("authToken", result.token);
    showToast("Cadastro criado.");
    window.location.href = nextUrl();
  } catch (error) {
    clientRegisterFeedback.textContent = friendlyErrorMessage(error);
    showToast(clientRegisterFeedback.textContent);
  }
}

async function submitPasswordRecovery(event) {
  event.preventDefault();
  clientRecoverFeedback.textContent = "Atualizando senha...";

  try {
    const payload = recoverPayload();
    await apiFetch("/api/auth/recover-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    showToast("Senha atualizada. Entre com a nova senha.");
    showClientLogin();
    clientForm.elements.phone.value = payload.phone;
  } catch (error) {
    clientRecoverFeedback.textContent = friendlyErrorMessage(error);
    showToast(clientRecoverFeedback.textContent);
  }
}

async function submitAdminLogin(event) {
  event.preventDefault();
  adminFeedback.textContent = "Entrando...";

  try {
    const result = await apiFetch("/api/auth/admin-login", {
      method: "POST",
      body: JSON.stringify(formPayload(adminForm)),
    });
    localStorage.setItem("authToken", result.token);
    showToast("Acesso administrativo liberado.");
    window.location.href = "admin.html";
  } catch (error) {
    adminFeedback.textContent = friendlyErrorMessage(error);
    showToast(adminFeedback.textContent);
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

if (sendRecoveryCodeButton) {
  sendRecoveryCodeButton.addEventListener("click", sendRecoveryCode);
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
