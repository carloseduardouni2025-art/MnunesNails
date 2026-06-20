const API_BASE = 'http://localhost:3000';

function getToken() {
  return localStorage.getItem('authToken');
}

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: getAuthHeaders(),
    ...options,
  });
  if (!res.ok) throw await res.json();
  return res.json();
}
