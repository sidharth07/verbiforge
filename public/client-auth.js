// Simple client-side auth helper for JWT handling
(function () {
  const TOKEN_KEY = 'jwtToken';
  const USER_KEY = 'currentUser';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  function setAuth(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function authFetch(input, init) {
    const token = getToken();
    const options = init || {};
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    
    const response = await fetch(input, { ...options, headers });
    
    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      clearAuth();
      window.location.href = 'login.html';
      return response;
    }
    
    return response;
  }

  window.Auth = { getToken, getUser, setAuth, clearAuth, authFetch };
})();





