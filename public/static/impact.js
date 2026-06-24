// Impact dashboard — real charts + real Gemini weekly insight
(function () {
  const { api } = window.CH
  let catChart, statusChart

  async function loadInsight() {
    try {
      const { data } = await api.get('/insight')
      document.getElementById('insight-text').textContent = data.text
      document.getElementById('insight-source').textContent = data.source === 'gemini' ? 'Gemini Live' : 'Smart Fallback'
      document.getElementById('ins-most').textContent = data.most
      document.getElementById('ins-hotspot').textContent = (data.hotspot || '').split(',')[0]
      document.getElementById('ins-rate').textContent = data.rate + '%'
    } catch (e) { console.error(e) }
  }

  async function loadCharts() {
    try {
      const { data } = await api.get('/stats')
      const catLabels = data.byCategory.map((r) => r.category)
      const catData = data.byCategory.map((r) => r.n)
      const statusLabels = data.byStatus.map((r) => r.status)
      const statusData = data.byStatus.map((r) => r.n)

      const palette = ['#003d9b', '#006c47', '#7d5200', '#ba1a1a', '#0052cc', '#737685']

      if (catChart) { catChart.data.labels = catLabels; catChart.data.datasets[0].data = catData; catChart.update() }
      else {
        catChart = new Chart(document.getElementById('categoryChart'), {
          type: 'bar',
          data: { labels: catLabels, datasets: [{ label: 'Reports', data: catData, backgroundColor: '#0052cc', borderRadius: 6 }] },
          options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
        })
      }

      if (statusChart) { statusChart.data.labels = statusLabels; statusChart.data.datasets[0].data = statusData; statusChart.update() }
      else {
        statusChart = new Chart(document.getElementById('statusChart'), {
          type: 'doughnut',
          data: { labels: statusLabels, datasets: [{ data: statusData, backgroundColor: palette }] },
          options: { plugins: { legend: { position: 'bottom' } } },
        })
      }
    } catch (e) { console.error(e) }
  }

  loadInsight()
  loadCharts()
  setInterval(loadCharts, 8000)
})()
