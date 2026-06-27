// Home dashboard — live stats + recent issues with real-time polling
(function () {
  const { api, issueCard } = window.CH

  async function loadStats() {
    try {
      const { data } = await api.get('/stats')
      document.getElementById('stat-resolved').textContent = data.resolved
      document.getElementById('stat-open').textContent = data.open
      document.getElementById('stat-resolved2').textContent = data.resolved
      document.getElementById('stat-mine').textContent = data.mine
      document.getElementById('stat-score').textContent = data.score
    } catch (e) { console.error(e) }
  }

  async function loadRecent() {
    try {
      const { data } = await api.get('/issues', { params: { limit: 5 } })
      const el = document.getElementById('recent-issues')
      if (!data.issues.length) {
        el.innerHTML = '<div class="text-center text-on-surface-variant py-8">No issues yet. Be the first to report!</div>'
        return
      }
      el.innerHTML = data.issues.map(issueCard).join('')
    } catch (e) { console.error(e) }
  }

  async function loadPrediction() {
    try {
      const { data } = await api.get('/city-health')
      const txt = (data && data.insight) || ''
      if (!txt) return
      const el = document.getElementById('aip-main')
      const sub = document.getElementById('aip-sub')
      if (el) {
        // Strip a leading "Predicted:" label and the trailing pre-assign sentence
        // so the card's own labels/footer aren't duplicated.
        let main = txt.replace(/^\s*predicted:\s*/i, '')
        const cut = main.search(/\.\s+(pre-?assign|pre-?emptive)/i)
        if (cut > 0) main = main.slice(0, cut + 1)
        el.textContent = main.trim()
      }
      if (sub && /rain/i.test(txt)) sub.textContent = 'Based on rainfall forecast + 30-day issue pattern'
    } catch (e) { /* keep the static fallback text */ }
  }

  function refresh() { loadStats(); loadRecent() }
  refresh()
  loadPrediction()
  // Real-time: poll every 5s so new reports/verifications appear automatically
  setInterval(refresh, 5000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() })
})()
