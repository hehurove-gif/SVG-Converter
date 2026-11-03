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

export function mixHex(a, b, t) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t)
}

export function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex)
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0

  if (d) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }

  return { h, s, l }
}

export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  const sector = Math.floor((((h % 360) + 360) % 360) / 60)
  if (sector === 0) [r, g, b] = [c, x, 0]
  else if (sector === 1) [r, g, b] = [x, c, 0]
  else if (sector === 2) [r, g, b] = [0, c, x]
  else if (sector === 3) [r, g, b] = [0, x, c]
  else if (sector === 4) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

// Ajuste global: tono (grados), saturación y brillo (-100..100).
export function adjustHex(hex, { h = 0, s = 0, l = 0 }) {
  if (!h && !s && !l) return hex
  const c = hexToHsl(hex)
  return hslToHex(c.h + h, clamp(c.s * (1 + s / 100), 0, 1), clamp(c.l + l / 200, 0, 1))
}
