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

  function refresh() { loadStats(); loadRecent() }
  refresh()
  // Real-time: poll every 5s so new reports/verifications appear automatically
  setInterval(refresh, 5000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() })
})()
