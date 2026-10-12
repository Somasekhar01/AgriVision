import { useEffect, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const chatSeed = [
  {
    role: 'assistant',
    content: 'Hello, farmer! I can help with crop planning, soil care, irrigation, and disease checks.',
  },
]

const defaultCropForm = {
  phValue: '6.3',
  moisture: '38',
  nitrogen: '62',
  phosphate: '30',
  weather: 'Warm and dry',
  soilType: 'Loamy soil',
  location: 'Nashik',
  landType: 'Irrigated field',
  month: 'June',
  feedback: 'Need a crop plan for tomato and maize during the rainy season.',
}

function App() {
  const [health, setHealth] = useState(null)
  const [status, setStatus] = useState('')
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('agrivision-user')
    return stored ? JSON.parse(stored) : null
  })
  const [token, setToken] = useState(() => localStorage.getItem('agrivision-token') || '')
  const [authMode, setAuthMode] = useState('login')
  const [authForm, setAuthForm] = useState({
    name: 'Demo Farmer',
    email: 'demo@agrivision.local',
    password: 'demo123',
  })
  const [chatInput, setChatInput] = useState('How can I improve moisture retention for my vegetable field?')
  const [chatMessages, setChatMessages] = useState(chatSeed)
  const [chatLoading, setChatLoading] = useState(false)
  const [cropForm, setCropForm] = useState(defaultCropForm)
  const [cropLoading, setCropLoading] = useState(false)
  const [cropResult, setCropResult] = useState(null)
  const [diseaseImage, setDiseaseImage] = useState('')
  const [diseaseLoading, setDiseaseLoading] = useState(false)
  const [diseaseResult, setDiseaseResult] = useState(null)

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/health`)
        const data = await response.json()
        setHealth(data)
      } catch {
        setHealth({ ok: false, mode: 'offline' })
      }
    }

    fetchHealth()
  }, [])

  useEffect(() => {
    if (user) {
      localStorage.setItem('agrivision-user', JSON.stringify(user))
    } else {
      localStorage.removeItem('agrivision-user')
    }
  }, [user])

  useEffect(() => {
    if (token) {
      localStorage.setItem('agrivision-token', token)
    } else {
      localStorage.removeItem('agrivision-token')
    }
  }, [token])

  const authenticated = Boolean(token && user)

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setStatus('')

    try {
      const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup'
      const payload =
        authMode === 'login'
          ? { email: authForm.email, password: authForm.password }
          : {
              name: authForm.name,
              email: authForm.email,
              password: authForm.password,
            }

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed')
      }

      setUser(data.user)
      setToken(data.token)
      setStatus(
        authMode === 'login'
          ? `Welcome back, ${data.user.name}!`
          : `Account created for ${data.user.name}.`,
      )
    } catch (error) {
      setStatus(error.message)
    }
  }

  async function handleChatSubmit(event) {
    event.preventDefault()
    if (!chatInput.trim()) return

    const nextUserMessage = { role: 'user', content: chatInput.trim() }
    const messagesForRequest = [...chatMessages, nextUserMessage]
    setChatMessages(messagesForRequest)
    setChatInput('')
    setChatLoading(true)
    setStatus('')

    try {
      const response = await fetch(`${API_BASE}/api/agri-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: messagesForRequest }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Chat request failed')
      }

      setChatMessages((current) => [...current, { role: 'assistant', content: data.answer }])
    } catch (error) {
      setStatus(error.message)
      setChatMessages((current) => current.slice(0, -1))
    } finally {
      setChatLoading(false)
    }
  }

  async function handleCropSubmit(event) {
    event.preventDefault()
    setCropLoading(true)
    setStatus('')

    try {
      const response = await fetch(`${API_BASE}/api/crop-advisory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(cropForm),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Crop advisory failed')
      }

      setCropResult(data)
    } catch (error) {
      setStatus(error.message)
    } finally {
      setCropLoading(false)
    }
  }

  async function handleDiseaseSubmit(event) {
    event.preventDefault()
    if (!diseaseImage) {
      setStatus('Please upload an image first.')
      return
    }

    setDiseaseLoading(true)
    setStatus('')

    try {
      const response = await fetch(`${API_BASE}/api/disease-detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ imageBase64: diseaseImage }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Disease detection failed')
      }

      setDiseaseResult(data)
    } catch (error) {
      setStatus(error.message)
    } finally {
      setDiseaseLoading(false)
    }
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => setDiseaseImage(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  function handleLogout() {
    setUser(null)
    setToken('')
    setStatus('Logged out successfully.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <p className="eyebrow">Smart farming assistant</p>
            <h1>AgriVision</h1>
          </div>
        </div>

        <div className="status-pill">
          <span className={`dot ${health?.ok === false ? 'offline' : 'online'}`} />
          {health?.ok === false ? 'API offline' : 'Backend online'}
        </div>
      </header>

      <main className="dashboard">
        <section className="hero-panel panel">
          <div>
            <p className="eyebrow accent">Precision Agriculture Suite</p>
            <h2>Make smarter crop decisions with AI-powered field insights.</h2>
            <p className="subtitle">
              Monitor soil, diagnose crop stress, and plan actions using real-time agronomic guidance.
            </p>
          </div>

          <div className="hero-stats">
            <article>
              <strong>24/7</strong>
              <span>Advisory access</span>
            </article>
            <article>
              <strong>4.8/5</strong>
              <span>Farmer confidence</span>
            </article>
            <article>
              <strong>9 crops</strong>
              <span>Seasonal planning</span>
            </article>
          </div>
        </section>

        <div className="content-grid">
          <section className="panel auth-panel">
            {!authenticated ? (
              <>
                <div className="panel-header">
                  <h3>Farmer access</h3>
                  <div className="segmented-control">
                    <button
                      type="button"
                      className={authMode === 'login' ? 'active' : ''}
                      onClick={() => setAuthMode('login')}
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      className={authMode === 'signup' ? 'active' : ''}
                      onClick={() => setAuthMode('signup')}
                    >
                      Sign up
                    </button>
                  </div>
                </div>

                <form onSubmit={handleAuthSubmit} className="stacked-form">
                  {authMode === 'signup' && (
                    <label>
                      Name
                      <input
                        value={authForm.name}
                        onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                        placeholder="Your full name"
                      />
                    </label>
                  )}

                  <label>
                    Email
                    <input
                      type="email"
                      value={authForm.email}
                      onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                      placeholder="you@example.com"
                    />
                  </label>

                  <label>
                    Password
                    <input
                      type="password"
                      value={authForm.password}
                      onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                      placeholder="Minimum 6 characters"
                    />
                  </label>

                  <button type="submit" className="primary-button">
                    {authMode === 'login' ? 'Enter dashboard' : 'Create account'}
                  </button>
                </form>
              </>
            ) : (
              <div className="user-card">
                <div className="user-badge">{user?.name?.charAt(0).toUpperCase() || 'F'}</div>
                <div>
                  <p className="eyebrow">Farmer profile</p>
                  <h3>{user?.name}</h3>
                  <p>{user?.email}</p>
                </div>
                <button type="button" className="secondary-button" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            )}
          </section>

          <section className="panel chat-panel">
            <div className="panel-header">
              <h3>Agri AI chat</h3>
              <span className="badge">Live</span>
            </div>

            <div className="chat-box">
              {chatMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                  <span>{message.role === 'assistant' ? 'AI' : 'You'}</span>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleChatSubmit} className="inline-form">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={authenticated ? 'Ask about irrigation, pests, or soil health...' : 'Login to ask the assistant'}
                disabled={!authenticated || chatLoading}
              />
              <button type="submit" className="primary-button" disabled={!authenticated || chatLoading}>
                {chatLoading ? 'Sending...' : 'Send'}
              </button>
            </form>
          </section>

          <section className="panel advisory-panel">
            <div className="panel-header">
              <h3>Crop advisory</h3>
              <span className="badge success">AI analysis</span>
            </div>

            <form onSubmit={handleCropSubmit} className="stacked-form">
              <div className="field-grid">
                <label>
                  pH Value
                  <input value={cropForm.phValue} onChange={(event) => setCropForm({ ...cropForm, phValue: event.target.value })} />
                </label>
                <label>
                  Moisture %
                  <input value={cropForm.moisture} onChange={(event) => setCropForm({ ...cropForm, moisture: event.target.value })} />
                </label>
                <label>
                  Nitrogen
                  <input value={cropForm.nitrogen} onChange={(event) => setCropForm({ ...cropForm, nitrogen: event.target.value })} />
                </label>
                <label>
                  Phosphate
                  <input value={cropForm.phosphate} onChange={(event) => setCropForm({ ...cropForm, phosphate: event.target.value })} />
                </label>
              </div>

              <label>
                Weather
                <input value={cropForm.weather} onChange={(event) => setCropForm({ ...cropForm, weather: event.target.value })} />
              </label>
              <label>
                Soil Type
                <input value={cropForm.soilType} onChange={(event) => setCropForm({ ...cropForm, soilType: event.target.value })} />
              </label>
              <label>
                Location
                <input value={cropForm.location} onChange={(event) => setCropForm({ ...cropForm, location: event.target.value })} />
              </label>
              <label>
                Land Type
                <input value={cropForm.landType} onChange={(event) => setCropForm({ ...cropForm, landType: event.target.value })} />
              </label>
              <label>
                Month
                <input value={cropForm.month} onChange={(event) => setCropForm({ ...cropForm, month: event.target.value })} />
              </label>
              <label>
                Additional notes
                <textarea value={cropForm.feedback} onChange={(event) => setCropForm({ ...cropForm, feedback: event.target.value })} rows="3" />
              </label>

              <button type="submit" className="primary-button" disabled={!authenticated || cropLoading}>
                {cropLoading ? 'Analyzing...' : 'Generate recommendation'}
              </button>
            </form>

            {cropResult && (
              <div className="result-box">
                <h4>Recommendation</h4>
                <p>{cropResult?.crops?.[0]?.name || 'Crop plan ready'}</p>
                <ul>
                  {cropResult?.crops?.slice(0, 3).map((crop) => (
                    <li key={crop.name}>
                      {crop.name}: {crop.suitability}% suitability
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="panel disease-panel">
            <div className="panel-header">
              <h3>Disease detection</h3>
              <span className="badge warning">Image scan</span>
            </div>

            <form onSubmit={handleDiseaseSubmit} className="stacked-form">
              <label className="upload-box">
                <span>{diseaseImage ? 'Image selected' : 'Upload crop image'}</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} />
              </label>

              <button type="submit" className="primary-button" disabled={!authenticated || diseaseLoading || !diseaseImage}>
                {diseaseLoading ? 'Checking image...' : 'Detect disease'}
              </button>
            </form>

            {diseaseResult && (
              <div className="result-box">
                <h4>{diseaseResult.diseaseName || 'Plant review'}</h4>
                <p>{diseaseResult.description}</p>
                <ul>
                  <li>Severity: {diseaseResult.severity}</li>
                  <li>Confidence: {diseaseResult.confidence}%</li>
                  <li>Part affected: {diseaseResult.affectedPart}</li>
                </ul>
              </div>
            )}
          </section>
        </div>

        {status && <div className="status-banner">{status}</div>}
      </main>
    </div>
  )
}

export default App
