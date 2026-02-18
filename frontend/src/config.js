/**
 * frontend/src/config.js
 *
 * Centralised frontend configuration.
 * Import from here instead of hardcoding values in components.
 */

/** Base URL for all API calls.
 *  Explicitly point to backend in dev to avoid proxy-induced 500s. */
export const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:5000' : ''

/** Default axios timeout in milliseconds. */
export const API_TIMEOUT = 10_000

/** How often BackendContext polls /api/health (ms). */
export const POLL_INTERVAL = 3_000
