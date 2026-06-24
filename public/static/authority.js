// Authority (department) dashboard — shows ONLY issues assigned to this authority.
(function () {
  const { api, CAT_ICON, STATUS_COLOR, severityBadge, esc, timeAgo, toast } = window.CH
  const $ = (id) => document.getElementById(id)
  let currentIssueId = null

  async function guard() {
    try {
      const { data } = await api.get('/auth/me')
      if (!data.authenticated || data.user.role !== 'authority') {
        window.location.href = '/login'
        return false
      }
      $('auth-name').textContent = data.user.name
      $('auth-dept').textContent = data.user.department || '—'
      return true
    } catch (e) {
      window.location.href = '/login'
      return false
    }
  }

  async function loadIssues() {
    let data
    try {
      ;({ data } = await api.get('/issues', { params: { assigned: 'me', limit: 100 } }))
    } catch (e) {
      if (e?.response?.status === 401) window.location.href = '/login'
      return
    }
    const issues = data.issues || []

    // stats
    $('d-total').textContent = issues.length
    $('d-open').textContent = issues.filter((i) => ['Assigned', 'Reported', 'Verified'].includes(i.status)).length
    $('d-progress').textContent = issues.filter((i) => i.status === 'In Progress').length
    $('d-resolved').textContent = issues.filter((i) => i.status === 'Resolved').length

    const el = $('dept-issues')
    if (!issues.length) {
      el.innerHTML = '<p class="text-center text-on-surface-variant py-8">No issues assigned to your department yet.</p>'
      return
    }
    el.innerHTML = issues.map((i) => {
      const [scls, slabel] = severityBadge(i.severity)
      return `
        <div class="bg-surface-container-low border border-outline-variant rounded-xl p-md">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-primary">${CAT_ICON[i.category] || 'place'}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <a href="/issue/${i.id}" class="font-semibold text-on-surface hover:text-primary truncate">#${i.id} ${esc(i.title)}</a>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${scls}">${slabel}</span>
              </div>
              <p class="text-xs text-on-surface-variant truncate mt-0.5">${esc(i.address) || 'Unknown location'}</p>
              <div class="flex items-center gap-2 mt-2 flex-wrap">
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[i.status] || ''}">${i.status}</span>
                <span class="text-xs text-on-surface-variant">${timeAgo(i.created_at)}</span>
              </div>
            </div>
            <button class="manage-btn shrink-0 bg-primary text-on-primary rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-1"
              data-id="${i.id}" data-title="${esc(i.title)}" data-status="${i.status}">
              <span class="material-symbols-outlined text-[16px]">edit</span> Update
            </button>
          </div>
        </div>`
    }).join('')

    document.querySelectorAll('.manage-btn').forEach((b) =>
      b.addEventListener('click', () => openModal(b.dataset))
    )
  }

  function openModal(d) {
    currentIssueId = d.id
    $('modal-issue-id').textContent = '#' + d.id
    $('modal-issue-title').textContent = d.title
    // Authorities can only move through Assigned → In Progress → Resolved.
    const allowed = ['Assigned', 'In Progress', 'Resolved']
    $('modal-status').value = allowed.includes(d.status) ? d.status : 'Assigned'
    $('modal-message').value = ''
    $('status-modal').classList.remove('hidden')
  }
  function closeModal() { $('status-modal').classList.add('hidden'); currentIssueId = null }

  $('modal-cancel').addEventListener('click', closeModal)
  $('modal-save').addEventListener('click', async () => {
    if (!currentIssueId) return
    const btn = $('modal-save')
    btn.disabled = true
    try {
      await api.patch(`/issues/${currentIssueId}/status`, {
        status: $('modal-status').value,
        message: $('modal-message').value,
      })
      toast('Issue updated')
      closeModal()
      loadIssues()
    } catch (e) {
      toast(e?.response?.data?.error || 'Update failed', false)
    } finally {
      btn.disabled = false
    }
  })

  ;(async function init() {
    if (!(await guard())) return
    loadIssues()
    setInterval(loadIssues, 8000)
  })()
})()
