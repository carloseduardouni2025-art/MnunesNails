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
let firebaseAuth = null;
let firebaseAuthSdk = null;
let recoveryRecaptcha = null;
let recoveryConfirmation = null;
let recoveryIdToken = "";

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
    return "O servidor nao retornou resposta. Abra o site pelo servidor Python do projeto e tente novamente.";
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
  payload.phone = payload.whatsapp;
  return payload;
}

function recoverPayload() {
  const payload = formPayload(clientRecoverForm);

  if (payload.password !== payload.confirmPassword) {
    throw new Error("As senhas nao conferem.");
  }

  if (!recoveryIdToken) {
    throw new Error("Confirme o codigo SMS antes de atualizar a senha.");
  }

  delete payload.confirmPassword;
  delete payload.smsCode;
  payload.firebaseIdToken = recoveryIdToken;
  return payload;
}

function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function phoneToE164(phone) {
  const digits = normalizePhoneDigits(phone);

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  throw new Error("Informe um celular valido com DDD.");
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
  recoveryIdToken = "";
  recoveryConfirmation = null;
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
  const result = await readJsonResponse(response);

  if (!response.ok && result.error) {
    throw new Error(result.error);
  }

  if (!response.ok) {
    throw new Error("Nao foi possivel concluir a solicitacao.");
  }
  return result;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("Content-Type") || "";
  const isJson = contentType.toLowerCase().includes("application/json");
  const body = await response.text();

  if (!body.trim()) {
    throw new Error("O servidor nao retornou resposta. Confirme se o site esta aberto pelo servidor Python do projeto.");
  }

  if (!isJson) {
    throw new Error("Abra o site pelo servidor Python do projeto para usar login, cadastro e recuperacao de senha.");
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error("O servidor retornou uma resposta invalida. Recarregue a pagina e tente novamente.");
  }
}

async function loadFirebaseAuth() {
  if (firebaseAuth && firebaseAuthSdk) {
    return { auth: firebaseAuth, sdk: firebaseAuthSdk };
  }

  const response = await fetch("/api/firebase-config");
  const result = await readJsonResponse(response);

  if (!response.ok || !result.enabled) {
    const missing = Array.isArray(result.missing) && result.missing.length
      ? ` Variaveis faltando: ${result.missing.join(", ")}.`
      : "";
    if (missing) {
      console.warn(`Firebase SMS nao configurado.${missing}`);
    }
    throw new Error("Recuperacao por SMS ainda nao esta disponivel. Fale com o studio para redefinir sua senha.");
  }

  const [{ initializeApp }, sdk] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js")
  ]);

  const app = initializeApp(result.config);
  firebaseAuth = sdk.getAuth(app);
  firebaseAuth.languageCode = "pt-BR";
  firebaseAuthSdk = sdk;
  return { auth: firebaseAuth, sdk: firebaseAuthSdk };
}

async function ensureRecoveryRecaptcha() {
  const { auth, sdk } = await loadFirebaseAuth();

  if (!recoveryRecaptcha) {
    recoveryRecaptcha = new sdk.RecaptchaVerifier(auth, "recover-recaptcha", {
      size: "normal"
    });
  }

  return recoveryRecaptcha;
}

async function sendRecoveryCode() {
  if (!clientRecoverForm) {
    return;
  }

  sendRecoveryCodeButton.disabled = true;
  clientRecoverFeedback.textContent = "Enviando codigo SMS...";
  recoveryIdToken = "";
  recoveryConfirmation = null;

  try {
    const phone = phoneToE164(clientRecoverForm.elements.phone.value);
    const { auth, sdk } = await loadFirebaseAuth();
    const recaptcha = await ensureRecoveryRecaptcha();
    recoveryConfirmation = await sdk.signInWithPhoneNumber(auth, phone, recaptcha);
    clientRecoverFeedback.textContent = "Codigo enviado por SMS. Informe o codigo recebido.";
    showToast("Codigo SMS enviado.");
    clientRecoverForm.elements.smsCode.focus();
  } catch (error) {
    clientRecoverFeedback.textContent = friendlyErrorMessage(error, "Nao foi possivel enviar o codigo SMS.");
    showToast(clientRecoverFeedback.textContent);

    if (recoveryRecaptcha) {
      recoveryRecaptcha.clear();
      recoveryRecaptcha = null;
    }
  } finally {
    sendRecoveryCodeButton.disabled = false;
  }
}

async function confirmRecoveryCode() {
  const code = clientRecoverForm.elements.smsCode.value.trim();

  if (!recoveryConfirmation) {
    throw new Error("Envie o codigo SMS antes de atualizar a senha.");
  }

  if (!code) {
    throw new Error("Informe o codigo recebido por SMS.");
  }

  const credential = await recoveryConfirmation.confirm(code);
  recoveryIdToken = await credential.user.getIdToken();
  return recoveryIdToken;
}

async function submitClientLogin(event) {
  event.preventDefault();
  clientFeedback.textContent = "Entrando...";

  try {
    await requestJson("/api/auth/login", formPayload(clientForm));
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
    await requestJson("/api/auth/register", registerPayload());
    showToast("Cadastro criado.");
    window.location.href = nextUrl();
  } catch (error) {
    clientRegisterFeedback.textContent = friendlyErrorMessage(error);
    showToast(clientRegisterFeedback.textContent);
  }
}

async function submitPasswordRecovery(event) {
  event.preventDefault();
  clientRecoverFeedback.textContent = "Validando codigo SMS...";

  try {
    await confirmRecoveryCode();
    clientRecoverFeedback.textContent = "Atualizando senha...";
    await requestJson("/api/auth/recover-password", recoverPayload());
    showToast("Senha atualizada. Entre com a nova senha.");
    showClientLogin();
    clientForm.elements.phone.value = clientRecoverForm.elements.phone.value;
  } catch (error) {
    clientRecoverFeedback.textContent = friendlyErrorMessage(error);
    showToast(clientRecoverFeedback.textContent);
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
