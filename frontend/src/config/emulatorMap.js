/**
 * frontend/src/config/emulatorMap.js
 *
 * Single source of truth for emulator UI metadata.
 * To add a new emulator: add one entry here + one strategy in backend/emulators/definitions/.
 */

export const EMULATOR_MAP = {
  LDPLAYER: {
    name: 'LDPlayer',
    logo: '/assets/ldplayer.jpg',
    docs: 'https://www.ldplayer.net',
  },
  MEMU: {
    name: 'MEmu Play',
    logo: '/assets/memu.png',
    docs: 'https://www.memuplay.com',
  },
  BLUESTACKS4: {
    name: 'BlueStacks 4',
    logo: '/assets/bluestacks4.jpg',
    color: 'text-blue-600',
    bg: 'bg-blue-600/10',
    docs: 'https://support.bluestacks.com/hc/en-us/articles/360056129211',
  },
  BLUESTACKS5: {
    name: 'BlueStacks 5',
    logo: '/assets/bluestacks5.png',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    docs: 'https://support.bluestacks.com/hc/en-us/articles/360056960211',
  },
  UNKNOWN: {
    name: 'Unknown Emulator',
    logo: null,
    docs: null,
  },
}

/**
 * Look up emulator config by type string.
 * Falls back to Unknown if the type is not registered.
 *
 * @param {string} type - e.g. "LDPLAYER", "MEMU"
 * @returns {{ name, logo: string|null, docs: string|null }}
 */
export function getEmulatorConfig(type) {
  const key = (type || 'UNKNOWN').toUpperCase()
  return EMULATOR_MAP[key] ?? EMULATOR_MAP.UNKNOWN
}
