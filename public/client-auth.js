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

  function isAuthenticated() {
    const token = getToken();
    const user = getUser();
    
    console.log('🔍 isAuthenticated check - Token exists:', !!token, 'User exists:', !!user);
    
    if (!token || !user) {
      console.log('🔍 isAuthenticated - Missing token or user');
      return false;
    }
    
    // Check if token is expired (basic check)
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        console.log('🔍 isAuthenticated - Invalid token format');
        return false;
      }
      
      const payload = JSON.parse(atob(parts[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      
      console.log('🔍 isAuthenticated - Token payload:', payload);
      console.log('🔍 isAuthenticated - Current time:', currentTime, 'Exp time:', payload.exp);
      
      if (payload.exp && payload.exp < currentTime) {
        console.log('🔑 Token expired, clearing auth');
        clearAuth();
        return false;
      }
      
      console.log('🔍 isAuthenticated - Token valid');
      return true;
    } catch (error) {
      console.log('🔑 Error checking token expiration:', error);
      return false;
    }
  }

  async function authFetch(input, init) {
    const token = getToken();
    const options = init || {};
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    
    const response = await fetch(input, { ...options, headers });
    
    // Handle authentication errors - but be more careful about admin endpoints
    if (response.status === 401 || response.status === 403) {
      // Don't auto-redirect for admin endpoints, let the calling code handle it
      if (input.includes('/admin/')) {
        console.log('🔒 Auth error on admin endpoint, letting caller handle');
        return response;
      }
      
      clearAuth();
      window.location.href = 'login.html';
      return response;
    }
    
    // Handle rate limiting errors
    if (response.status === 429) {
      try {
        const errorData = await response.json();
        console.warn('Rate limit exceeded:', errorData);
        
        // Show user-friendly rate limit message
        if (typeof showError === 'function') {
          showError(`Rate limit exceeded. Please wait ${errorData.retryAfter || 15} minutes before trying again.`);
        } else {
          alert(`Rate limit exceeded. Please wait ${errorData.retryAfter || 15} minutes before trying again.`);
        }
      } catch (e) {
        console.error('Failed to parse rate limit error:', e);
        if (typeof showError === 'function') {
          showError('Too many requests. Please wait a few minutes before trying again.');
        } else {
          alert('Too many requests. Please wait a few minutes before trying again.');
        }
      }
      return response;
    }
    
    return response;
  }

  window.Auth = { getToken, getUser, setAuth, clearAuth, authFetch, isAuthenticated };
})();





