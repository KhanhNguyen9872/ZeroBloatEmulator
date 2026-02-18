/**
 * frontend/src/config/emulatorMap.js
 *
 * Single source of truth for emulator UI metadata.
 * To add a new emulator: add one entry here + one strategy in backend/emulators/definitions/.
 */

export const EMULATOR_MAP = {
  LDPlayer: {
    name: 'LDPlayer',
    emoji: '🎮',
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    docs: 'https://www.ldplayer.net',
  },
  MEmu: {
    name: 'MEmu Play',
    emoji: '📱',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    docs: 'https://www.memuplay.com',
  },
  BlueStacks: {
    name: 'BlueStacks',
    emoji: '🔵',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    docs: 'https://www.bluestacks.com',
  },
  Unknown: {
    name: 'Unknown Emulator',
    emoji: '❓',
    color: 'text-zinc-500',
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-500/20',
    docs: null,
  },
}

/**
 * Look up emulator config by type string.
 * Falls back to Unknown if the type is not registered.
 *
 * @param {string} type - e.g. "LDPlayer", "MEmu", "BlueStacks"
 * @returns {{ name, emoji, color, bg, border, docs }}
 */
export function getEmulatorConfig(type) {
  return EMULATOR_MAP[type] ?? EMULATOR_MAP.Unknown
}
