// Home dashboard — live stats + recent issues with real-time polling
(function () {
  const { api, issueCard } = window.CH

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val }

  async function loadStats() {
    try {
      const { data } = await api.get('/stats')
      // Stat cards
      set('stat-open', data.open)
      set('stat-resolved2', data.resolved)
      set('stat-mine', data.mine)
      set('stat-score', data.score)
      // Neighbourhood Pulse
      set('np-open', data.open)
      set('np-resolved', data.resolved)
      set('np-helped', data.resolved)
    } catch (e) { console.error(e) }
  }

  async function loadPulse() {
    try {
      const [me, health] = await Promise.all([
        api.get('/me').catch(() => ({ data: {} })),
        api.get('/city-health').catch(() => ({ data: {} })),
      ])
      if (me.data && me.data.rank) set('np-rank', '#' + me.data.rank)
      const score = Math.round((health.data && health.data.score) || 0)
      if (score) {
        set('np-health-pct', score + '%')
        const bar = document.getElementById('np-health-bar')
        if (bar) bar.style.width = score + '%'
      }
    } catch (e) { /* keep static fallbacks */ }
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
  loadPulse()
  // Real-time: poll every 5s so new reports/verifications appear automatically
  setInterval(refresh, 5000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() })
})()
