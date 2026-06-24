// Map page — real Leaflet map with live markers
(function () {
  const { api, CAT_ICON, severityBadge, esc } = window.CH
  let filter = 'all'
  let markers = []

  const map = L.map('map', { zoomControl: true }).setView([39.799, -89.644], 14)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 19,
  }).addTo(map)

  // try to center on user
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((p) => {
      map.setView([p.coords.latitude, p.coords.longitude], 14)
      L.circleMarker([p.coords.latitude, p.coords.longitude], { radius: 8, color: '#003d9b', fillColor: '#0052cc', fillOpacity: 0.6 }).addTo(map).bindPopup('You are here')
    }, () => {})
  }

  function sevColor(sev) {
    return { 5: '#ba1a1a', 4: '#d9534f', 3: '#b8860b', 2: '#006c47', 1: '#737685' }[sev] || '#0052cc'
  }

  async function load() {
    const params = {}
    if (filter === 'mine') params.mine = 'true'
    if (filter === 'verify') params.verify = 'true'
    try {
      const { data } = await api.get('/issues', { params })
      markers.forEach((m) => map.removeLayer(m))
      markers = []
      data.issues.forEach((i) => {
        if (i.lat == null || i.lng == null) return
        const [, slabel] = severityBadge(i.severity)
        const m = L.circleMarker([i.lat, i.lng], {
          radius: 9, color: '#fff', weight: 2, fillColor: sevColor(i.severity), fillOpacity: 0.9,
        }).addTo(map)
        m.bindPopup(`
          <div style="min-width:180px">
            <b>${esc(i.title)}</b><br/>
            <span style="font-size:12px;color:#434654">${esc(i.address) || ''}</span><br/>
            <span style="font-size:11px">${i.category} · ${slabel} · ${i.status}</span><br/>
            <a href="/issue/${i.id}" style="color:#003d9b;font-weight:600;font-size:12px">View details →</a>
          </div>`)
        markers.push(m)
      })
    } catch (e) { console.error(e) }
  }

  document.querySelectorAll('.map-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter
      document.querySelectorAll('.map-filter').forEach((b) => {
        b.classList.remove('bg-primary', 'text-on-primary')
        b.classList.add('bg-surface-container', 'text-on-surface')
      })
      btn.classList.add('bg-primary', 'text-on-primary')
      btn.classList.remove('bg-surface-container', 'text-on-surface')
      load()
    })
  })

  load()
  setInterval(load, 7000) // real-time refresh
})()
