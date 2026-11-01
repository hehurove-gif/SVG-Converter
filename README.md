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

- Subida de imágenes PNG, JPG, WEBP, GIF, BMP, ICO.
- Detección automática de colores dominantes.
- Paletas predefinidas y edición manual de cada color.
- Ajustes de fondo, transparencia y tamaño de celda.
- Vista previa original vs. SVG.
- Descarga de archivos SVG y PNG.

## Notas

La vectorización es una aproximación por bloques de color pensada para uso rápido y para prototipos visuales. Si quieres un trazado más avanzado, puede añadirse un motor de vectorización de mayor precisión en una siguiente iteración.
