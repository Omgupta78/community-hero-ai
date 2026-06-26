// Report page — "Snap to report": photo/video → Gemini auto-fills editable
// Category, Severity and Description; user can tweak, then submit to D1.
(function () {
  const { api, toast } = window.CH
  let imageBase64 = null   // still image (or extracted video frame) sent to Gemini
  let mimeType = null
  let mediaType = 'image'  // 'image' | 'video'
  let videoDataUrl = null  // playable clip (base64 data URL) for video reports
  let thumbDataUrl = null  // still image data URL stored as photo_data
  let lastAnalysis = null

  const MAX_VIDEO_MB = 12
  const GEMINI_VIDEO_MAX_MB = 6

  // category → department (mirrors server lib/gemini.ts DEPARTMENTS)
  const DEPT = {
    Pothole: 'Road Maintenance', 'Illegal Dumping': 'Sanitation', Streetlight: 'Electrical',
    'Water Leak': 'Water Works', Graffiti: 'Parks & Recreation', Other: 'General Services',
  }

  const $ = (id) => document.getElementById(id)

  // --- media helpers ---
  const readAsDataURL = (file) =>
    new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(file) })

  function downscaleImage(file, maxDim = 1280, quality = 0.72) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const im = new Image()
      im.onload = () => {
        let { width, height } = im
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim }
          else { width = Math.round((width * maxDim) / height); height = maxDim }
        }
        try {
          const c = document.createElement('canvas'); c.width = width; c.height = height
          c.getContext('2d').drawImage(im, 0, 0, width, height)
          URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', quality))
        } catch (e) { URL.revokeObjectURL(url); resolve(null) }
      }
      im.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
      im.src = url
    })
  }

  function extractFrame(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.preload = 'metadata'; video.muted = true; video.playsInline = true; video.src = url
      let done = false
      const finish = (v) => { if (!done) { done = true; URL.revokeObjectURL(url); resolve(v) } }
      video.onloadeddata = () => {
        const t = isFinite(video.duration) && video.duration > 0 ? Math.min(1, video.duration / 2) : 0
        try { video.currentTime = t } catch (e) {}
      }
      video.onseeked = () => {
        try {
          const maxDim = 1280
          let w = video.videoWidth || 640, h = video.videoHeight || 480
          if (w > maxDim || h > maxDim) { if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim } else { w = Math.round((w * maxDim) / h); h = maxDim } }
          const c = document.createElement('canvas'); c.width = w; c.height = h
          c.getContext('2d').drawImage(video, 0, 0, w, h)
          finish(c.toDataURL('image/jpeg', 0.7))
        } catch (e) { finish(null) }
      }
      video.onerror = () => finish(null)
      setTimeout(() => finish(null), 8000)
    })
  }

  // --- example starter chips ---
  document.querySelectorAll('.ex-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const cur = $('description').value.trim()
      $('description').value = cur ? cur : chip.dataset.ex
      $('description').focus()
    })
  })

  // --- upload ---
  $('upload-btn').addEventListener('click', () => $('photo-input').click())
  $('photo-zone').addEventListener('click', () => $('photo-input').click())

  $('photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const img = $('photo-preview'), vid = $('video-preview'), note = $('media-note')
    $('photo-placeholder').classList.add('hidden')

    if (file.type.startsWith('video/')) {
      mediaType = 'video'
      vid.src = URL.createObjectURL(file)
      vid.classList.remove('hidden'); img.classList.add('hidden'); note.classList.remove('hidden')
      note.textContent = 'Extracting a frame…'
      const frame = await extractFrame(file)
      thumbDataUrl = frame || null
      const sizeMB = file.size / (1024 * 1024)
      videoDataUrl = sizeMB <= MAX_VIDEO_MB ? await readAsDataURL(file) : null
      if (videoDataUrl && sizeMB <= GEMINI_VIDEO_MAX_MB) {
        imageBase64 = videoDataUrl.split(',')[1]; mimeType = file.type || 'video/mp4'
        note.textContent = `Video ready (${sizeMB.toFixed(1)} MB) — Gemini will analyze the clip.`
      } else if (frame) {
        imageBase64 = frame.split(',')[1]; mimeType = 'image/jpeg'
        note.textContent = `Video ready (${sizeMB.toFixed(1)} MB) — Gemini will analyze a frame.`
      } else { imageBase64 = null; mimeType = null }
    } else {
      mediaType = 'image'; mimeType = 'image/jpeg'; videoDataUrl = null
      vid.classList.add('hidden')
      const dataUrl = (await downscaleImage(file)) || (await readAsDataURL(file))
      thumbDataUrl = dataUrl
      imageBase64 = dataUrl ? dataUrl.split(',')[1] : null
      img.src = dataUrl; img.classList.remove('hidden'); note.classList.add('hidden')
    }
  })

  // --- GPS ---
  $('gps-btn').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Geolocation not supported', false); return }
    $('gps-status').textContent = 'Locating…'
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        $('lat').value = pos.coords.latitude; $('lng').value = pos.coords.longitude
        $('address').value = `Lat ${pos.coords.latitude.toFixed(4)}, Lng ${pos.coords.longitude.toFixed(4)}`
        $('gps-status').textContent = 'Location captured from GPS'
      },
      () => { $('gps-status').textContent = 'Could not get location'; toast('Location denied', false) }
    )
  })
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => { $('lat').value = pos.coords.latitude; $('lng').value = pos.coords.longitude }, () => {})
  }

  // --- AI triage: analyze + auto-fill the form ---
  $('analyze-btn').addEventListener('click', async () => {
    const description = $('description').value.trim()
    if (!description && !imageBase64) { toast('Add a photo or a short description first', false); return }
    const btn = $('analyze-btn')
    btn.disabled = true
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Triaging…'
    try {
      const { data } = await api.post('/analyze', { description, category: $('category-select').value, imageBase64, mimeType })
      lastAnalysis = data
      // Auto-fill editable fields
      $('category-select').value = data.category
      $('severity-select').value = String(data.severity)
      if (!description && data.summary) $('description').value = data.summary
      renderAI(data)
    } catch (e) {
      toast('AI triage failed — you can still fill the form manually', false)
    } finally {
      btn.disabled = false
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">auto_awesome</span> Re-run AI triage'
    }
  })

  function renderAI(d) {
    // Verification banner
    const auth = {
      genuine: ['bg-secondary-container text-on-secondary-container', 'verified', 'Looks genuine'],
      needs_evidence: ['bg-tertiary-fixed text-on-tertiary-fixed', 'info', 'Needs more evidence'],
      suspect: ['bg-error-container text-on-error-container', 'gpp_maybe', 'Possible fake report'],
    }[d.authenticity]
    const av = $('ai-verify')
    if (auth) {
      av.className = `rounded-xl p-3 text-sm flex items-start gap-2 ${auth[0]}`
      av.innerHTML = `<span class="material-symbols-outlined text-[20px]">${auth[1]}</span><div><b>AI verification: ${auth[2]}</b><p class="text-xs opacity-90">${d.authenticity_reason || ''}</p></div>`
      av.classList.remove('hidden')
    }
    // Routing strip
    $('ai-source').textContent = d.source === 'gemini' ? 'Gemini Live' : 'Smart Fallback'
    $('ai-content').innerHTML = `<b>${d.title}</b> — ${d.summary}<br/><span class="text-xs text-primary font-bold">Routes to ${d.department} · priority ${d.priority_score}/100</span>`
    $('ai-result').classList.remove('hidden')
  }

  // --- Submit ---
  $('submit-btn').addEventListener('click', async () => {
    const btn = $('submit-btn')
    const cat = $('category-select').value
    const sev = Number($('severity-select').value) || 3
    const description = $('description').value.trim()
    if (!description && !thumbDataUrl) { toast('Add a photo or a description first', false); return }

    btn.disabled = true
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Submitting…'

    // Build the analysis payload from the (possibly edited) fields.
    const ai = lastAnalysis
      ? { ...lastAnalysis, category: cat, severity: sev, department: DEPT[cat] || 'General Services', priority_score: Math.min(100, sev * 16) }
      : null

    try {
      const payload = {
        description,
        category: cat,
        address: $('address').value,
        lat: parseFloat($('lat').value) || null,
        lng: parseFloat($('lng').value) || null,
        photo_data: thumbDataUrl || null,
        media_type: mediaType,
        video_data: mediaType === 'video' ? videoDataUrl : null,
        anonymous: $('anon-toggle').checked,
        ai,
      }
      const { data } = await api.post('/issues', payload)
      if (data.duplicate_of) toast(`Thanks! Looks like a duplicate of #${data.duplicate_of} (+${data.points_awarded} pts)`)
      else toast(`Report submitted! +${data.points_awarded} points`)
      setTimeout(() => { window.location.href = '/issue/' + data.id }, 900)
    } catch (e) {
      toast('Submit failed', false)
      btn.disabled = false
      btn.innerHTML = '<span class="material-symbols-outlined">send</span> Submit Report'
    }
  })
})()
