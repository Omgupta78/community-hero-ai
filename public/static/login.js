// Staff login page logic
(function () {
  const { api, toast } = window.CH
  const form = document.getElementById('login-form')
  const errEl = document.getElementById('login-error')
  const btn = document.getElementById('login-btn')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errEl.classList.add('hidden')
    btn.disabled = true
    const email = document.getElementById('login-email').value.trim()
    const password = document.getElementById('login-password').value
    try {
      const { data } = await api.post('/auth/login', { email, password })
      toast('Welcome, ' + data.user.name)
      // Route by role.
      window.location.href = data.user.role === 'admin' ? '/admin' : '/authority'
    } catch (err) {
      const msg = err?.response?.data?.error || 'Login failed'
      errEl.textContent = msg
      errEl.classList.remove('hidden')
      btn.disabled = false
    }
  })
})()
