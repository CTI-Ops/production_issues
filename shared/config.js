// ============================================================
// Shared Configuration - Operations Portal
// ============================================================

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbym96HitpBQ6DdZ6O7aZ5ZWAk18xX2PS3z4-6GnZ1Ypz3OPQ3Nakt4lQY3OpbMdbKTlkA/exec';
const API_TOKEN = 'ops-BpZ6FJBjCBF5eFmq_tAWag';

// Validate URL at load time
if (!SCRIPT_URL.startsWith('https://script.google.com/')) {
  console.error('Invalid Script URL configuration');
}

// Clean up legacy localStorage override (no longer supported)
(function() {
  const storedUrl = localStorage.getItem('prodlog_script_url');
  if (storedUrl && storedUrl !== SCRIPT_URL) {
    localStorage.removeItem('prodlog_script_url');
  }
})();
