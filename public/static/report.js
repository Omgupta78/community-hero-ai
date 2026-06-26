// Report page — real photo/video capture, frame extraction, Gemini analysis, submit to D1
(function () {
  const { api, toast } = window.CH
  let imageBase64 = null   // still image (or extracted video frame) sent to Gemini
  let mimeType = null
  let mediaType = 'image'  // 'image' | 'video'
  let videoDataUrl = null  // playable clip (base64 data URL) for video reports
  let thumbDataUrl = null  // still image data URL stored as photo_data
  let selectedCat = null
  let lastAnalysis = null

  const MAX_VIDEO_MB = 12

  const $ = (id) => document.getElementById(id)

  // Extract a representative still frame from a video File → JPEG data URL.
  function extractFrame(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.src = url
      let done = false
      const finish = (val) => { if (!done) { done = true; URL.revokeObjectURL(url); resolve(val) } }
      video.onloadeddata = () => {
        const t = isFinite(video.duration) && video.duration > 0 ? Math.min(1, video.duration / 2) : 0
        try { video.currentTime = t } catch (e) { /* some browsers */ }
      }
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth || 640
          canvas.height = video.videoHeight || 480
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
          finish(canvas.toDataURL('image/jpeg', 0.7))
        } catch (e) { finish(null) }
      }
      video.onerror = () => finish(null)
      setTimeout(() => finish(null), 8000) // safety timeout
    })
  }

  const readAsDataURL = (file) =>
    new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(file) })

  // Photo / video selection
  $('photo-zone').addEventListener('click', () => $('photo-input').click())
  $('photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const img = $('photo-preview')
    const vid = $('video-preview')
    const note = $('media-note')
    $('photo-placeholder').classList.add('hidden')

    if (file.type.startsWith('video/')) {
      mediaType = 'video'
      mimeType = 'image/jpeg' // we analyze an extracted frame
      // Playable preview
      const objUrl = URL.createObjectURL(file)
      vid.src = objUrl
      vid.classList.remove('hidden')
      img.classList.add('hidden')
      note.classList.remove('hidden')
      note.textContent = 'Extracting a frame for AI analysis…'

      const frame = await extractFrame(file)
      if (frame) {
        thumbDataUrl = frame
        imageBase64 = frame.split(',')[1]
      } else {
        thumbDataUrl = null
        imageBase64 = null
      }

      const sizeMB = file.size / (1024 * 1024)
      if (sizeMB <= MAX_VIDEO_MB) {
        videoDataUrl = await readAsDataURL(file)
        note.textContent = `Video ready (${sizeMB.toFixed(1)} MB). AI will analyze a frame from it.`
      } else {
        videoDataUrl = null
        note.textContent = `Clip is ${sizeMB.toFixed(1)} MB — too large to store, but AI will still analyze a frame. Use a shorter clip (≤ ${MAX_VIDEO_MB} MB) to attach the video.`
      }
    } else {
      mediaType = 'image'
      mimeType = file.type
      videoDataUrl = null
      vid.classList.add('hidden')
      const dataUrl = await readAsDataURL(file)
      thumbDataUrl = dataUrl
      imageBase64 = dataUrl ? dataUrl.split(',')[1] : null
      img.src = dataUrl
      img.classList.remove('hidden')
      note.classList.add('hidden')
    }
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
        photo_data: thumbDataUrl || null,
        media_type: mediaType,
        video_data: mediaType === 'video' ? videoDataUrl : null,
        anonymous: $('anon-toggle').checked,
        ai: lastAnalysis,
      }
      const { data } = await api.post('/issues', payload)
      if (data.duplicate_of) {
        toast(`Thanks! Looks like a duplicate of #${data.duplicate_of} (+${data.points_awarded} pts)`)
      } else {
        toast(`Report submitted! +${data.points_awarded} points`)
      }
      setTimeout(() => { window.location.href = '/issue/' + data.id }, 900)
    } catch (e) {
      toast('Submit failed', false)
      btn.disabled = false
      btn.innerHTML = '<span class="material-symbols-outlined">send</span> Submit Report'
    }
  })
})()
