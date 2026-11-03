// Web Worker: vectoriza fuera del hilo principal para que la página no se congele.
import { segmentPixels } from './segment.js'

self.onmessage = (event) => {
  const { id, pixels, options } = event.data
  try {
    const result = segmentPixels(pixels, { ...options, onProgress: (text) => self.postMessage({ id, type: 'progress', text }) })
    self.postMessage({ id, type: 'done', result }, result.regionMap ? [result.regionMap.buffer] : [])
  } catch (error) {
    self.postMessage({ id, type: 'error', message: String(error?.message || error) })
  }
}
