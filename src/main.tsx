import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { startOutbox } from './lib/outbox'
import { applyTheme } from './lib/theme'
import './index.css'

const WEEK = 7 * 24 * 60 * 60 * 1000
// gcTime must outlive the persisted maxAge, or restored data is dropped straight away
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, gcTime: WEEK } } })
const persister = createSyncStoragePersister({ storage: window.localStorage, key: 'mealplanner-cache' })
startOutbox(qc)
applyTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={qc} persistOptions={{ persister, maxAge: WEEK, buster: 'v1' }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
)
