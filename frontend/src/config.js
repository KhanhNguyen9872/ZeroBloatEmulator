/**
 * frontend/src/config.js
 *
 * Centralised frontend configuration.
 * Import from here instead of hardcoding values in components.
 */

/** Base URL for all API calls.
 *  Empty string = same origin (works with Vite dev proxy and Flask static serve). */
export const API_BASE_URL = ''

/** Default axios timeout in milliseconds. */
export const API_TIMEOUT = 10_000

/** How often BackendContext polls /api/health (ms). */
export const POLL_INTERVAL = 3_000
