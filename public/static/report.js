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

  const MAX_VIDEO_MB = 12        // max clip size to store for playback
  const GEMINI_VIDEO_MAX_MB = 6  // max clip size to send to Gemini for true video analysis

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
          const maxDim = 1280
          let w = video.videoWidth || 640
          let h = video.videoHeight || 480
          if (w > maxDim || h > maxDim) {
            if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim }
            else { w = Math.round((w * maxDim) / h); h = maxDim }
          }
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          canvas.getContext('2d').drawImage(video, 0, 0, w, h)
          finish(canvas.toDataURL('image/jpeg', 0.7))
        } catch (e) { finish(null) }
      }
      video.onerror = () => finish(null)
      setTimeout(() => finish(null), 8000) // safety timeout
    })
  }

  const readAsDataURL = (file) =>
    new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(file) })

  // Downscale an image File to a max dimension and re-encode as JPEG — keeps DB
  // rows, list payloads and Gemini uploads small without hurting visible quality.
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
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          canvas.getContext('2d').drawImage(im, 0, 0, width, height)
          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch (e) { URL.revokeObjectURL(url); resolve(null) }
      }
      im.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
      im.src = url
    })
  }

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
      // Playable preview
      const objUrl = URL.createObjectURL(file)
      vid.src = objUrl
      vid.classList.remove('hidden')
      img.classList.add('hidden')
      note.classList.remove('hidden')
      note.textContent = 'Extracting a frame…'

      const frame = await extractFrame(file)
      thumbDataUrl = frame || null

      const sizeMB = file.size / (1024 * 1024)
      // Store the clip for playback if it's not too large.
      videoDataUrl = sizeMB <= MAX_VIDEO_MB ? await readAsDataURL(file) : null

      // Prefer TRUE video analysis by Gemini when the clip is small enough;
      // otherwise fall back to analyzing the extracted frame.
      if (videoDataUrl && sizeMB <= GEMINI_VIDEO_MAX_MB) {
        imageBase64 = videoDataUrl.split(',')[1]
        mimeType = file.type || 'video/mp4'
        note.textContent = `Video ready (${sizeMB.toFixed(1)} MB) — Gemini will analyze the actual clip.`
      } else if (frame) {
        imageBase64 = frame.split(',')[1]
        mimeType = 'image/jpeg'
        note.textContent =
          sizeMB > MAX_VIDEO_MB
            ? `Clip is ${sizeMB.toFixed(1)} MB — too large to attach; Gemini will analyze a frame. Use a shorter clip (≤ ${MAX_VIDEO_MB} MB) to attach the video.`
            : `Video ready (${sizeMB.toFixed(1)} MB) — Gemini will analyze a frame (clip too large for full-video analysis).`
      } else {
        imageBase64 = null
        mimeType = null
      }
    } else {
      mediaType = 'image'
      mimeType = 'image/jpeg'
      videoDataUrl = null
      vid.classList.add('hidden')
      // Downscale before storing/analyzing (fallback to raw if it fails).
      const dataUrl = (await downscaleImage(file)) || (await readAsDataURL(file))
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
    const auth = {
      genuine: ['bg-secondary-container text-on-secondary-container', 'verified', 'Looks genuine'],
      needs_evidence: ['bg-tertiary-fixed text-on-tertiary-fixed', 'info', 'Needs more evidence'],
      suspect: ['bg-error-container text-on-error-container', 'gpp_maybe', 'Possible fake report'],
    }[d.authenticity] || null
    const authBanner = auth
      ? `<div class="flex items-start gap-2 rounded-lg p-2.5 mb-1 ${auth[0]}">
           <span class="material-symbols-outlined text-[20px]">${auth[1]}</span>
           <div><p class="font-bold text-sm">AI verification: ${auth[2]}</p>
           <p class="text-xs opacity-90">${(d.authenticity_reason || '')}</p></div>
         </div>`
      : ''
    $('ai-content').innerHTML = authBanner + `
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

  // Voice-based reporting (Web Speech API — browser-native, no key)
  ;(function setupVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const btn = $('voice-btn')
    if (!SR || !btn) return // unsupported → keep button hidden
    btn.classList.remove('hidden')
    const rec = new SR()
    rec.lang = 'en-IN'
    rec.interimResults = true
    rec.continuous = false
    let listening = false
    let baseText = ''

    rec.onresult = (e) => {
      let transcript = ''
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript
      $('description').value = (baseText ? baseText + ' ' : '') + transcript
    }
    rec.onerror = () => { $('voice-status').textContent = 'Could not hear you — try again.'; }
    rec.onend = () => {
      listening = false
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">mic</span> Speak'
      $('voice-status').classList.add('hidden')
    }

    btn.addEventListener('click', () => {
      if (listening) { rec.stop(); return }
      baseText = $('description').value.trim()
      try { rec.start() } catch (e) { return }
      listening = true
      btn.innerHTML = '<span class="material-symbols-outlined text-[18px] text-error animate-pulse">mic</span> Listening… tap to stop'
      const st = $('voice-status'); st.textContent = 'Listening… speak the issue, e.g. "Broken streetlight near PEC gate".'; st.classList.remove('hidden')
    })
  })()

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
