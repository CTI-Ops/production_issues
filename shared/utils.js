// ============================================================
// Shared Utilities - Operations Portal
// ============================================================

/**
 * HTML-escape a string to prevent XSS when inserting into innerHTML.
 * Uses the browser's built-in textContent encoding.
 */
function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

// ── Clock Widget ──
function updateClock() {
  const el = document.getElementById('clock');
  if (el) {
    el.textContent = new Date().toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }
}
updateClock();
setInterval(updateClock, 1000);

// ── Bug Report Modal (programmatic DOM creation) ──

function initBugModal(pageName) {
  // Bug report button
  const btn = document.createElement('button');
  btn.className = 'bug-btn';
  btn.title = 'Report a Bug';
  btn.innerHTML = '&#x1F41B;';
  btn.addEventListener('click', function() {
    document.getElementById('bugOverlay').classList.add('open');
    const desc = document.getElementById('bugDesc');
    if (desc) desc.focus();
  });
  document.body.appendChild(btn);

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'bug-overlay';
  overlay.id = 'bugOverlay';
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.classList.remove('open');
  });
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') overlay.classList.remove('open');
  });

  overlay.innerHTML =
    '<div class="bug-modal">' +
      '<div class="bug-modal-head">' +
        '<h3>Report a Bug</h3>' +
        '<button onclick="document.getElementById(\'bugOverlay\').classList.remove(\'open\')">&times;</button>' +
      '</div>' +
      '<div class="bug-modal-body">' +
        '<div><label>Description <span style="color:var(--accent)">*</span></label>' +
        '<textarea id="bugDesc" placeholder="What went wrong?" rows="3"></textarea></div>' +
        '<div><label>Steps to Reproduce</label>' +
        '<textarea id="bugSteps" placeholder="1. Go to...\n2. Click on...\n3. See error" rows="3"></textarea></div>' +
        '<button class="bug-submit" id="bugSubmit" onclick="submitBug()">Submit Report</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  // Toast
  const toast = document.createElement('div');
  toast.className = 'bug-toast';
  toast.id = 'bugToast';
  document.body.appendChild(toast);

  // Store page name for submitBug
  window._bugPageName = pageName;
}

function submitBug() {
  const desc = document.getElementById('bugDesc').value.trim();
  if (!desc) { showBugToast('Please enter a description.', 'err'); return; }
  const btn = document.getElementById('bugSubmit');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'bug_report',
      page: window._bugPageName || 'Unknown',
      description: desc,
      steps: document.getElementById('bugSteps').value
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.success) {
      document.getElementById('bugDesc').value = '';
      document.getElementById('bugSteps').value = '';
      document.getElementById('bugOverlay').classList.remove('open');
      showBugToast('Bug report sent!');
    } else {
      showBugToast(d.error || 'Failed to send.', 'err');
    }
  })
  .catch(function() { showBugToast('Network error.', 'err'); })
  .finally(function() { btn.disabled = false; btn.textContent = 'Submit Report'; });
}

function showBugToast(msg, type) {
  const t = document.getElementById('bugToast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'bug-toast show' + (type ? ' ' + type : '');
  setTimeout(function() { t.className = 'bug-toast'; }, 3000);
}
