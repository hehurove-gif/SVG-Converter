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

## Deploy en Cloudflare Pages

1. Conecta tu repositorio en Cloudflare Pages.
2. Usa estas opciones:
   - Framework preset: Vite
   - Build command: `npm run build`
   - Build output directory: `dist`
3. La app ya incluye el archivo `public/_redirects` para manejar rutas de SPA.

## Características

- Subida de imágenes PNG, JPG, WEBP, GIF, BMP, ICO.
- Detección automática de colores dominantes.
- Paletas predefinidas y edición manual de cada color.
- Ajustes de fondo, transparencia y tamaño de celda.
- Vista previa original vs. SVG.
- Descarga de archivos SVG y PNG.

## Notas

La vectorización es una aproximación por bloques de color pensada para uso rápido y para prototipos visuales. Si quieres un trazado más avanzado, puede añadirse un motor de vectorización de mayor precisión en una siguiente iteración.
