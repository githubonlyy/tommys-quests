import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { CloudProvider } from './context/CloudContext.jsx'
import { PlayerProvider } from './context/PlayerContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CloudProvider>
      <PlayerProvider>
        <App />
      </PlayerProvider>
    </CloudProvider>
  </StrictMode>,
)
