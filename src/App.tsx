import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from '@/features/auth/AuthGate'
import { LobbyPage } from '@/features/lobby/LobbyPage'
import { RoomPage } from '@/features/lobby/RoomPage'
import { DevPreview } from '@/features/dev/DevPreview'

export default function App() {
  if (import.meta.env.DEV && window.location.pathname === '/preview') {
    return (
      <Routes>
        <Route path="/preview" element={<DevPreview />} />
      </Routes>
    )
  }
  return (
    <AuthGate>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthGate>
  )
}
