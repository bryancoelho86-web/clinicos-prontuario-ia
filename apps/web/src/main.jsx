import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { applyTheme, getStoredTheme } from '@/lib/theme'

// Aplica antes do primeiro render pra não piscar o tema errado.
applyTheme(getStoredTheme())

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
