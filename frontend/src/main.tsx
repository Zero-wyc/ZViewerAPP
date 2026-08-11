import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/ThemeProvider'
import { initClientLogger } from '@/lib/clientLogger'
import App from './App'
import './index.css'

// 初始化浏览器控制台日志上报：拦截 console 与未捕获异常，批量发送到后端写入 log/frontend-console.log
initClientLogger({ minLevel: 'debug' })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
