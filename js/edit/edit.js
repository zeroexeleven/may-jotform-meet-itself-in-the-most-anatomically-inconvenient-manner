document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const submissionId = params.get("id");
  const statusEl = document.getElementById("status");
  const backBtn = document.getElementById("backBtn");
  const workerBase = "https://jotform-proxy.zeroexeleven.workers.dev";

  // Helper to build query string with all persisted params (excluding page-specific ones)
  function getPersistedParams(excludeKeys = []) {
    const persistParams = new URLSearchParams();
    const excludeSet = new Set(excludeKeys);
    for (const [key, value] of params.entries()) {
      if (!excludeSet.has(key)) {
        persistParams.set(key, value);
      }
    }
    const paramStr = persistParams.toString();
    return paramStr ? '&' + paramStr : '';
  }

  // Track edit page view in Clarity
  function trackClarity() {
    if (typeof clarity !== 'undefined') {
      clarity('set', 'page_type', 'edit_form');
      clarity('set', 'submission_id', submissionId);
    } else {
      setTimeout(trackClarity, 100);
    }
  }
  trackClarity();

  if (!submissionId) {
    statusEl.className = "status error";
    statusEl.textContent = "Missing submission ID";
    return;
  }

  // Update back button
  backBtn.href = `summary.html?id=${encodeURIComponent(submissionId)}${getPersistedParams()}`;

  statusEl.textContent = "Redirecting to form...";
  
  // Simple redirect with just the editId - form will fetch data from API
  // This keeps the URL clean instead of passing all field data as parameters
  window.location.href = `../index.html?editId=${encodeURIComponent(submissionId)}&returnTo=summary${getPersistedParams()}`;
});
