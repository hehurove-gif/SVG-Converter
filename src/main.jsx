@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color: #e2e8f0;
  background: #020817;
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
    radial-gradient(circle at top, rgba(34, 211, 238, 0.12), transparent 25%),
    radial-gradient(circle at bottom right, rgba(168, 85, 247, 0.09), transparent 20%),
    linear-gradient(135deg, #020817 0%, #0f172a 40%, #111827 100%);
}

* {
  box-sizing: border-box;
}

button,
input {
  font: inherit;
}

input[type='file'] {
  display: none;
}

input[type='color'] {
  -webkit-appearance: none;
  appearance: none;
  border: none;
  background: transparent;
  width: 2.9rem;
  height: 2.6rem;
  border-radius: 0.8rem;
  cursor: pointer;
}

input[type='color']::-webkit-color-swatch-wrapper {
  padding: 0;
}

input[type='color']::-webkit-color-swatch {
  border: none;
  border-radius: 0.8rem;
}

input[type='range'] {
  accent-color: #22d3ee;
}

.app-shell {
  position: relative;
  overflow: hidden;
}

.top-glow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 20% 10%, rgba(34, 211, 238, 0.14), transparent 22%),
    radial-gradient(circle at 80% 20%, rgba(168, 85, 247, 0.12), transparent 22%);
  pointer-events: none;
}

.brand-row {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.5rem 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(10px);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 0.6rem;
  background: linear-gradient(135deg, #22d3ee, #8b5cf6);
  color: #020817;
  font-weight: 900;
}

.hero-grid {
  display: grid;
  grid-template-columns: 1.4fr 0.6fr;
  gap: 1.25rem;
  margin-top: 1.4rem;
}

.eyebrow,
.panel-kicker {
  margin: 0 0 0.35rem 0;
  color: #67e8f9;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  max-width: 620px;
  font-size: clamp(2.5rem, 5vw, 4.4rem);
  line-height: 0.96;
  letter-spacing: -0.06em;
  color: #f8fafc;
}

.subhead {
  margin: 1rem 0 0;
  max-width: 720px;
  color: #cbd5e1;
  font-size: 1.02rem;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  margin-top: 1.4rem;
}

.primary-button,
.secondary-button,
.action-button,
.toggle-button {
  border: none;
  border-radius: 0.95rem;
  font-weight: 700;
  transition: transform 0.2s ease, filter 0.2s ease, opacity 0.2s ease;
}

.primary-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.9rem;
  padding: 0.8rem 1.15rem;
}

.primary-button {
  background: linear-gradient(135deg, #22d3ee, #3b82f6);
  color: #03121b;
  box-shadow: 0 15px 30px rgba(59, 130, 246, 0.25);
}

.secondary-button {
  background: rgba(15, 23, 42, 0.75);
  color: #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.primary-button:hover,
.secondary-button:hover,
.action-button:hover,
.toggle-button:hover {
  transform: translateY(-1px);
  filter: brightness(1.04);
}

.stats-panel {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 1.4rem;
  background: rgba(10, 15, 28, 0.72);
  backdrop-filter: blur(12px);
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.stat-label {
  color: #94a3b8;
  font-size: 0.72rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.stat-item strong {
  color: #f8fafc;
  font-size: 0.98rem;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 1.4rem;
}

.preset-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.7);
  padding: 0.6rem 0.9rem;
  color: #dbeafe;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  transition: all 0.2s ease;
}

.preset-pill.active {
  border-color: rgba(34, 211, 238, 0.65);
  background: rgba(14, 165, 233, 0.1);
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.08);
}

.preset-swatch-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.preset-swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.28);
}

.workspace-grid {
  display: grid;
  grid-template-columns: 1.28fr 0.72fr;
  gap: 1.25rem;
  margin-top: 1.5rem;
}

.glass-panel {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1.6rem;
  background: rgba(15, 23, 42, 0.72);
  box-shadow: 0 25px 60px rgba(2, 6, 23, 0.38);
  backdrop-filter: blur(12px);
}

.panel-main,
.panel-side,
.preview-section {
  padding: 1.15rem;
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

h2 {
  margin: 0;
  color: #f8fafc;
  font-size: clamp(1.1rem, 2vw, 1.5rem);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.42rem 0.72rem;
  border-radius: 9999px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.9);
  color: #cbd5e1;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.status-badge.accent {
  border-color: rgba(34, 211, 238, 0.35);
  background: rgba(34, 211, 238, 0.08);
  color: #a5f3fc;
}

.upload-box {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 330px;
  border: 1px dashed rgba(148, 163, 184, 0.36);
  border-radius: 1.4rem;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.7)),
    radial-gradient(circle at top, rgba(34, 211, 238, 0.08), transparent 26%);
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.upload-box:hover {
  border-color: rgba(34, 211, 238, 0.65);
  transform: translateY(-1px);
}

.upload-preview-wrap {
  width: 100%;
  padding: 1rem;
}

.upload-preview,
.preview-image {
  width: 100%;
  max-height: 420px;
  object-fit: contain;
  border-radius: 1rem;
  background: #fff;
}

.upload-preview-wrap p,
.upload-empty-state p {
  margin: 0.8rem 0 0;
  color: #e2e8f0;
  font-weight: 600;
}

.upload-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1rem;
}

.upload-icon {
  display: grid;
  place-items: center;
  width: 4rem;
  height: 4rem;
  border-radius: 1rem;
  background: rgba(34, 211, 238, 0.08);
  color: #67e8f9;
  font-size: 2rem;
}

.upload-empty-state span {
  margin-top: 0.35rem;
  color: #94a3b8;
  font-size: 0.84rem;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.1rem;
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.8rem;
  padding: 0.78rem 1.05rem;
  font-size: 0.88rem;
  color: white;
}

.action-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.action-button.primary {
  background: linear-gradient(135deg, #22d3ee, #3b82f6);
  color: #03121b;
  box-shadow: 0 14px 26px rgba(37, 99, 235, 0.22);
}

.action-button.success {
  background: linear-gradient(135deg, #10b981, #34d399);
  color: #062218;
  box-shadow: 0 14px 26px rgba(16, 185, 129, 0.2);
}

.action-button.secondary {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: #f8fafc;
}

.action-button.neutral {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(14, 165, 233, 0.2));
  border: 1px solid rgba(168, 85, 247, 0.28);
  color: #e9d5ff;
}

.controls-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
  margin-top: 1.1rem;
}

.control-card {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.9rem 0.9rem 0.8rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(15, 23, 42, 0.7);
  color: #e2e8f0;
}

.control-label {
  display: block;
  color: #94a3b8;
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.control-card strong {
  color: #67e8f9;
  font-size: 0.92rem;
}

.control-color-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: #dbeafe;
  font-size: 0.8rem;
}

.toggle-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  min-height: 2.5rem;
  padding: 0.7rem 0.8rem;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.18);
  color: #f8fafc;
}

.toggle-button.on {
  color: #a7f3d0;
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(16, 185, 129, 0.08);
}

.toggle-indicator {
  font-size: 1.1rem;
}

.error-box {
  margin-top: 1rem;
  padding: 0.8rem 0.9rem;
  border-radius: 1rem;
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.08);
  color: #fecaca;
  font-size: 0.88rem;
}

.palette-list {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.color-card {
  padding: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 1.1rem;
  background: rgba(15, 23, 42, 0.72);
}

.color-header {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.color-sample {
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.color-header p {
  margin: 0;
  color: #f8fafc;
  font-weight: 700;
}

.color-header small {
  color: #94a3b8;
}

.rgb-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
  margin-top: 0.85rem;
}

.rgb-slider {
  padding: 0.55rem 0.5rem;
  border-radius: 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.58);
}

.rgb-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.42rem;
  color: #cbd5e1;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hex-input {
  width: 100%;
  margin-top: 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.8rem;
  background: rgba(15, 23, 42, 0.8);
  color: #f8fafc;
  padding: 0.7rem 0.8rem;
  outline: none;
}

.hex-input:focus {
  border-color: rgba(34, 211, 238, 0.5);
}

.empty-state-card {
  padding: 1.1rem;
  border-radius: 1rem;
  border: 1px dashed rgba(148, 163, 184, 0.32);
  color: #cbd5e1;
  text-align: center;
  background: rgba(15, 23, 42, 0.52);
}

.preview-section {
  margin-top: 1.25rem;
}

.preview-header {
  margin-bottom: 0.9rem;
}

.preview-tags {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.preview-tags span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.38rem 0.68rem;
  border-radius: 9999px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.7);
  color: #cbd5e1;
  font-size: 0.64rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.preview-tags .tag-highlight {
  border-color: rgba(34, 211, 238, 0.35);
  background: rgba(34, 211, 238, 0.08);
  color: #a5f3fc;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.preview-card {
  padding: 0.9rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1.2rem;
  background: rgba(15, 23, 42, 0.8);
}

.preview-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.8rem;
  color: #94a3b8;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.preview-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  text-align: center;
  border: 1px dashed rgba(148, 163, 184, 0.28);
  border-radius: 1rem;
  color: #94a3b8;
  background: rgba(15, 23, 42, 0.45);
}

.svg-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  border-radius: 1rem;
  background: #fff;
  overflow: auto;
}

.svg-container svg {
  display: block;
  width: 100%;
  height: auto;
  max-height: 420px;
  background: #fff;
}

@media (max-width: 980px) {
  .hero-grid,
  .workspace-grid,
  .preview-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .controls-grid {
    grid-template-columns: 1fr;
  }

  .hero-actions,
  .action-row {
    flex-direction: column;
  }

  .primary-button,
  .secondary-button,
  .action-button {
    width: 100%;
  }
}

