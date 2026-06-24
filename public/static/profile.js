// Profile page — real user data + my reports
(function () {
  const { api, issueCard } = window.CH

  async function load() {
    try {
      const { data: me } = await api.get('/me')
      document.getElementById('p-name').textContent = me.name
      document.getElementById('p-email').textContent = me.email
      document.getElementById('p-score').textContent = me.score
      document.getElementById('p-reports').textContent = me.reports

      const { data } = await api.get('/issues', { params: { mine: 'true' } })
      const el = document.getElementById('my-reports')
      if (!data.issues.length) {
        el.innerHTML = '<div class="text-center text-on-surface-variant py-8">You haven\'t reported anything yet.</div>'
      } else {
        el.innerHTML = data.issues.map(issueCard).join('')
      }
    } catch (e) { console.error(e) }
  }

  load()
  setInterval(load, 10000)
})()
