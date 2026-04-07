/* Global API config used by all pages. */
(function initApiConfig() {
    const base = 'https://sam-api-backend.onrender.com';
    window.SAM_API_CONFIG = Object.freeze({
        base,
        apiBase: `${base}/api`,
        chatUrl: `${base}/chat`,
        pingUrl: `${base}/ping`
    });
})();
