export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// Acepta "#RGB", "#RRGGBB" (con o sin "#"). Devuelve `fallback` si no es válido.
export function normalizeHex(hex, fallback = '#000000') {
  const clean = String(hex ?? '')
    .trim()
    .replace(/^#/, '')
    .replace(/[^0-9a-fA-F]/g, '')

  if (clean.length === 3) {
    return `#${clean.split('').map((char) => char + char).join('')}`.toUpperCase()
  }

  if (clean.length === 6) {
    return `#${clean}`.toUpperCase()
  }

  return fallback
}

export function isValidHex(value) {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value ?? '').trim())
}

export function hexToRgb(hex) {
  const value = normalizeHex(hex).replace('#', '')
  const number = Number.parseInt(value, 16)
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 }
}

export function rgbToHex(r, g, b) {
  const toHex = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

export function colorDistance(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

export function nearestIndex(rgb, candidates) {
  let best = 0
  let min = Number.POSITIVE_INFINITY

  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i]
    const distance = (rgb.r - c.r) ** 2 + (rgb.g - c.g) ** 2 + (rgb.b - c.b) ** 2
    if (distance < min) {
      min = distance
      best = i
    }
  }

  return best
}

export function readableText(hex) {
  const { r, g, b } = hexToRgb(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#0F172A' : '#FFFFFF'
}
