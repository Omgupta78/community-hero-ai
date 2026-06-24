// Verify page — real community verification voting
(function () {
  const { api, CAT_ICON, severityBadge, esc, timeAgo, toast } = window.CH

  async function load() {
    try {
      const { data } = await api.get('/issues', { params: { verify: 'true' } })
      const el = document.getElementById('verify-list')
      if (!data.issues.length) {
        el.innerHTML = '<div class="text-center text-on-surface-variant py-8">Nothing to verify right now. Great work!</div>'
        return
      }
      el.innerHTML = data.issues.map(card).join('')
      bind()
    } catch (e) { console.error(e) }
  }

  function card(i) {
    const [scls, slabel] = severityBadge(i.severity)
    const photo = i.photo_data
      ? `<img src="${i.photo_data}" class="w-full h-40 object-cover rounded-lg mb-3"/>`
      : ''
    return `
      <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md" data-id="${i.id}">
        ${photo}
        <div class="flex items-center gap-2 flex-wrap mb-1">
          <span class="material-symbols-outlined text-primary">${CAT_ICON[i.category] || 'place'}</span>
          <h4 class="font-semibold text-on-surface">${esc(i.title)}</h4>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${scls}">${slabel}</span>
        </div>
        <p class="text-sm text-on-surface-variant">${esc(i.description) || i.ai_summary || ''}</p>
        <p class="text-xs text-on-surface-variant mt-1">${esc(i.address)} · ${timeAgo(i.created_at)} · ${i.verify_count || 0} confirms</p>
        <div class="flex gap-2 mt-3">
          <button class="confirm-btn flex-1 bg-secondary text-white rounded-lg py-2.5 font-bold flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-[18px]">check_circle</span> Confirm
          </button>
          <button class="reject-btn flex-1 border border-outline-variant text-on-surface rounded-lg py-2.5 font-bold flex items-center justify-center gap-1">
            <span class="material-symbols-outlined text-[18px]">cancel</span> Not Valid
          </button>
        </div>
      </div>`
  }

  function bind() {
    document.querySelectorAll('#verify-list [data-id]').forEach((node) => {
      const id = node.dataset.id
      node.querySelector('.confirm-btn').addEventListener('click', () => vote(id, 'confirm', node))
      node.querySelector('.reject-btn').addEventListener('click', () => vote(id, 'reject', node))
    })
  }

  async function vote(id, v, node) {
    node.querySelectorAll('button').forEach((b) => (b.disabled = true))
    try {
      const { data } = await api.post(`/issues/${id}/verify`, { vote: v })
      toast(v === 'confirm' ? `Confirmed! +5 points (${data.verify_count} total)` : 'Marked as not valid. +5 points')
      node.style.opacity = '0.4'
      setTimeout(load, 1200)
    } catch (e) {
      if (e.response && e.response.status === 409) toast('You already verified this', false)
      else toast('Vote failed', false)
      node.querySelectorAll('button').forEach((b) => (b.disabled = false))
    }
  }

  load()
  setInterval(load, 8000)
})()
