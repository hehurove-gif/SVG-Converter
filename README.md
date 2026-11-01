# SVG Converter Pro

Aplicación web para convertir imágenes a SVG con detección automática de colores, edición visual de paleta, exportación SVG/PNG y preparación para despliegue en Cloudflare Pages.

## Stack

- React
- Vite
- Tailwind CSS

## Scripts

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Deploy en Cloudflare

El proyecto se despliega como Worker con assets estáticos (config en `wrangler.jsonc`).

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Preview command: `npx wrangler preview`

El fallback de SPA se maneja con `not_found_handling: "single-page-application"` en `wrangler.jsonc`. El nombre del Worker (`svg-converter`) debe coincidir con el del proyecto en el dashboard de Cloudflare.

## Características

- Sube PNG, JPG, WEBP, GIF, BMP o ICO (también arrastrando la imagen).
- Divide la imagen por sus líneas y colores en zonas vectoriales reales (contornos trazados, no cuadrícula).
- Clic en cualquier zona: un globo con flecha muestra su código de color y permite editarlo.
- Dos alcances al cambiar un color: todas las zonas del mismo color, o solo la zona pulsada.
- Eliminar fondo automáticamente, o eliminar cualquier zona/color con un clic. Deshacer y restaurar.
- Ajustes de colores, detalle y suavizado; paletas rápidas.
- Descarga SVG y PNG con transparencia.

## Notas

Los colores se agrupan con una paleta dominante y la imagen se divide en zonas conectadas de cada color. Las imágenes con degradados o fotografías generan muchas zonas; funciona mejor con logos, íconos e ilustraciones.
