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
      const dest = data.user.role === 'admin' ? '/admin' : data.user.role === 'contractor' ? '/contractor' : '/authority'
      window.location.href = dest
    } catch (err) {
      const msg = err?.response?.data?.error || 'Login failed'
      errEl.textContent = msg
      errEl.classList.remove('hidden')
      btn.disabled = false
    }
  })

  // Open responder registration
  const regToggle = document.getElementById('reg-toggle')
  const regForm = document.getElementById('register-form')
  const regErr = document.getElementById('reg-error')
  const regBtn = document.getElementById('reg-btn')
  if (regToggle) {
    regToggle.addEventListener('click', () => {
      regForm.classList.toggle('hidden')
      document.getElementById('reg-chevron').textContent = regForm.classList.contains('hidden') ? 'expand_more' : 'expand_less'
    })
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      regErr.classList.add('hidden')
      regBtn.disabled = true
      try {
        const { data } = await api.post('/auth/register-contractor', {
          name: document.getElementById('reg-name').value.trim(),
          email: document.getElementById('reg-email').value.trim(),
          password: document.getElementById('reg-password').value,
        })
        toast('Welcome to the network, ' + data.user.name)
        window.location.href = '/contractor'
      } catch (err) {
        regErr.textContent = err?.response?.data?.error || 'Registration failed'
        regErr.classList.remove('hidden')
        regBtn.disabled = false
      }
    })
  }
})()
