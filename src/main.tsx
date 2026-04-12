import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { GlobalStyles } from './styles/GlobalStyles'
import './utils/capturePreview'
import { useEditorStore } from './store/editorStore'
import { useAppStore } from './store/appStore'

// Expose Zustand stores on window for e2e test assertions
;(window as any).__editorStore = useEditorStore
;(window as any).__appStore = useAppStore

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GlobalStyles />
    <App />
  </React.StrictMode>
)
