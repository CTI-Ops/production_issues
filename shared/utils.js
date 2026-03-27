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

// ── Focus Trap Utility ──

function trapFocus(element) {
  const focusable = element.querySelectorAll('button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return function() {};
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  element.addEventListener('keydown', handler);
  return function() { element.removeEventListener('keydown', handler); };
}

// ── Bug Report Modal (programmatic DOM creation) ──

var _bugFocusTrapCleanup = null;
var _bugPreviousFocus = null;

function openBugModal() {
  _bugPreviousFocus = document.activeElement;
  const overlay = document.getElementById('bugOverlay');
  overlay.classList.add('open');
  const desc = document.getElementById('bugDesc');
  if (desc) desc.focus();
  _bugFocusTrapCleanup = trapFocus(overlay);
}

function closeBugModal() {
  document.getElementById('bugOverlay').classList.remove('open');
  if (_bugFocusTrapCleanup) { _bugFocusTrapCleanup(); _bugFocusTrapCleanup = null; }
  if (_bugPreviousFocus) { _bugPreviousFocus.focus(); _bugPreviousFocus = null; }
}

function initBugModal(pageName) {
  // Bug report button
  const btn = document.createElement('button');
  btn.className = 'bug-btn';
  btn.title = 'Report a Bug';
  btn.innerHTML = '&#x1F41B;';
  btn.addEventListener('click', openBugModal);
  document.body.appendChild(btn);

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'bug-overlay';
  overlay.id = 'bugOverlay';
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeBugModal();
  });
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeBugModal();
  });

  overlay.innerHTML =
    '<div class="bug-modal" role="dialog" aria-modal="true" aria-label="Report a Bug">' +
      '<div class="bug-modal-head">' +
        '<h3>Report a Bug</h3>' +
        '<button onclick="closeBugModal()" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="bug-modal-body">' +
        '<div><label for="bugDesc">Description <span style="color:var(--accent)">*</span></label>' +
        '<textarea id="bugDesc" placeholder="What went wrong?" rows="3"></textarea></div>' +
        '<div><label for="bugSteps">Steps to Reproduce</label>' +
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

// ── Accessibility Panel ──

function initA11yPanel() {
  const A11Y_KEYS = ['a11y_contrast', 'a11y_largetext', 'a11y_focus'];
  const A11Y_CLASSES = ['a11y-contrast', 'a11y-large-text', 'a11y-focus'];
  const A11Y_LABELS = ['High Contrast', 'Large Text', 'Enhanced Focus'];

  // Restore saved preferences immediately
  A11Y_KEYS.forEach(function(key, i) {
    if (localStorage.getItem(key) === '1') {
      document.documentElement.classList.add(A11Y_CLASSES[i]);
    }
  });

  // Create button
  const btn = document.createElement('button');
  btn.className = 'a11y-btn';
  btn.title = 'Accessibility Options';
  btn.setAttribute('aria-label', 'Accessibility Options');
  btn.innerHTML = '&#x1F441;'; // eye icon
  document.body.appendChild(btn);

  // Create panel
  const panel = document.createElement('div');
  panel.className = 'a11y-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Accessibility Options');

  var html = '<div class="a11y-panel-title">Accessibility</div>';
  A11Y_KEYS.forEach(function(key, i) {
    const checked = localStorage.getItem(key) === '1' ? ' checked' : '';
    html +=
      '<div class="a11y-option">' +
        '<span class="a11y-option-label">' + A11Y_LABELS[i] + '</span>' +
        '<label class="a11y-toggle">' +
          '<input type="checkbox" data-a11y-key="' + key + '" data-a11y-class="' + A11Y_CLASSES[i] + '"' + checked + '>' +
          '<span class="a11y-toggle-track"></span>' +
        '</label>' +
      '</div>';
  });
  panel.innerHTML = html;
  document.body.appendChild(panel);

  // Toggle handlers
  panel.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      const cls = cb.getAttribute('data-a11y-class');
      const key = cb.getAttribute('data-a11y-key');
      if (cb.checked) {
        document.documentElement.classList.add(cls);
        localStorage.setItem(key, '1');
      } else {
        document.documentElement.classList.remove(cls);
        localStorage.setItem(key, '0');
      }
    });
  });

  // Open/close panel
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    const isOpen = panel.classList.toggle('open');
    btn.classList.toggle('active', isOpen);
  });

  // Close on click outside
  document.addEventListener('click', function(e) {
    if (!panel.contains(e.target) && e.target !== btn) {
      panel.classList.remove('open');
      btn.classList.remove('active');
    }
  });

  // Close on Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) {
      panel.classList.remove('open');
      btn.classList.remove('active');
      btn.focus();
    }
  });
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
