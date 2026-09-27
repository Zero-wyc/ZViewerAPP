import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { HashRouter } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import './upstream/index.css'
import './styles.css'
import './mobile/mobile.css'

useAuthStore.setState({ autoLoginStatus: 'idle', authResolved: false })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter><App /></HashRouter>
  </React.StrictMode>,
)
