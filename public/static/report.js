// Report page — real photo capture, real Gemini analysis, real submit to D1
(function () {
  const { api, toast } = window.CH
  let imageBase64 = null
  let mimeType = null
  let selectedCat = null
  let lastAnalysis = null

  const $ = (id) => document.getElementById(id)

  // Photo upload
  $('photo-zone').addEventListener('click', () => $('photo-input').click())
  $('photo-input').addEventListener('change', (e) => {
    const file = e.target.files[0]
    if (!file) return
    mimeType = file.type
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      imageBase64 = dataUrl.split(',')[1]
      const img = $('photo-preview')
      img.src = dataUrl
      img.classList.remove('hidden')
      $('photo-placeholder').classList.add('hidden')
    }
    reader.readAsDataURL(file)
  })

  // Category chips
  document.querySelectorAll('.cat-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.cat-chip').forEach((c) => {
        c.classList.remove('bg-primary', 'text-on-primary', 'border-primary')
      })
      chip.classList.add('bg-primary', 'text-on-primary', 'border-primary')
      selectedCat = chip.dataset.cat
    })
  })

  // GPS
  $('gps-btn').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Geolocation not supported', false); return }
    $('gps-status').textContent = 'Locating…'
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        $('lat').value = latitude
        $('lng').value = longitude
        $('address').value = `Lat ${latitude.toFixed(4)}, Lng ${longitude.toFixed(4)}`
        $('gps-status').textContent = 'Location captured from GPS'
      },
      () => { $('gps-status').textContent = 'Could not get location'; toast('Location denied', false) }
    )
  })
  // try once on load (non-blocking)
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      $('lat').value = pos.coords.latitude
      $('lng').value = pos.coords.longitude
    }, () => {})
  }

  // Analyze with real Gemini
  $('analyze-btn').addEventListener('click', async () => {
    const description = $('description').value.trim()
    if (!description && !imageBase64) { toast('Add a photo or description first', false); return }

    const btn = $('analyze-btn')
    btn.disabled = true
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Analyzing…'
    try {
      const { data } = await api.post('/analyze', { description, category: selectedCat, imageBase64, mimeType })
      lastAnalysis = data
      renderAI(data)
      $('submit-btn').classList.remove('hidden')
    } catch (e) {
      toast('Analysis failed', false)
    } finally {
      btn.disabled = false
      btn.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span> Re-analyze'
    }
  })

  function renderAI(d) {
    const sevLabels = { 5: 'Critical', 4: 'High', 3: 'Medium', 2: 'Low', 1: 'Minor' }
    $('ai-source').textContent = d.source === 'gemini' ? 'Gemini Live' : 'Smart Fallback'
    $('ai-content').innerHTML = `
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-surface-container-low rounded-lg p-3">
          <p class="text-[10px] uppercase font-bold text-on-surface-variant">Category</p>
          <p class="font-bold text-on-surface">${d.category}</p>
        </div>
        <div class="bg-surface-container-low rounded-lg p-3">
          <p class="text-[10px] uppercase font-bold text-on-surface-variant">Severity</p>
          <p class="font-bold text-on-surface">${sevLabels[d.severity]} (${d.severity}/5)</p>
        </div>
        <div class="bg-surface-container-low rounded-lg p-3">
          <p class="text-[10px] uppercase font-bold text-on-surface-variant">Routed To</p>
          <p class="font-bold text-on-surface">${d.department}</p>
        </div>
        <div class="bg-surface-container-low rounded-lg p-3">
          <p class="text-[10px] uppercase font-bold text-on-surface-variant">Priority</p>
          <p class="font-bold text-primary">${d.priority_score}/100</p>
        </div>
      </div>
      <p class="text-sm text-on-surface mt-1"><b>${d.title}</b> — ${d.summary}</p>`
    $('ai-result').classList.remove('hidden')
  }

  // Submit to D1
  $('submit-btn').addEventListener('click', async () => {
    const btn = $('submit-btn')
    btn.disabled = true
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Submitting…'
    try {
      const payload = {
        description: $('description').value.trim(),
        category: selectedCat,
        address: $('address').value,
        lat: parseFloat($('lat').value) || null,
        lng: parseFloat($('lng').value) || null,
        photo_data: $('photo-preview').src && !$('photo-preview').classList.contains('hidden') ? $('photo-preview').src : null,
        anonymous: $('anon-toggle').checked,
        ai: lastAnalysis,
      }
      const { data } = await api.post('/issues', payload)
      toast('Report submitted! +10 points')
      setTimeout(() => { window.location.href = '/issue/' + data.id }, 800)
    } catch (e) {
      toast('Submit failed', false)
      btn.disabled = false
      btn.innerHTML = '<span class="material-symbols-outlined">send</span> Submit Report'
    }
  })
})()
