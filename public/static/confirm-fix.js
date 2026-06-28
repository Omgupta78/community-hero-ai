// Confirm Fix — citizen signs off on a contractor's fix.
// Yes → thank-you card + optional message → releases escrow payment.
// No  → "what's still wrong?" → reopens the issue to In Progress.
(function () {
  if (!window.CH) return
  const { api, esc, toast, CAT_ICON } = window.CH
  const root = document.getElementById('confirm-fix')
  if (!root) return
  const inr = (n) => '\u20B9' + Number(n || 0).toLocaleString('en-IN')
  const params = new URLSearchParams(location.search)

  function photoCard(label, src) {
    const img = src ? `<img src="${src}" alt="${esc(label)}" />` : `<div class="vf-photo-ph"><span class="material-symbols-outlined">image</span></div>`
    return `<div class="vf-photo-card"><p class="vf-photo-label">${esc(label)}</p><div class="vf-photo">${img}</div></div>`
  }

  function render(i) {
    const contractor = i.contractor_name || 'the contractor'
    const amount = i.escrow_amount || 0

    if (i.citizen_confirmed) {
      root.innerHTML = `<div class="vf-donebox"><span class="material-symbols-outlined">verified</span> You already confirmed this fix. Payment has been released.</div>
        <a href="/my-reports" class="cf-back">← Back to My Reports</a>`
      return
    }

    root.innerHTML = `
      <p class="vf-subtitle">${esc(contractor)} marked this as fixed. Please confirm to release payment.</p>
      <div class="vf-issue">
        <span class="material-symbols-outlined vf-issue-ic">${CAT_ICON[i.category] || 'place'}</span>
        <div class="min-w-0">
          <h2 class="vf-issue-title">${esc(i.title)}</h2>
          <p class="vf-issue-loc"><span class="material-symbols-outlined">location_on</span>${esc(i.address || 'Unknown location')}</p>
        </div>
      </div>
      <div class="vf-grid">
        ${photoCard('Before', i.photo_data)}
        ${photoCard('After', i.after_photo)}
      </div>

      <div id="cf-actions">
        <button id="cf-yes" class="vf-approve"><span class="material-symbols-outlined">thumb_up</span> Yes, it's fixed!</button>
        <button id="cf-no" class="vf-deny">Not fixed yet</button>
      </div>

      <div id="cf-thanks" class="hidden cf-card">
        <div class="cf-greeting"><span class="cf-emoji">🎉</span>
          <p class="cf-greeting-title">Thank you ${esc(contractor)}!</p>
          <p class="cf-greeting-sub">Your work made a difference.</p></div>
        <label class="cf-label">Rate ${esc(contractor)}'s work</label>
        <div id="cf-stars" class="cf-stars" role="radiogroup" aria-label="Rate the contractor">
          ${[1,2,3,4,5].map((n) => `<button type="button" class="cf-star" data-val="${n}" aria-label="${n} star${n>1?'s':''}"><span class="material-symbols-outlined">star</span></button>`).join('')}
        </div>
        <label class="cf-label">Leave a message (optional)</label>
        <textarea id="cf-msg" rows="2" placeholder="e.g. Great work, fixed quickly!" class="cf-input"></textarea>
        <button id="cf-send" class="vf-approve"><span class="material-symbols-outlined">send</span> Send Thanks</button>
      </div>

      <div id="cf-reopen" class="hidden cf-card">
        <label class="cf-label">What's still wrong?</label>
        <textarea id="cf-reason" rows="2" placeholder="Describe what still needs fixing…" class="cf-input"></textarea>
        <button id="cf-reopen-submit" class="cf-reopen-btn"><span class="material-symbols-outlined">restart_alt</span> Submit</button>
      </div>

      <div id="cf-done" class="hidden"></div>
    `

    const actions = document.getElementById('cf-actions')
    const thanks = document.getElementById('cf-thanks')
    const reopen = document.getElementById('cf-reopen')
    const done = document.getElementById('cf-done')

    // Star rating widget (defaults to 5). Hover/click fills stars up to the value.
    let rating = 5
    const stars = Array.from(document.querySelectorAll('#cf-stars .cf-star'))
    const paint = (val) => stars.forEach((s) => s.classList.toggle('on', Number(s.dataset.val) <= val))
    stars.forEach((s) => {
      s.addEventListener('click', () => { rating = Number(s.dataset.val); paint(rating) })
      s.addEventListener('mouseenter', () => paint(Number(s.dataset.val)))
    })
    const starsWrap = document.getElementById('cf-stars')
    if (starsWrap) starsWrap.addEventListener('mouseleave', () => paint(rating))
    paint(rating)

    document.getElementById('cf-yes').addEventListener('click', () => {
      actions.classList.add('hidden'); reopen.classList.add('hidden'); thanks.classList.remove('hidden')
    })
    document.getElementById('cf-no').addEventListener('click', () => {
      actions.classList.add('hidden'); thanks.classList.add('hidden'); reopen.classList.remove('hidden')
    })

    document.getElementById('cf-send').addEventListener('click', async (e) => {
      const btn = e.currentTarget
      const message = (document.getElementById('cf-msg').value || '').trim()
      btn.disabled = true
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Releasing payment…'
      try {
        const { data } = await api.post(`/issues/${i.id}/confirm`, { message, rating })
        const paid = data.escrow_amount || data.released || amount
        const who = data.contractor || contractor
        thanks.classList.add('hidden')
        done.classList.remove('hidden')
        done.innerHTML = `
          <div class="cf-paid"><span class="material-symbols-outlined">paid</span>
            <p>Payment of <b>${inr(paid)}</b> released to <b>${esc(who)}</b></p></div>
          <div class="cf-rated"><span class="material-symbols-outlined">star</span> You rated ${esc(who)} ${rating}/5</div>
          <div class="vf-donebox"><span class="material-symbols-outlined">verified</span> Issue marked as Resolved.</div>
          <a href="/my-reports" class="cf-back">← Back to My Reports</a>`
      } catch (err) {
        toast('Could not confirm', false)
        btn.disabled = false
        btn.innerHTML = '<span class="material-symbols-outlined">send</span> Send Thanks'
      }
    })

    document.getElementById('cf-reopen-submit').addEventListener('click', async (e) => {
      const btn = e.currentTarget
      const reason = (document.getElementById('cf-reason').value || '').trim()
      if (!reason) return toast('Tell us what is still wrong', false)
      btn.disabled = true
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Sending…'
      try {
        await api.post(`/issues/${i.id}/reopen`, { reason })
        reopen.classList.add('hidden')
        done.classList.remove('hidden')
        done.innerHTML = `<div class="vf-donebox"><span class="material-symbols-outlined">restart_alt</span> Sent back to the crew — they've been notified to re-fix it.</div>
          <a href="/my-reports" class="cf-back">← Back to My Reports</a>`
      } catch (err) {
        toast('Could not submit', false)
        btn.disabled = false
        btn.innerHTML = '<span class="material-symbols-outlined">restart_alt</span> Submit'
      }
    })
  }

  function emptyState() {
    root.innerHTML = `<div class="text-center text-on-surface-variant py-12">
      <span class="material-symbols-outlined text-[40px] text-outline">task_alt</span>
      <p class="mt-2 text-sm">No fixes awaiting your confirmation right now.</p>
      <a href="/my-reports" class="cf-back">← Back to My Reports</a></div>`
  }

  async function resolveTargetId() {
    const q = params.get('id')
    if (q) return q
    try {
      const { data } = await api.get('/issues', { params: { mine: 'true', limit: 100 } })
      const pending = (data.issues || []).filter((i) => i.status === 'Resolved' && i.fix_verified && !i.citizen_confirmed)
      return pending.length ? pending[0].id : null
    } catch (e) { return null }
  }

  async function load() {
    const id = await resolveTargetId()
    if (!id) return emptyState()
    try {
      const { data } = await api.get('/issues/' + id)
      render(data.issue)
    } catch (e) {
      root.innerHTML = '<div class="text-center text-on-surface-variant py-8">Issue not found.</div>'
    }
  }

  load()
})();
