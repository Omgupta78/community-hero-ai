// Issue detail page — full info + live timeline + verify button
(function () {
  const { api, CAT_ICON, STATUS_COLOR, severityBadge, esc, timeAgo, toast } = window.CH
  const root = document.getElementById('issue-detail')
  const id = root.dataset.id

  async function load() {
    try {
      const { data } = await api.get('/issues/' + id)
      render(data.issue, data.updates)
    } catch (e) {
      root.innerHTML = '<div class="text-center text-on-surface-variant py-8">Issue not found.</div>'
    }
  }

  function render(i, updates) {
    const [scls, slabel] = severityBadge(i.severity)
    const photo = i.photo_data
      ? `<img src="${i.photo_data}" class="w-full rounded-xl max-h-72 object-cover mb-4"/>`
      : ''
    const timeline = updates.map((u, idx) => `
      <div class="flex gap-3">
        <div class="flex flex-col items-center">
          <span class="w-3 h-3 rounded-full ${idx === updates.length - 1 ? 'bg-primary' : 'bg-outline-variant'}"></span>
          ${idx < updates.length - 1 ? '<span class="w-0.5 flex-1 bg-outline-variant"></span>' : ''}
        </div>
        <div class="pb-4">
          <p class="font-semibold text-on-surface text-sm">${u.status}${u.department ? ' · ' + esc(u.department) : ''}</p>
          <p class="text-sm text-on-surface-variant">${esc(u.message) || ''}</p>
          <p class="text-xs text-on-surface-variant mt-0.5">${esc(u.author)} · ${timeAgo(u.created_at)}</p>
        </div>
      </div>`).join('')

    root.innerHTML = `
      ${photo}
      <div class="flex items-center gap-2 flex-wrap mb-2">
        <span class="material-symbols-outlined text-primary text-[28px]">${CAT_ICON[i.category] || 'place'}</span>
        <h2 class="text-[22px] font-bold text-on-surface">${esc(i.title)}</h2>
      </div>
      <div class="flex items-center gap-2 flex-wrap mb-4">
        <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${scls}">${slabel}</span>
        <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_COLOR[i.status] || ''}">${i.status}</span>
        <span class="text-[11px] font-bold px-2.5 py-1 rounded-full bg-surface-container text-on-surface">${i.category}</span>
        <span class="text-xs text-on-surface-variant ml-auto flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">verified</span>${i.verify_count} confirms</span>
      </div>

      <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md mb-4">
        <p class="text-sm text-on-surface">${esc(i.description) || 'No description provided.'}</p>
        <p class="text-xs text-on-surface-variant mt-3 flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">location_on</span>${esc(i.address) || 'Unknown location'}</p>
        <p class="text-xs text-on-surface-variant mt-1 flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">person</span>${i.anonymous ? 'Anonymous reporter' : esc(i.reporter_name || 'Citizen')} · ${timeAgo(i.created_at)}</p>
      </div>

      <div class="bg-primary-fixed rounded-xl p-md mb-4">
        <div class="flex items-center gap-2 mb-1 text-primary">
          <span class="material-symbols-outlined">auto_awesome</span>
          <h3 class="font-bold text-sm">AI Analysis</h3>
          <span class="ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/60 text-primary">${i.ai_source === 'gemini' ? 'Gemini' : 'Smart'}</span>
        </div>
        <p class="text-sm text-on-surface">${esc(i.ai_summary) || ''}</p>
        <p class="text-xs text-primary font-bold mt-2">Priority score: ${Math.round(i.priority_score)}/100${i.department ? ' · Routed to ' + esc(i.department) : ''}</p>
      </div>

      <button id="verify-btn" class="w-full bg-secondary text-white rounded-xl py-3.5 font-bold flex items-center justify-center gap-2 mb-6">
        <span class="material-symbols-outlined">verified</span> Verify This Issue (+5 pts)
      </button>

      <h3 class="font-semibold text-on-surface mb-3">Timeline</h3>
      <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
        ${timeline || '<p class="text-sm text-on-surface-variant">No updates yet.</p>'}
      </div>`

    document.getElementById('verify-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget
      btn.disabled = true
      try {
        await api.post(`/issues/${id}/verify`, { vote: 'confirm' })
        toast('Verified! +5 points')
        load()
      } catch (err) {
        if (err.response && err.response.status === 409) toast('Already verified by you', false)
        else toast('Verify failed', false)
        btn.disabled = false
      }
    })
  }

  load()
  setInterval(load, 8000) // live timeline updates
})()
