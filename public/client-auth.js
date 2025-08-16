// Simple client-side auth helper for JWT handling
(function () {
  const TOKEN_KEY = 'token';
  const USER_KEY = 'user';
  
  // Debug function to log all storage info
  function debugStorage() {
    console.log('🔍 Storage Debug:');
    console.log('  - localStorage available:', typeof localStorage !== 'undefined');
    console.log('  - Token exists:', !!localStorage.getItem(TOKEN_KEY));
    console.log('  - User exists:', !!localStorage.getItem(USER_KEY));
    console.log('  - Current domain:', window.location.hostname);
    console.log('  - Current protocol:', window.location.protocol);
    console.log('  - All localStorage keys:', Object.keys(localStorage));
  }

  function getToken() {
    // Check all possible token keys
    return localStorage.getItem(TOKEN_KEY) || 
           localStorage.getItem('jwtToken') || 
           localStorage.getItem('jwt');
  }

  function getUser() {
    // Check all possible user keys
    const raw = localStorage.getItem(USER_KEY) || 
                localStorage.getItem('currentUser') || 
                localStorage.getItem('userData');
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
    
    // Simple check - just verify token and user exist
    // Don't do aggressive token validation that might cause logouts
    return token && user;
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

  window.Auth = { getToken, getUser, setAuth, clearAuth, authFetch, isAuthenticated, debugStorage };
})();





