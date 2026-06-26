// Issue detail page — full info + live timeline + verify button + AI resolution plan
(function () {
  const { api, CAT_ICON, STATUS_COLOR, severityBadge, esc, timeAgo, toast } = window.CH
  const root = document.getElementById('issue-detail')
  const id = root.dataset.id
  let planData = null // cached AI plan so live-polling re-renders don't lose it

  async function load() {
    try {
      const { data } = await api.get('/issues/' + id)
      render(data.issue, data.updates)
      loadAgentTrace()
    } catch (e) {
      root.innerHTML = '<div class="text-center text-on-surface-variant py-8">Issue not found.</div>'
    }
  }

  const AGENT_ICON = {
    perceive: 'visibility', reason: 'psychology', dedupe: 'content_copy',
    prioritize: 'priority_high', route: 'alt_route', plan: 'engineering',
  }

  async function loadAgentTrace() {
    const wrap = document.getElementById('agent-trace-wrap')
    if (!wrap) return
    try {
      const { data } = await api.get(`/issues/${id}/agent`)
      const acts = data.actions || []
      if (!acts.length) { wrap.classList.add('hidden'); return }
      wrap.classList.remove('hidden')
      wrap.innerHTML = `
        <div class="flex items-center gap-2 mb-3 text-on-surface">
          <span class="material-symbols-outlined text-primary" style="font-variation-settings:'FILL' 1;">smart_toy</span>
          <h3 class="font-bold text-sm">Autonomous Triage Agent</h3>
          <span class="ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-primary text-on-primary">${acts.length} steps</span>
        </div>
        <div class="space-y-2">
          ${acts.map((a, idx) => `
            <div class="flex gap-3">
              <div class="flex flex-col items-center">
                <span class="w-7 h-7 rounded-full bg-primary-fixed text-primary flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[16px]">${AGENT_ICON[a.tool] || 'bolt'}</span>
                </span>
                ${idx < acts.length - 1 ? '<span class="w-0.5 flex-1 bg-outline-variant my-0.5"></span>' : ''}
              </div>
              <div class="pb-1 min-w-0">
                <p class="text-xs font-bold uppercase text-primary tracking-wide">${esc(a.tool)}</p>
                ${a.thought ? `<p class="text-sm text-on-surface italic">"${esc(a.thought)}"</p>` : ''}
                <p class="text-sm text-on-surface-variant">${esc(a.action)}</p>
              </div>
            </div>`).join('')}
        </div>`
    } catch (e) { wrap.classList.add('hidden') }
  }

  function planSectionHTML() {
    if (planData) {
      const chip = planData.source === 'gemini' ? 'Gemini' : 'Smart'
      return `
        <div class="flex items-center gap-2 mb-3 text-on-surface">
          <span class="material-symbols-outlined text-secondary">engineering</span>
          <h3 class="font-bold text-sm">AI Resolution Plan</h3>
          <span class="ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-secondary text-white">${chip}</span>
        </div>
        <div class="grid grid-cols-3 gap-2 mb-3">
          <div class="bg-surface-lowest rounded-lg p-2 text-center">
            <p class="text-[10px] uppercase font-bold text-on-surface-variant">Est. time</p>
            <p class="text-sm font-bold text-on-surface">${esc(planData.est_time)}</p>
          </div>
          <div class="bg-surface-lowest rounded-lg p-2 text-center">
            <p class="text-[10px] uppercase font-bold text-on-surface-variant">Est. cost</p>
            <p class="text-sm font-bold text-on-surface">${esc(planData.est_cost)}</p>
          </div>
          <div class="bg-surface-lowest rounded-lg p-2 text-center">
            <p class="text-[10px] uppercase font-bold text-on-surface-variant">Crew</p>
            <p class="text-sm font-bold text-on-surface">${esc(planData.crew)}</p>
          </div>
        </div>
        <p class="text-[11px] uppercase font-bold text-on-surface-variant mb-1">Action steps</p>
        <ol class="list-decimal list-inside space-y-1 text-sm text-on-surface mb-3">
          ${(planData.steps || []).map((s) => `<li>${esc(s)}</li>`).join('')}
        </ol>
        ${(planData.equipment || []).length ? `<p class="text-[11px] uppercase font-bold text-on-surface-variant mb-1">Equipment</p>
        <div class="flex flex-wrap gap-1 mb-3">${planData.equipment.map((e) => `<span class="text-xs px-2 py-0.5 rounded-full bg-surface-lowest border border-outline-variant text-on-surface">${esc(e)}</span>`).join('')}</div>` : ''}
        <div class="flex items-start gap-2 text-sm bg-error-container text-on-error-container rounded-lg p-2">
          <span class="material-symbols-outlined text-[18px]">health_and_safety</span>
          <span>${esc(planData.safety)}</span>
        </div>`
    }
    return `
      <div class="flex items-center gap-2 mb-2 text-on-surface">
        <span class="material-symbols-outlined text-secondary">engineering</span>
        <h3 class="font-bold text-sm">AI Resolution Plan</h3>
      </div>
      <p class="text-sm text-on-surface-variant mb-3">Let Gemini draft a municipal action plan — steps, crew, equipment, time, cost and safety.</p>
      <button id="plan-btn" class="w-full bg-secondary-container text-on-secondary-container rounded-lg py-2.5 font-bold flex items-center justify-center gap-2">
        <span class="material-symbols-outlined">auto_awesome</span> Generate AI Action Plan
      </button>`
  }

  async function loadPlan() {
    const wrap = document.getElementById('ai-plan-wrap')
    if (wrap) wrap.innerHTML = '<div class="text-center text-on-surface-variant py-4 flex items-center justify-center gap-2"><span class="material-symbols-outlined animate-spin">progress_activity</span> Gemini is drafting a plan…</div>'
    try {
      const { data } = await api.get(`/issues/${id}/plan`)
      planData = data
      if (wrap) wrap.innerHTML = planSectionHTML()
    } catch (e) {
      if (wrap) wrap.innerHTML = planSectionHTML()
      toast('Could not generate plan', false)
    }
  }

  function render(i, updates) {
    const [scls, slabel] = severityBadge(i.severity)
    const photo = i.media_type === 'video' && i.video_data
      ? `<div class="relative mb-4">
           <video src="${i.video_data}" ${i.photo_data ? `poster="${i.photo_data}"` : ''} class="w-full rounded-xl max-h-80 bg-black" controls playsinline></video>
           <span class="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/70 text-white flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">videocam</span>VIDEO</span>
         </div>`
      : i.photo_data
      ? `<img src="${i.photo_data}" class="w-full rounded-xl max-h-72 object-cover mb-4"/>`
      : ''

    // Before/after proof-of-fix (contractor loop)
    const proof = i.after_photo
      ? `<div class="bg-surface-lowest border ${i.fix_verified ? 'border-secondary' : 'border-outline-variant'} rounded-xl p-md mb-4">
           <div class="flex items-center gap-2 mb-2">
             <span class="material-symbols-outlined ${i.fix_verified ? 'text-secondary' : 'text-on-surface-variant'}">${i.fix_verified ? 'verified' : 'pending'}</span>
             <h3 class="font-bold text-sm text-on-surface">Proof of Fix ${i.fix_verified ? '· AI-verified ✓' : '· pending verification'}</h3>
           </div>
           <div class="grid grid-cols-2 gap-2">
             <div><p class="text-[10px] uppercase font-bold text-on-surface-variant mb-1">Before</p>${i.photo_data ? `<img src="${i.photo_data}" class="w-full h-32 object-cover rounded-lg"/>` : '<div class="h-32 bg-surface-container rounded-lg"></div>'}</div>
             <div><p class="text-[10px] uppercase font-bold text-on-surface-variant mb-1">After</p><img src="${i.after_photo}" class="w-full h-32 object-cover rounded-lg"/></div>
           </div>
           ${i.fix_reason ? `<p class="text-xs text-on-surface-variant mt-2">${esc(i.fix_reason)}</p>` : ''}
         </div>`
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
        ${i.assignee_name ? `<p class="text-xs text-secondary font-bold mt-1 flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">assignment_ind</span>Handled by ${esc(i.assignee_department || i.assignee_name)} authority</p>` : ''}
        <div class="flex items-center gap-3 mt-2 text-xs">
          <span class="flex items-center gap-1 text-secondary font-bold"><span class="material-symbols-outlined text-[15px]">person_pin_circle</span>${i.on_site_count || 0} on-site</span>
          <span class="flex items-center gap-1 text-on-surface-variant"><span class="material-symbols-outlined text-[15px]">public</span>${i.remote_count || 0} remote</span>
          <span class="flex items-center gap-1 text-primary font-bold ml-auto"><span class="material-symbols-outlined text-[15px]">verified_user</span>trust ${i.trust_weight || 0}</span>
        </div>
      </div>

      <div class="bg-primary-fixed rounded-xl p-md mb-4">
        <div class="flex items-center gap-2 mb-1 text-primary">
          <span class="material-symbols-outlined">auto_awesome</span>
          <h3 class="font-bold text-sm">AI Analysis</h3>
          <span class="ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/60 text-primary">${i.ai_source === 'gemini' ? 'Gemini' : 'Smart'}</span>
        </div>
        ${i.authenticity && i.authenticity !== 'genuine' ? `<div class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full mb-2 ${i.authenticity === 'suspect' ? 'bg-error-container text-on-error-container' : 'bg-tertiary-fixed text-on-tertiary-fixed'}"><span class="material-symbols-outlined text-[14px]">${i.authenticity === 'suspect' ? 'gpp_maybe' : 'info'}</span>${i.authenticity === 'suspect' ? 'AI: possible fake report' : 'AI: needs more evidence'}</div>` : `<div class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full mb-2 bg-secondary-container text-on-secondary-container"><span class="material-symbols-outlined text-[14px]">verified</span>AI-verified genuine</div>`}
        <p class="text-sm text-on-surface">${esc(i.ai_summary) || ''}</p>
        <p class="text-xs text-primary font-bold mt-2">Priority score: ${Math.round(i.priority_score)}/100${i.department ? ' · Routed to ' + esc(i.department) : ''}</p>
      </div>

      <div id="agent-trace-wrap" class="hidden bg-surface-lowest border border-primary/30 rounded-xl p-md mb-4"></div>

      ${proof}

      <div id="ai-plan-wrap" class="bg-secondary-container/40 border border-secondary-container rounded-xl p-md mb-4">
        ${planSectionHTML()}
      </div>

      <button id="verify-btn" class="w-full bg-secondary text-white rounded-xl py-3.5 font-bold flex items-center justify-center gap-2 mb-6">
        <span class="material-symbols-outlined">verified</span> Verify This Issue
      </button>

      <h3 class="font-semibold text-on-surface mb-3">Timeline</h3>
      <div class="bg-surface-lowest border border-outline-variant rounded-xl p-md">
        ${timeline || '<p class="text-sm text-on-surface-variant">No updates yet.</p>'}
      </div>`

    document.getElementById('verify-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget
      btn.disabled = true
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span> Checking your location…'
      const loc = window.CH.getLocation ? await window.CH.getLocation() : null
      try {
        const { data } = await api.post(`/issues/${id}/verify`, { vote: 'confirm', lat: loc && loc.lat, lng: loc && loc.lng })
        toast(data.on_site ? `On-site verified ✓ +${data.points_awarded} pts` : `Remote review recorded +${data.points_awarded} pt`)
        load()
      } catch (err) {
        const s = err.response && err.response.status
        if (s === 409) toast('Already verified by you', false)
        else if (s === 403) toast((err.response.data && err.response.data.error) || "You can't verify this", false)
        else toast('Verify failed', false)
        btn.disabled = false
        btn.innerHTML = '<span class="material-symbols-outlined">verified</span> Verify This Issue'
      }
    })

    const planBtn = document.getElementById('plan-btn')
    if (planBtn) planBtn.addEventListener('click', loadPlan)
  }

  load()
  setInterval(load, 8000) // live timeline updates
})()
