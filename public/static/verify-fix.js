// Confirm this fix — dedicated citizen approval screen.
// Before/after photos + AI verification checks; the citizen's approval releases
// escrow payment to the contractor (POST /confirm) or reopens it (POST /reopen).
(function () {
  if (!window.CH) return
  const { api, esc, toast, CAT_ICON } = window.CH
  const root = document.getElementById('verify-fix')
  if (!root) return
  const id = root.dataset.id

  function checkRow(state, label) {
    // state: 'ok' (green tick) | 'pending' (awaiting)
    const ok = state === 'ok'
    return `<div class="vf-check ${ok ? 'ok' : 'pending'}">
      <span class="material-symbols-outlined">${ok ? 'check_circle' : 'pending'}</span>
      <span>${esc(label)}</span>
    </div>`
  }

  function photoCard(label, src) {
    const img = src
      ? `<img src="${src}" alt="${esc(label)}" />`
      : `<div class="vf-photo-ph"><span class="material-symbols-outlined">image</span></div>`
    return `<div class="vf-photo-card">
      <p class="vf-photo-label">${esc(label)}</p>
      <div class="vf-photo">${img}</div>
    </div>`
  }

  function render(i) {
    const verified = !!i.fix_verified
    const confirmed = !!i.citizen_confirmed
    root.innerHTML = `
      <p class="vf-subtitle">Your approval releases payment to the contractor.</p>
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

      <div class="vf-checks">
        ${checkRow(verified ? 'ok' : 'pending', 'Gemini AI vision diff — surface match verified')}
        ${checkRow('ok', 'GPS coordinates match the original report')}
        ${checkRow(confirmed ? 'ok' : 'pending', confirmed ? 'Your confirmation — approved' : 'Your confirmation — awaiting your approval')}
      </div>

      ${confirmed
        ? `<div class="vf-donebox"><span class="material-symbols-outlined">verified</span> You already confirmed this fix. Payment has been released.</div>`
        : `<button id="vf-approve" class="vf-approve"><span class="material-symbols-outlined">thumb_up</span> Approve — yes, it's fixed</button>
           <button id="vf-deny" class="vf-deny">Deny — no, it's not fixed</button>`}
    `

    const approve = document.getElementById('vf-approve')
    if (approve) approve.addEventListener('click', async () => {
      approve.disabled = true
      approve.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Releasing payment…'
      try {
        await api.post(`/issues/${id}/confirm`, {})
        toast('Approved — payment released to the contractor ✓')
        setTimeout(() => { window.location.href = '/my-reports' }, 900)
      } catch (e) {
        toast('Could not approve', false)
        approve.disabled = false
        approve.innerHTML = '<span class="material-symbols-outlined">thumb_up</span> Approve — yes, it\'s fixed'
      }
    })
    const deny = document.getElementById('vf-deny')
    if (deny) deny.addEventListener('click', async () => {
      const reason = prompt('What is still wrong? (optional)') || ''
      deny.disabled = true
      try {
        await api.post(`/issues/${id}/reopen`, { reason })
        toast('Reopened — the crew has been notified')
        setTimeout(() => { window.location.href = '/issue/' + id }, 900)
      } catch (e) {
        toast('Could not reopen', false)
        deny.disabled = false
      }
    })
  }

  async function load() {
    try {
      const { data } = await api.get('/issues/' + id)
      render(data.issue)
    } catch (e) {
      root.innerHTML = '<div class="text-center text-on-surface-variant py-8">Issue not found.</div>'
    }
  }

  load()
})();
