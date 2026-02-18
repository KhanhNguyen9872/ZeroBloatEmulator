import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { HealthAPI, SystemAPI, SecurityAPI } from '../services/api'
import { POLL_INTERVAL } from '../config'

// ── Context ───────────────────────────────────────────────────────────────────
const BackendContext = createContext({
  isConnected: false,
  isReconnecting: false,
  isAdmin: false,
  reconnect: () => {},
})

export function useBackend() {
  return useContext(BackendContext)
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function BackendProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const intervalRef = useRef(null)

  const checkHealth = useCallback(async (manual = false) => {
    if (manual) setIsReconnecting(true)
    try {
      await HealthAPI.ping()
      setIsConnected(true)
      // Refresh admin status on each successful connection
      try {
        const { data } = await SystemAPI.getAdminStatus()
        setIsAdmin(data.is_admin ?? false)
      } catch { /* non-critical */ }
    } catch {
      setIsConnected(false)
    } finally {
      if (manual) setIsReconnecting(false)
    }
  }, [])

  const reconnect = useCallback(() => {
    checkHealth(true)
  }, [checkHealth])

  // Start polling on mount
  useEffect(() => {
    // 1. Initial Health Check
    checkHealth()
    intervalRef.current = setInterval(() => checkHealth(), POLL_INTERVAL)
    return () => clearInterval(intervalRef.current)
  }, [checkHealth])

  // Refresh CSRF token whenever we connect/reconnect
  useEffect(() => {
    if (isConnected) {
      SecurityAPI.getCsrfToken()
        .then(({ data }) => {
          localStorage.setItem('csrf_token', data.csrf_token)
        })
        .catch((err) => console.error("Failed to refresh CSRF token", err))
    }
  }, [isConnected])

  return (
    <BackendContext.Provider value={{ isConnected, isReconnecting, isAdmin, reconnect }}>
      {children}
    </BackendContext.Provider>
  )
}

