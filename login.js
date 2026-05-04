const clientForm = document.getElementById("client-login-form");
const adminForm = document.getElementById("admin-login-form");
const clientRegisterButton = document.getElementById("client-register-button");
const clientFeedback = document.getElementById("client-login-feedback");
const adminFeedback = document.getElementById("admin-login-feedback");
const toast = document.getElementById("site-toast");

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

  return {
    name: formData.get("name").toString().trim(),
    phone: formData.get("phone").toString().trim(),
    password: formData.get("password").toString()
  };
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

async function submitClientRegister() {
  clientFeedback.textContent = "Criando acesso...";

  try {
    await requestJson("/api/auth/register", formPayload(clientForm));
    showToast("Acesso criado.");
    window.location.href = "agendamentos.html";
  } catch (error) {
    clientFeedback.textContent = error.message;
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

clientForm.addEventListener("submit", submitClientLogin);
clientRegisterButton.addEventListener("click", submitClientRegister);
adminForm.addEventListener("submit", submitAdminLogin);
