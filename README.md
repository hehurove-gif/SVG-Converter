@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color: #e2e8f0;
  background-color: #020817;
  font-family: Inter, 'Segoe UI', sans-serif;
  line-height: 1.5;
  font-weight: 400;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(34, 211, 238, 0.12), transparent 30%),
    radial-gradient(circle at right, rgba(59, 130, 246, 0.18), transparent 25%),
    linear-gradient(135deg, #020817 0%, #0f172a 40%, #111827 100%);
}

* {
  box-sizing: border-box;
}

input[type='file'] {
  display: none;
}

input[type='color'] {
  -webkit-appearance: none;
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
}

input[type='color']::-webkit-color-swatch-wrapper {
  padding: 0;
}

input[type='color']::-webkit-color-swatch {
  border: none;
  border-radius: 0.75rem;
}

input[type='range'] {
  accent-color: #22d3ee;
}

.glass-panel {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1.75rem;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(14px);
  box-shadow: 0 25px 60px rgba(2, 6, 23, 0.45);
}

.upload-box {
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.7)),
    radial-gradient(circle at top, rgba(34, 211, 238, 0.08), transparent 30%);
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.9rem;
  border: 1px solid transparent;
  padding: 0.8rem 1.1rem;
  font-weight: 700;
  font-size: 0.92rem;
  transition: transform 0.2s ease, opacity 0.2s ease, filter 0.2s ease;
}

.action-button:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.action-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.action-button.primary {
  background: linear-gradient(135deg, #0ea5e9, #2563eb);
  color: white;
  box-shadow: 0 15px 30px rgba(37, 99, 235, 0.28);
}

.action-button.success {
  background: linear-gradient(135deg, #10b981, #34d399);
  color: white;
  box-shadow: 0 15px 30px rgba(16, 185, 129, 0.25);
}

.action-button.secondary {
  border-color: rgba(148, 163, 184, 0.35);
  background: rgba(15, 23, 42, 0.7);
  color: #e2e8f0;
}

.svg-preview {
  overflow: auto;
  max-height: 680px;
}

.svg-preview svg {
  display: block;
  width: 100%;
  height: auto;
  max-height: 620px;
  border-radius: 1rem;
  background: #fff;
}

@media (max-width: 640px) {
  .action-button {
    width: 100%;
  }
}

