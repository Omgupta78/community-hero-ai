// Admin operations — real priority queue, issue table, status updates, charts
(function () {
  const { api, CAT_ICON, STATUS_COLOR, severityBadge, esc } = window.CH
  let catChart, statusChart
  let currentIssueId = null
  let authoritiesLoaded = false

  const $ = (id) => document.getElementById(id)

  async function guard() {
    try {
      const { data } = await api.get('/auth/me')
      if (!data.authenticated || data.user.role !== 'admin') {
        window.location.href = data.authenticated ? '/authority' : '/login'
        return false
      }
      return true
    } catch (e) {
      window.location.href = '/login'
      return false
    }
  }

  async function loadAuthorities() {
    if (authoritiesLoaded) return
    try {
      const { data } = await api.get('/authorities')
      const sel = $('modal-authority')
      data.authorities.forEach((a) => {
        const opt = document.createElement('option')
        opt.value = a.id
        opt.textContent = `${a.department} — ${a.name}`
        sel.appendChild(opt)
      })
      authoritiesLoaded = true
    } catch (e) { /* ignore */ }
  }

  async function loadStats() {
    const { data } = await api.get('/stats')
    $('a-total').textContent = data.total
    $('a-critical').textContent = data.critical
    $('a-pending').textContent = data.pending
    $('a-resolved').textContent = data.resolved
    drawCharts(data)
  }

  async function loadQueue() {
    const { data } = await api.get('/issues', { params: { verify: 'true', limit: 6 } })
    const el = $('priority-queue')
    if (!data.issues.length) { el.innerHTML = '<p class="text-sm text-on-surface-variant py-4">Queue is clear.</p>'; return }
    el.innerHTML = data.issues.map((i, idx) => {
      const [scls, slabel] = severityBadge(i.severity)
      return `
        <div class="flex items-center gap-3 bg-surface-container-low rounded-lg p-3">
          <span class="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-bold shrink-0">${idx + 1}</span>
          <span class="material-symbols-outlined text-primary">${CAT_ICON[i.category] || 'place'}</span>
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-on-surface truncate">${esc(i.title)}</p>
            <p class="text-xs text-on-surface-variant truncate">${esc(i.address)}</p>
          </div>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${scls}">${slabel}</span>
          <span class="text-sm font-bold text-primary">${Math.round(i.priority_score)}</span>
        </div>`
    }).join('')
  }

  async function loadTable() {
    const { data } = await api.get('/issues', { params: { limit: 50 } })
    $('issue-table').innerHTML = data.issues.map((i) => {
      const [scls, slabel] = severityBadge(i.severity)
      const assignee = i.assignee_name
        ? `<span class="text-on-surface">${esc(i.assignee_department || i.assignee_name)}</span>`
        : '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-error-container text-on-error-container">Unassigned</span>'
      return `
        <tr class="border-b border-outline-variant">
          <td class="py-2 pr-2"><a href="/issue/${i.id}" class="font-medium text-on-surface hover:text-primary">#${i.id} ${esc(i.title)}</a></td>
          <td class="py-2 px-2 text-on-surface-variant">${i.category}</td>
          <td class="py-2 px-2"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${scls}">${slabel}</span></td>
          <td class="py-2 px-2"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[i.status] || ''}">${i.status}</span></td>
          <td class="py-2 px-2 text-xs">${assignee}</td>
          <td class="py-2 pl-2">
            <button class="manage-btn text-primary font-bold text-xs flex items-center gap-1"
              data-id="${i.id}" data-title="${esc(i.title)}" data-status="${i.status}" data-assigned="${i.assigned_to || ''}">
              <span class="material-symbols-outlined text-[16px]">edit</span> Manage
            </button>
          </td>
        </tr>`
    }).join('')

    document.querySelectorAll('.manage-btn').forEach((b) => {
      b.addEventListener('click', () => openModal(b.dataset))
    })
  }

  function drawCharts(data) {
    const catLabels = data.byCategory.map((r) => r.category)
    const catData = data.byCategory.map((r) => r.n)
    const statusLabels = data.byStatus.map((r) => r.status)
    const statusData = data.byStatus.map((r) => r.n)
    const palette = ['#003d9b', '#006c47', '#7d5200', '#ba1a1a', '#0052cc', '#737685']

    if (catChart) { catChart.data.labels = catLabels; catChart.data.datasets[0].data = catData; catChart.update() }
    else catChart = new Chart($('adminCategoryChart'), {
      type: 'bar',
      data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: '#0052cc', borderRadius: 6 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    })

    if (statusChart) { statusChart.data.labels = statusLabels; statusChart.data.datasets[0].data = statusData; statusChart.update() }
    else statusChart = new Chart($('adminStatusChart'), {
      type: 'doughnut',
      data: { labels: statusLabels, datasets: [{ data: statusData, backgroundColor: palette }] },
      options: { plugins: { legend: { position: 'bottom' } } },
    })
  }

  async function openModal(d) {
    await loadAuthorities()
    currentIssueId = d.id
    $('modal-issue-id').textContent = '#' + d.id
    $('modal-issue-title').textContent = d.title
    $('modal-status').value = d.status
    $('modal-authority').value = d.assigned || ''
    $('modal-message').value = ''
    $('status-modal').classList.remove('hidden')
  }
  function closeModal() { $('status-modal').classList.add('hidden'); currentIssueId = null }

  $('modal-cancel').addEventListener('click', closeModal)
  $('modal-save').addEventListener('click', async () => {
    if (!currentIssueId) return
    const btn = $('modal-save')
    btn.disabled = true
    const authorityId = $('modal-authority').value
    const message = $('modal-message').value
    try {
      if (authorityId) {
        // Assign (or re-assign) to a department authority.
        await api.patch(`/issues/${currentIssueId}/assign`, { authority_id: Number(authorityId), message })
        window.CH.toast('Issue assigned to authority')
      } else {
        // Plain status change without assignment.
        await api.patch(`/issues/${currentIssueId}/status`, {
          status: $('modal-status').value,
          message,
        })
        window.CH.toast('Issue updated')
      }
      closeModal()
      refresh()
    } catch (e) {
      window.CH.toast(e?.response?.data?.error || 'Update failed', false)
      if (e?.response?.status === 401) window.location.href = '/login'
    } finally { btn.disabled = false }
  })

  function refresh() { loadStats(); loadQueue(); loadTable() }

  ;(async function init() {
    if (!(await guard())) return
    refresh()
    setInterval(refresh, 6000) // real-time admin dashboard
  })()
})()
