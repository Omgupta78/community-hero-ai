// Map page — hybrid: Google Maps when a key is configured, Leaflet/OSM fallback.
(function () {
  const { api, severityBadge, esc } = window.CH
  const KEY = (window.GOOGLE_MAPS_KEY || '').trim()
  const CENTER = { lat: 30.7333, lng: 76.7794 } // Chandigarh
  let filter = 'all'
  let activeLoad = () => {}

  function sevColor(sev) {
    return { 5: '#ba1a1a', 4: '#d9534f', 3: '#b8860b', 2: '#006c47', 1: '#737685' }[sev] || '#0052cc'
  }
  function paramsForFilter() {
    const p = {}
    if (filter === 'mine') p.mine = 'true'
    if (filter === 'verify') p.verify = 'true'
    return p
  }
  function wireFilters() {
    document.querySelectorAll('.map-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter
        document.querySelectorAll('.map-filter').forEach((b) => {
          b.classList.remove('bg-primary', 'text-on-primary')
          b.classList.add('bg-surface-container', 'text-on-surface')
        })
        btn.classList.add('bg-primary', 'text-on-primary')
        btn.classList.remove('bg-surface-container', 'text-on-surface')
        activeLoad()
      })
    })
  }
  function popupHTML(i) {
    const [, slabel] = severityBadge(i.severity)
    return `<div style="min-width:180px">
        <b>${esc(i.title)}</b><br/>
        <span style="font-size:12px;color:#434654">${esc(i.address) || ''}</span><br/>
        <span style="font-size:11px">${i.category} · ${slabel} · ${i.status}</span><br/>
        <a href="/issue/${i.id}" style="color:#003d9b;font-weight:600;font-size:12px">View details →</a>
      </div>`
  }

  // ============================ GOOGLE MAPS ============================
  function initGoogle() {
    let gmap, info
    let gmarkers = []

    window.__chInitMap = function () {
      gmap = new google.maps.Map(document.getElementById('map'), {
        center: CENTER,
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      })
      info = new google.maps.InfoWindow()

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((p) => {
          const here = { lat: p.coords.latitude, lng: p.coords.longitude }
          gmap.setCenter(here)
          new google.maps.Marker({
            position: here, map: gmap, title: 'You are here',
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#0052cc', fillOpacity: 0.7, strokeColor: '#fff', strokeWeight: 2 },
          })
        }, () => {})
      }

      activeLoad = load
      load()
      setInterval(load, 7000)
      wireFilters()
    }

    async function load() {
      try {
        const { data } = await api.get('/issues', { params: paramsForFilter() })
        gmarkers.forEach((m) => m.setMap(null))
        gmarkers = []
        data.issues.forEach((i) => {
          if (i.lat == null || i.lng == null) return
          const marker = new google.maps.Marker({
            position: { lat: i.lat, lng: i.lng },
            map: gmap,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: sevColor(i.severity), fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 2 },
          })
          marker.addListener('click', () => { info.setContent(popupHTML(i)); info.open(gmap, marker) })
          gmarkers.push(marker)
        })
      } catch (e) { console.error(e) }
    }

    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&callback=__chInitMap&loading=async`
    s.async = true
    s.onerror = () => { console.warn('Google Maps failed to load — falling back to Leaflet'); initLeaflet() }
    document.head.appendChild(s)
  }

  // ============================ LEAFLET (fallback) ============================
  function initLeaflet() {
    const map = L.map('map', { zoomControl: true }).setView([CENTER.lat, CENTER.lng], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(map)

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => {
        map.setView([p.coords.latitude, p.coords.longitude], 14)
        L.circleMarker([p.coords.latitude, p.coords.longitude], { radius: 8, color: '#003d9b', fillColor: '#0052cc', fillOpacity: 0.6 }).addTo(map).bindPopup('You are here')
      }, () => {})
    }

    let markers = []
    async function load() {
      try {
        const { data } = await api.get('/issues', { params: paramsForFilter() })
        markers.forEach((m) => map.removeLayer(m))
        markers = []
        data.issues.forEach((i) => {
          if (i.lat == null || i.lng == null) return
          const m = L.circleMarker([i.lat, i.lng], {
            radius: 9, color: '#fff', weight: 2, fillColor: sevColor(i.severity), fillOpacity: 0.9,
          }).addTo(map)
          m.bindPopup(popupHTML(i))
          markers.push(m)
        })
      } catch (e) { console.error(e) }
    }

    activeLoad = load
    load()
    setInterval(load, 7000)
    wireFilters()
  }

  // Choose backend.
  if (KEY) initGoogle()
  else initLeaflet()
})()
