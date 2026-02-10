/**
 * BirdCam Dashboard v2 - Redesigned UI
 * 
 * Complete redesign based on UX expert recommendations:
 * - Bird Activity as hero section
 * - PTZ controls overlay on video
 * - Tabbed sidebar for stats/alerts
 * - Mobile-first responsive design
 * - Modern, polished aesthetic
 */

import { config } from './config.js';

export function getDashboardV2Html(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#0a0a0f">
  <title>${config.camera.name} - BirdCam</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <style>
    /* =====================================================
       DESIGN SYSTEM - Premium Dark Theme
       Inspired by Linear, Vercel, Raycast
       ===================================================== */
    :root {
      /* Colors - Deep space palette */
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-tertiary: #1a1a24;
      --bg-elevated: #22222e;
      --bg-hover: #2a2a38;
      
      /* Borders - Subtle, refined */
      --border-subtle: rgba(255, 255, 255, 0.06);
      --border-default: rgba(255, 255, 255, 0.1);
      --border-strong: rgba(255, 255, 255, 0.15);
      
      /* Text - High contrast, legible */
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-tertiary: #71717a;
      --text-inverted: #0a0a0f;
      
      /* Accent - Vibrant nature green */
      --accent: #22c55e;
      --accent-hover: #16a34a;
      --accent-muted: rgba(34, 197, 94, 0.15);
      --accent-glow: rgba(34, 197, 94, 0.4);
      
      /* Semantic colors */
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --info: #3b82f6;
      
      /* Status colors */
      --live: #22c55e;
      --recording: #ef4444;
      --webrtc: #8b5cf6;
      --hls: #f59e0b;
      
      /* Typography */
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
      
      /* Spacing scale */
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
      --space-8: 32px;
      --space-10: 40px;
      --space-12: 48px;
      
      /* Border radius */
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
      --radius-xl: 20px;
      --radius-full: 9999px;
      
      /* Shadows - Layered depth */
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
      --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
      --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
      --shadow-glow: 0 0 20px var(--accent-glow);
      
      /* Transitions */
      --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
      --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
      --transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
      
      /* Layout */
      --header-height: 64px;
      --sidebar-width: 340px;
      --mobile-bar-height: 72px;
    }

    /* =====================================================
       RESET & BASE
       ===================================================== */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    html {
      font-size: 16px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    body {
      font-family: var(--font-sans);
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      min-height: 100vh;
      overflow-x: hidden;
    }
    
    /* Custom scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: var(--border-default);
      border-radius: var(--radius-full);
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--border-strong);
    }

    /* =====================================================
       HEADER - Minimal, Focused
       ===================================================== */
    .app-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: var(--header-height);
      background: rgba(10, 10, 15, 0.8);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--border-subtle);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 var(--space-6);
    }
    
    .header-brand {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    
    .header-logo {
      font-size: 1.75rem;
    }
    
    .header-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .header-status {
      display: flex;
      gap: var(--space-2);
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-3);
      border-radius: var(--radius-full);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .status-live {
      background: var(--accent-muted);
      color: var(--accent);
    }
    
    .status-live::before {
      content: '';
      width: 6px;
      height: 6px;
      background: var(--live);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .status-mode {
      background: var(--bg-elevated);
      color: var(--text-secondary);
    }
    
    .header-actions {
      display: flex;
      gap: var(--space-2);
    }
    
    .btn-icon {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);
      font-size: 1.25rem;
    }
    
    .btn-icon:hover {
      background: var(--bg-hover);
      border-color: var(--border-default);
      color: var(--text-primary);
    }

    /* =====================================================
       MAIN LAYOUT
       ===================================================== */
    .app-main {
      padding-top: var(--header-height);
      min-height: 100vh;
      display: grid;
      grid-template-columns: 1fr var(--sidebar-width);
      gap: var(--space-6);
      padding: calc(var(--header-height) + var(--space-6)) var(--space-6) var(--space-6);
    }
    
    @media (max-width: 1024px) {
      .app-main {
        grid-template-columns: 1fr;
        padding-bottom: calc(var(--mobile-bar-height) + var(--space-6));
      }
    }

    /* =====================================================
       BIRD ACTIVITY HERO
       ===================================================== */
    .bird-hero {
      grid-column: 1 / -1;
      background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: var(--space-5);
      margin-bottom: var(--space-4);
    }
    
    .bird-hero-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-4);
    }
    
    .bird-hero-title {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-size: 1.125rem;
      font-weight: 600;
    }
    
    .bird-hero-title span {
      font-size: 1.5rem;
    }
    
    .bird-hero-stats {
      display: flex;
      gap: var(--space-6);
    }
    
    .bird-stat {
      text-align: center;
    }
    
    .bird-stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--accent);
    }
    
    .bird-stat-label {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .bird-timeline {
      display: flex;
      gap: var(--space-3);
      overflow-x: auto;
      padding: var(--space-2) 0;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
    }
    
    .bird-card {
      flex: 0 0 auto;
      width: 140px;
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: var(--space-3);
      scroll-snap-align: start;
      transition: all var(--transition-fast);
      cursor: pointer;
    }
    
    .bird-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    
    .bird-card-thumb {
      width: 100%;
      aspect-ratio: 4/3;
      background: var(--bg-elevated);
      border-radius: var(--radius-sm);
      margin-bottom: var(--space-2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
    }
    
    .bird-card-name {
      font-weight: 600;
      font-size: 0.875rem;
      margin-bottom: var(--space-1);
    }
    
    .bird-card-time {
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }
    
    .bird-card-confidence {
      display: inline-block;
      padding: 2px 6px;
      background: var(--accent-muted);
      color: var(--accent);
      border-radius: var(--radius-sm);
      font-size: 0.7rem;
      font-weight: 600;
      margin-top: var(--space-2);
    }
    
    .bird-card--more {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      font-weight: 500;
    }
    
    .bird-card--more:hover {
      color: var(--accent);
    }

    /* =====================================================
       VIDEO SECTION
       ===================================================== */
    .video-section {
      position: relative;
    }
    
    .video-wrapper {
      position: relative;
      background: #000;
      border-radius: var(--radius-xl);
      overflow: hidden;
      aspect-ratio: 16/9;
      box-shadow: var(--shadow-lg);
    }
    
    .video-player {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    /* PTZ Overlay - Appears on hover/touch */
    .ptz-overlay {
      position: absolute;
      bottom: var(--space-4);
      right: var(--space-4);
      display: flex;
      gap: var(--space-3);
      opacity: 0;
      transform: translateY(10px);
      transition: all var(--transition-base);
      pointer-events: none;
    }
    
    .video-wrapper:hover .ptz-overlay,
    .video-wrapper:focus-within .ptz-overlay {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    
    .ptz-dpad {
      display: grid;
      grid-template-columns: repeat(3, 44px);
      grid-template-rows: repeat(3, 44px);
      gap: 4px;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(10px);
      padding: var(--space-2);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-subtle);
    }
    
    .ptz-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      cursor: pointer;
      font-size: 1.25rem;
      transition: all var(--transition-fast);
      touch-action: none;
    }
    
    .ptz-btn:hover {
      background: var(--bg-hover);
      border-color: var(--border-default);
    }
    
    .ptz-btn:active {
      background: var(--accent);
      color: var(--text-inverted);
      transform: scale(0.95);
    }
    
    .ptz-btn.home {
      background: var(--accent-muted);
      border-color: var(--accent);
    }
    
    .ptz-zoom {
      display: flex;
      flex-direction: column;
      gap: 4px;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(10px);
      padding: var(--space-2);
      border-radius: var(--radius-lg);
      border: 1px solid var(--border-subtle);
    }
    
    .ptz-zoom .ptz-btn {
      width: 44px;
      height: 44px;
    }
    
    /* Video Toolbar */
    .video-toolbar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: var(--space-4);
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .video-info {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
    
    .video-actions {
      display: flex;
      gap: var(--space-2);
    }
    
    .toolbar-btn {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: var(--radius-md);
      color: var(--text-primary);
      cursor: pointer;
      font-size: 1.125rem;
      transition: all var(--transition-fast);
    }
    
    .toolbar-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    .toolbar-btn.recording {
      background: var(--danger);
      animation: pulse 1s infinite;
    }
    
    /* Presets Bar */
    .presets-bar {
      display: flex;
      gap: var(--space-2);
      margin-top: var(--space-4);
      padding: var(--space-3);
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      overflow-x: auto;
    }
    
    .preset-btn {
      flex: 0 0 auto;
      padding: var(--space-2) var(--space-4);
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--transition-fast);
      white-space: nowrap;
    }
    
    .preset-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .preset-btn.active {
      background: var(--accent-muted);
      border-color: var(--accent);
      color: var(--accent);
    }
    
    .preset-btn.add {
      background: transparent;
      border-style: dashed;
    }

    /* =====================================================
       SIDEBAR - Tabbed Interface
       ===================================================== */
    .sidebar {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
    
    @media (max-width: 1024px) {
      .sidebar {
        display: none;
      }
    }
    
    .sidebar-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      overflow: hidden;
    }
    
    /* Tabs */
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border-subtle);
    }
    
    .tab {
      flex: 1;
      padding: var(--space-4);
      background: transparent;
      border: none;
      color: var(--text-tertiary);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      transition: all var(--transition-fast);
      position: relative;
    }
    
    .tab:hover {
      color: var(--text-secondary);
      background: var(--bg-tertiary);
    }
    
    .tab.active {
      color: var(--accent);
    }
    
    .tab.active::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--accent);
    }
    
    .tab-badge {
      padding: 2px 6px;
      background: var(--danger);
      color: white;
      border-radius: var(--radius-full);
      font-size: 0.7rem;
      font-weight: 600;
    }
    
    /* Tab Panels */
    .tab-panel {
      padding: var(--space-4);
      display: none;
    }
    
    .tab-panel.active {
      display: block;
    }
    
    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    
    .stat-box {
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: var(--space-3);
      text-align: center;
    }
    
    .stat-box-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    
    .stat-box-label {
      font-size: 0.7rem;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    /* Details/Accordion */
    .details-section {
      margin-bottom: var(--space-3);
    }
    
    .details-section summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-3);
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-weight: 500;
      color: var(--text-secondary);
      transition: all var(--transition-fast);
    }
    
    .details-section summary:hover {
      color: var(--text-primary);
      border-color: var(--border-default);
    }
    
    .details-section[open] summary {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
      border-bottom-color: transparent;
    }
    
    .details-section .details-content {
      padding: var(--space-3);
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-top: none;
      border-radius: 0 0 var(--radius-md) var(--radius-md);
    }
    
    /* List items */
    .list-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-2) 0;
      border-bottom: 1px solid var(--border-subtle);
    }
    
    .list-item:last-child {
      border-bottom: none;
    }
    
    .list-item-label {
      color: var(--text-secondary);
    }
    
    .list-item-value {
      font-weight: 500;
    }
    
    .list-item-value.good {
      color: var(--success);
    }
    
    .list-item-value.warning {
      color: var(--warning);
    }
    
    .list-item-value.error {
      color: var(--danger);
    }

    /* =====================================================
       MOBILE BOTTOM BAR
       ===================================================== */
    .mobile-bar {
      display: none;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: var(--mobile-bar-height);
      background: rgba(10, 10, 15, 0.9);
      backdrop-filter: blur(20px);
      border-top: 1px solid var(--border-subtle);
      padding: var(--space-2);
      padding-bottom: max(var(--space-2), env(safe-area-inset-bottom));
      z-index: 100;
    }
    
    @media (max-width: 1024px) {
      .mobile-bar {
        display: flex;
        justify-content: space-around;
        align-items: center;
      }
    }
    
    .mobile-bar-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1);
      background: transparent;
      border: none;
      color: var(--text-tertiary);
      font-size: 0.7rem;
      font-weight: 500;
      cursor: pointer;
      padding: var(--space-2);
      border-radius: var(--radius-md);
      transition: all var(--transition-fast);
    }
    
    .mobile-bar-btn span:first-child {
      font-size: 1.25rem;
    }
    
    .mobile-bar-btn:hover,
    .mobile-bar-btn.active {
      color: var(--accent);
      background: var(--accent-muted);
    }

    /* =====================================================
       MODALS
       ===================================================== */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      opacity: 0;
      visibility: hidden;
      transition: all var(--transition-base);
    }
    
    .modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }
    
    .modal {
      background: var(--bg-secondary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      width: 90%;
      max-width: 500px;
      max-height: 85vh;
      overflow: hidden;
      transform: scale(0.95) translateY(10px);
      transition: transform var(--transition-base);
    }
    
    .modal-overlay.active .modal {
      transform: scale(1) translateY(0);
    }
    
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--border-subtle);
    }
    
    .modal-title {
      font-size: 1.125rem;
      font-weight: 600;
    }
    
    .modal-close {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 1.25rem;
      transition: all var(--transition-fast);
    }
    
    .modal-close:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .modal-body {
      padding: var(--space-5);
      overflow-y: auto;
      max-height: calc(85vh - 140px);
    }
    
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
      padding: var(--space-4) var(--space-5);
      border-top: 1px solid var(--border-subtle);
    }

    /* =====================================================
       BUTTONS
       ===================================================== */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--transition-fast);
      border: none;
    }
    
    .btn-primary {
      background: var(--accent);
      color: var(--text-inverted);
    }
    
    .btn-primary:hover {
      background: var(--accent-hover);
    }
    
    .btn-secondary {
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
    }
    
    .btn-secondary:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .btn-danger {
      background: var(--danger);
      color: white;
    }
    
    .btn-sm {
      padding: var(--space-1) var(--space-3);
      font-size: 0.8rem;
    }

    /* =====================================================
       FORMS
       ===================================================== */
    .form-group {
      margin-bottom: var(--space-4);
    }
    
    .form-label {
      display: block;
      margin-bottom: var(--space-2);
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
    }
    
    .form-input,
    .form-select {
      width: 100%;
      padding: var(--space-3);
      background: var(--bg-primary);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: 0.875rem;
      transition: all var(--transition-fast);
    }
    
    .form-input:focus,
    .form-select:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-muted);
    }
    
    /* =====================================================
       UTILITIES
       ===================================================== */
    .text-muted { color: var(--text-tertiary); }
    .text-success { color: var(--success); }
    .text-warning { color: var(--warning); }
    .text-danger { color: var(--danger); }
    .text-sm { font-size: 0.875rem; }
    .text-xs { font-size: 0.75rem; }
    .font-medium { font-weight: 500; }
    .font-bold { font-weight: 700; }
  </style>
</head>
<body>
  <!-- Header -->
  <header class="app-header">
    <div class="header-brand">
      <span class="header-logo">🐦</span>
      <h1 class="header-title">${config.camera.name}</h1>
    </div>
    
    <div class="header-status">
      <span class="status-badge status-live" id="status-badge">Live</span>
      <span class="status-badge status-mode" id="mode-badge">WebRTC</span>
    </div>
    
    <div class="header-actions">
      <button class="btn-icon" onclick="openSettings()" title="Settings">⚙️</button>
    </div>
  </header>

  <main class="app-main">
    <!-- Bird Activity Hero -->
    <section class="bird-hero">
      <div class="bird-hero-header">
        <h2 class="bird-hero-title">
          <span>🐦</span>
          Bird Activity
        </h2>
        <div class="bird-hero-stats">
          <div class="bird-stat">
            <div class="bird-stat-value" id="today-count">0</div>
            <div class="bird-stat-label">Today</div>
          </div>
          <div class="bird-stat">
            <div class="bird-stat-value" id="species-count">0</div>
            <div class="bird-stat-label">Species</div>
          </div>
          <div class="bird-stat">
            <div class="bird-stat-value" id="lifelist-count">0</div>
            <div class="bird-stat-label">Life List</div>
          </div>
          <div class="bird-stat" id="weather-stat" style="display: none;">
            <div class="bird-stat-value" id="weather-temp">--</div>
            <div class="bird-stat-label" id="weather-conditions">Weather</div>
          </div>
        </div>
      </div>
      
      <div class="bird-timeline" id="bird-timeline">
        <div class="bird-card bird-card--more" onclick="openBirdModal()">
          View all activity →
        </div>
      </div>
    </section>

    <!-- Video Section -->
    <section class="video-section">
      <div class="video-wrapper" id="video-wrapper">
        <video id="video" class="video-player" autoplay muted playsinline></video>
        
        <!-- PTZ Overlay -->
        <div class="ptz-overlay" id="ptz-overlay">
          <div class="ptz-dpad">
            <div></div>
            <button class="ptz-btn" data-pan="0" data-tilt="0.5">⬆️</button>
            <div></div>
            <button class="ptz-btn" data-pan="-0.5" data-tilt="0">⬅️</button>
            <button class="ptz-btn home" onclick="ptzHome()">🏠</button>
            <button class="ptz-btn" data-pan="0.5" data-tilt="0">➡️</button>
            <div></div>
            <button class="ptz-btn" data-pan="0" data-tilt="-0.5">⬇️</button>
            <div></div>
          </div>
          
          <div class="ptz-zoom">
            <button class="ptz-btn" data-zoom="0.3">🔍+</button>
            <button class="ptz-btn" data-zoom="-0.3">🔍−</button>
          </div>
          
          <button class="ptz-btn test" onclick="runPtzTest()" title="Test all PTZ functions" style="background: var(--warning); padding: 8px 12px; font-size: 12px;">
            🧪 Test
          </button>
        </div>
        
        <!-- Video Toolbar -->
        <div class="video-toolbar">
          <div class="video-info">
            <span id="stream-info">Loading...</span>
          </div>
          <div class="video-actions">
            <button class="toolbar-btn" onclick="takeSnapshot()" title="Snapshot">📸</button>
            <button class="toolbar-btn" id="record-btn" onclick="toggleRecording()" title="Record">⏺️</button>
            <button class="toolbar-btn" onclick="toggleFullscreen()" title="Fullscreen">⛶</button>
          </div>
        </div>
      </div>
      
      <!-- Presets Bar -->
      <div class="presets-bar" id="presets-bar">
        <button class="preset-btn add" onclick="saveCurrentPosition()">+ Save Position</button>
      </div>
    </section>

    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-card">
        <div class="tabs">
          <button class="tab active" data-tab="stats" onclick="switchTab('stats')">
            📊 Stats
          </button>
          <button class="tab" data-tab="camera" onclick="switchTab('camera')">
            📹 Camera
          </button>
          <button class="tab" data-tab="clips" onclick="switchTab('clips')">
            🎬 Clips
          </button>
        </div>
        
        <!-- Stats Panel -->
        <div class="tab-panel active" id="panel-stats">
          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-box-value" id="stat-fps">--</div>
              <div class="stat-box-label">FPS</div>
            </div>
            <div class="stat-box">
              <div class="stat-box-value" id="stat-resolution">--</div>
              <div class="stat-box-label">Resolution</div>
            </div>
            <div class="stat-box">
              <div class="stat-box-value" id="stat-latency">--</div>
              <div class="stat-box-label">Latency</div>
            </div>
          </div>
          
          <details class="details-section">
            <summary>🐦 Top Species</summary>
            <div class="details-content" id="top-species-list">
              <p class="text-muted text-sm">No data yet</p>
            </div>
          </details>
          
          <details class="details-section">
            <summary>💾 Storage</summary>
            <div class="details-content">
              <div class="list-item">
                <span class="list-item-label">Used</span>
                <span class="list-item-value" id="storage-used">--</span>
              </div>
              <div class="list-item">
                <span class="list-item-label">Clips</span>
                <span class="list-item-value" id="clip-count">--</span>
              </div>
            </div>
          </details>
          
          <details class="details-section">
            <summary>🔧 System</summary>
            <div class="details-content">
              <div class="list-item">
                <span class="list-item-label">Connection</span>
                <span class="list-item-value good" id="connection-status">Connected</span>
              </div>
              <div class="list-item">
                <span class="list-item-label">Motion</span>
                <span class="list-item-value" id="motion-status">Enabled</span>
              </div>
              <div class="list-item">
                <span class="list-item-label">Detection</span>
                <span class="list-item-value" id="detection-status">Active</span>
              </div>
            </div>
          </details>
        </div>
        
        <!-- Camera Panel -->
        <div class="tab-panel" id="panel-camera">
          <div class="list-item">
            <span class="list-item-label">Mode</span>
            <span class="list-item-value" id="camera-mode">WebRTC</span>
          </div>
          <div class="list-item">
            <span class="list-item-label">PTZ</span>
            <span class="list-item-value" id="ptz-status">Enabled</span>
          </div>
          <div class="list-item">
            <span class="list-item-label">IP</span>
            <span class="list-item-value text-muted">${config.onvif.host || 'N/A'}</span>
          </div>
          
          <div style="margin-top: var(--space-4);">
            <button class="btn btn-secondary" style="width: 100%;" onclick="togglePatrol()" id="patrol-btn">
              🔄 Start Patrol
            </button>
          </div>
        </div>
        
        <!-- Clips Panel -->
        <div class="tab-panel" id="panel-clips">
          <div id="clips-list">
            <p class="text-muted text-sm">No clips yet</p>
          </div>
        </div>
      </div>
    </aside>
  </main>

  <!-- Mobile Bottom Bar -->
  <nav class="mobile-bar">
    <button class="mobile-bar-btn active" onclick="switchMobileTab('live')">
      <span>📹</span>
      <span>Live</span>
    </button>
    <button class="mobile-bar-btn" onclick="switchMobileTab('birds')">
      <span>🐦</span>
      <span>Birds</span>
    </button>
    <button class="mobile-bar-btn" onclick="switchMobileTab('clips')">
      <span>🎬</span>
      <span>Clips</span>
    </button>
    <button class="mobile-bar-btn" onclick="openSettings()">
      <span>⚙️</span>
      <span>Settings</span>
    </button>
  </nav>

  <!-- Bird Details Modal -->
  <div class="modal-overlay" id="bird-modal">
    <div class="modal" style="max-width: 600px;">
      <div class="modal-header">
        <h3 class="modal-title">🐦 Bird Activity</h3>
        <button class="modal-close" onclick="closeBirdModal()">×</button>
      </div>
      <div class="modal-body" id="bird-modal-content">
        <!-- Populated by JS -->
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="exportBirdData()">📥 Export</button>
        <button class="btn btn-primary" onclick="closeBirdModal()">Close</button>
      </div>
    </div>
  </div>

  <!-- Save Preset Modal -->
  <div class="modal-overlay" id="preset-modal">
    <div class="modal" style="max-width: 400px;">
      <div class="modal-header">
        <h3 class="modal-title">💾 Save Position</h3>
        <button class="modal-close" onclick="closePresetModal()">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" class="form-input" id="preset-name" placeholder="e.g., Bird Feeder">
        </div>
        <div class="form-group">
          <label class="form-label">Description (optional)</label>
          <input type="text" class="form-input" id="preset-desc" placeholder="e.g., Best angle for feeders">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closePresetModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmSavePreset()">Save</button>
      </div>
    </div>
  </div>

  <!-- Settings Modal -->
  <div class="modal-overlay" id="settings-modal">
    <div class="modal" style="max-width: 550px;">
      <div class="modal-header">
        <h3 class="modal-title">⚙️ Settings</h3>
        <button class="modal-close" onclick="closeSettings()">×</button>
      </div>
      <div class="modal-body">
        <!-- Settings Tabs -->
        <div class="tabs" style="margin-bottom: var(--space-4);">
          <button class="tab active" onclick="switchSettingsTab('video')" data-settings-tab="video">📹 Video</button>
          <button class="tab" onclick="switchSettingsTab('notifications')" data-settings-tab="notifications">🔔 Alerts</button>
          <button class="tab" onclick="switchSettingsTab('detection')" data-settings-tab="detection">🐦 Detection</button>
          <button class="tab" onclick="switchSettingsTab('apikeys')" data-settings-tab="apikeys">🔑 API Keys</button>
        </div>
        
        <!-- Video Settings -->
        <div id="settings-video" class="settings-panel">
          <div class="form-group">
            <label class="form-label">Output Resolution</label>
            <select class="form-select" id="setting-resolution">
              <option value="source">Source (no scaling)</option>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Quality Preset</label>
            <select class="form-select" id="setting-quality">
              <option value="ultrafast">Ultra Fast (low CPU)</option>
              <option value="veryfast">Very Fast</option>
              <option value="fast">Fast</option>
              <option value="medium">Medium (best quality)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Bitrate</label>
            <select class="form-select" id="setting-bitrate">
              <option value="1000k">1 Mbps</option>
              <option value="2000k">2 Mbps</option>
              <option value="3000k">3 Mbps</option>
              <option value="4000k">4 Mbps</option>
            </select>
          </div>
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: var(--space-2); cursor: pointer;">
              <input type="checkbox" id="setting-audio" checked style="width: 18px; height: 18px;">
              <span>Enable Audio</span>
            </label>
          </div>
        </div>
        
        <!-- Notification Settings -->
        <div id="settings-notifications" class="settings-panel" style="display: none;">
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: var(--space-2); cursor: pointer;">
              <input type="checkbox" id="notify-enabled" checked style="width: 18px; height: 18px;">
              <span>Enable Notifications</span>
            </label>
          </div>
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: var(--space-2); cursor: pointer;">
              <input type="checkbox" id="notify-birds" checked style="width: 18px; height: 18px;">
              <span>Bird Detected</span>
            </label>
          </div>
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: var(--space-2); cursor: pointer;">
              <input type="checkbox" id="notify-newspecies" checked style="width: 18px; height: 18px;">
              <span>New Species (first sighting)</span>
            </label>
          </div>
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: var(--space-2); cursor: pointer;">
              <input type="checkbox" id="notify-offline" checked style="width: 18px; height: 18px;">
              <span>Camera Offline</span>
            </label>
          </div>
          <div class="form-group">
            <label class="form-label">ntfy.sh Topic (optional)</label>
            <input type="text" class="form-input" id="notify-ntfy" placeholder="my-birdcam">
            <div class="text-xs text-muted" style="margin-top: 4px;">Free push notifications via ntfy.sh</div>
          </div>
          <button class="btn btn-secondary" onclick="testNotification()" style="margin-top: var(--space-2);">
            🧪 Send Test Notification
          </button>
        </div>
        
        <!-- Detection Settings -->
        <div id="settings-detection" class="settings-panel" style="display: none;">
          <div class="form-group">
            <label class="form-label">Minimum Confidence</label>
            <select class="form-select" id="setting-confidence">
              <option value="0.5">50% (More detections)</option>
              <option value="0.7" selected>70% (Balanced)</option>
              <option value="0.85">85% (High accuracy)</option>
              <option value="0.95">95% (Very high accuracy)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Rare Species (one per line)</label>
            <textarea class="form-input" id="setting-rarespecies" rows="4" placeholder="Pileated Woodpecker
Painted Bunting
Scarlet Tanager"></textarea>
            <div class="text-xs text-muted" style="margin-top: 4px;">Get special alerts for these species</div>
          </div>
        </div>
        
        <!-- API Keys Settings -->
        <div id="settings-apikeys" class="settings-panel" style="display: none;">
          <div class="form-group">
            <label class="form-label">Current API Key</label>
            <div style="display: flex; gap: var(--space-2);">
              <input type="text" class="form-input" id="current-api-key" readonly style="font-family: var(--font-mono); flex: 1;">
              <button class="btn btn-secondary" onclick="copyApiKey()" title="Copy to clipboard">📋</button>
            </div>
            <div class="text-xs text-muted" style="margin-top: 4px;">Use this key for authenticated API requests</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Quick Access URL</label>
            <div style="display: flex; gap: var(--space-2);">
              <input type="text" class="form-input" id="dashboard-url" readonly style="font-family: var(--font-mono); font-size: 11px; flex: 1;">
              <button class="btn btn-secondary" onclick="copyDashboardUrl()" title="Copy URL">📋</button>
            </div>
            <div class="text-xs text-muted" style="margin-top: 4px;">Bookmark this URL for quick access without login</div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Stream URLs (for external apps)</label>
            <div style="background: var(--bg-tertiary); border-radius: var(--radius-md); padding: var(--space-3); font-family: var(--font-mono); font-size: 11px; word-break: break-all;">
              <div style="margin-bottom: var(--space-2);">
                <span style="color: var(--text-tertiary);">HLS:</span><br>
                <span id="hls-stream-url" style="color: var(--accent);"></span>
              </div>
              <div style="margin-bottom: var(--space-2);">
                <span style="color: var(--text-tertiary);">WebRTC:</span><br>
                <span id="webrtc-stream-url" style="color: var(--accent);"></span>
              </div>
              <div>
                <span style="color: var(--text-tertiary);">go2rtc (local):</span><br>
                <span id="go2rtc-stream-url" style="color: var(--text-secondary);"></span>
              </div>
            </div>
          </div>
          
          <div style="border-top: 1px solid var(--border-subtle); padding-top: var(--space-4); margin-top: var(--space-4);">
            <label class="form-label" style="color: var(--warning);">⚠️ Danger Zone</label>
            <p class="text-xs text-muted" style="margin-bottom: var(--space-3);">
              Regenerating the API key will invalidate the current key. 
              You'll need to update any apps or bookmarks using the old key.
            </p>
            <button class="btn" style="background: var(--danger); color: white;" onclick="regenerateApiKey()">
              🔄 Regenerate API Key
            </button>
          </div>
        </div>
      </div>
      <div class="modal-footer" id="settings-footer">
        <button class="btn btn-secondary" onclick="closeSettings()">Cancel</button>
        <button class="btn btn-primary" onclick="saveSettings()">Save Settings</button>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <script>
    const video = document.getElementById('video');
    let isRecording = false;
    let currentMode = 'loading';
    let peerConnection = null;
    let hlsPlayer = null;
    let webrtcAvailable = false;
    let ptzAvailable = false;
    let patrolActive = false;
    
    // Get API key from URL for authenticated requests
    const urlParams = new URLSearchParams(window.location.search);
    const API_KEY = urlParams.get('api_key') || '';
    
    // Helper to add API key to URL
    function apiUrl(path) {
      return path + (path.includes('?') ? '&' : '?') + 'api_key=' + API_KEY;
    }
    
    // Helper for authenticated fetch
    async function apiFetch(path, options = {}) {
      return fetch(apiUrl(path), options);
    }

    // ==================== WebRTC ====================
    async function startWebRTC() {
      try {
        peerConnection = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        peerConnection.ontrack = (e) => {
          if (e.streams?.[0]) video.srcObject = e.streams[0];
        };
        
        peerConnection.onconnectionstatechange = () => {
          if (peerConnection.connectionState === 'failed') fallbackToHLS();
        };
        
        peerConnection.addTransceiver('video', { direction: 'recvonly' });
        peerConnection.addTransceiver('audio', { direction: 'recvonly' });
        
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        await new Promise(r => setTimeout(r, 2000));
        
        const res = await apiFetch('/api/webrtc/offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(peerConnection.localDescription)
        });
        
        if (!res.ok) throw new Error('WebRTC failed: ' + res.status);
        await peerConnection.setRemoteDescription(await res.json());
        
        currentMode = 'webrtc';
        updateModeDisplay();
      } catch (err) {
        console.error('[WebRTC]', err);
        fallbackToHLS();
      }
    }
    
    function fallbackToHLS() {
      if (peerConnection) { peerConnection.close(); peerConnection = null; }
      video.srcObject = null;
      startHLS();
    }
    
    function startHLS() {
      // Get API key from URL to include in HLS requests
      const urlParams = new URLSearchParams(window.location.search);
      const apiKey = urlParams.get('api_key') || '';
      const hlsUrl = '/stream.m3u8' + (apiKey ? '?api_key=' + apiKey : '');
      
      if (Hls.isSupported()) {
        hlsPlayer = new Hls({ liveSyncDuration: 3 });
        hlsPlayer.loadSource(hlsUrl);
        hlsPlayer.attachMedia(video);
        hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
          console.error('[HLS] Error:', data.type, data.details);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = hlsUrl;
      }
      currentMode = 'hls';
      updateModeDisplay();
    }
    
    function updateModeDisplay() {
      const badge = document.getElementById('mode-badge');
      badge.textContent = currentMode.toUpperCase();
      document.getElementById('stat-latency').textContent = currentMode === 'webrtc' ? '~200ms' : '~4s';
    }

    // ==================== PTZ ====================
    function initPTZ() {
      document.querySelectorAll('.ptz-btn[data-pan], .ptz-btn[data-zoom]').forEach(btn => {
        const pan = parseFloat(btn.dataset.pan || 0);
        const tilt = parseFloat(btn.dataset.tilt || 0);
        const zoom = parseFloat(btn.dataset.zoom || 0);
        
        const start = () => ptzMove(pan, tilt, zoom);
        const stop = () => ptzStop();
        
        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', stop);
        btn.addEventListener('mouseleave', stop);
        btn.addEventListener('touchstart', e => { e.preventDefault(); start(); });
        btn.addEventListener('touchend', stop);
      });
    }
    
    async function ptzMove(pan, tilt, zoom) {
      await apiFetch('/api/ptz/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan, tilt, zoom, type: 'continuous' })
      });
    }
    
    async function ptzStop() {
      await apiFetch('/api/ptz/stop', { method: 'POST' });
    }
    
    async function ptzHome() {
      await apiFetch('/api/ptz/home', { method: 'POST' });
    }
    
    async function runPtzTest() {
      const testBtn = document.querySelector('.ptz-btn.test');
      const originalText = testBtn.innerHTML;
      
      testBtn.innerHTML = '⏳ Testing...';
      testBtn.disabled = true;
      testBtn.style.opacity = '0.7';
      
      try {
        const res = await apiFetch('/api/ptz/test', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration: 1500 })
        });
        const data = await res.json();
        
        if (data.success) {
          testBtn.innerHTML = '✅ Pass!';
          testBtn.style.background = 'var(--success)';
          
          // Show results
          const resultText = data.results.map(r => 
            (r.success ? '✅' : '❌') + ' ' + r.action
          ).join('\\n');
          alert('PTZ Test Complete!\\n\\n' + resultText);
        } else {
          testBtn.innerHTML = '❌ Failed';
          testBtn.style.background = 'var(--danger)';
          
          const resultText = data.results?.map(r => 
            (r.success ? '✅' : '❌') + ' ' + r.action
          ).join('\\n') || data.error;
          alert('PTZ Test Failed\\n\\n' + resultText);
        }
      } catch (err) {
        testBtn.innerHTML = '❌ Error';
        testBtn.style.background = 'var(--danger)';
        alert('PTZ Test Error: ' + err.message);
      }
      
      // Reset button after 3 seconds
      setTimeout(() => {
        testBtn.innerHTML = originalText;
        testBtn.disabled = false;
        testBtn.style.opacity = '1';
        testBtn.style.background = 'var(--warning)';
      }, 3000);
    }

    // ==================== Recording & Snapshots ====================
    async function takeSnapshot() {
      const res = await apiFetch('/api/snapshot', { method: 'POST' });
      if ((await res.json()).success) alert('📸 Snapshot saved!');
    }
    
    async function toggleRecording() {
      await apiFetch(isRecording ? '/api/recording/stop' : '/api/recording/start', { method: 'POST' });
      isRecording = !isRecording;
      document.getElementById('record-btn').classList.toggle('recording', isRecording);
    }
    
    function toggleFullscreen() {
      const wrapper = document.getElementById('video-wrapper');
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        wrapper.requestFullscreen();
      }
    }

    // ==================== Tabs ====================
    function switchTab(tabId) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector(\`[data-tab="\${tabId}"]\`).classList.add('active');
      document.getElementById(\`panel-\${tabId}\`).classList.add('active');
    }
    
    function switchMobileTab(tab) {
      document.querySelectorAll('.mobile-bar-btn').forEach(b => b.classList.remove('active'));
      event.target.closest('.mobile-bar-btn').classList.add('active');
    }

    // ==================== Bird Activity ====================
    async function refreshBirdStats() {
      try {
        const res = await apiFetch('/api/birds/summary');
        const data = await res.json();
        
        document.getElementById('today-count').textContent = data.todaySightings || 0;
        document.getElementById('species-count').textContent = data.todaySpecies || 0;
        document.getElementById('lifelist-count').textContent = data.totalSpecies || 0;
        
        const timeline = document.getElementById('bird-timeline');
        if (data.recentSightings?.length) {
          timeline.innerHTML = data.recentSightings.slice(0, 8).map(s => \`
            <div class="bird-card">
              <div class="bird-card-thumb">🐦</div>
              <div class="bird-card-name">\${s.species}</div>
              <div class="bird-card-time">\${new Date(s.timestamp).toLocaleTimeString()}</div>
              <span class="bird-card-confidence">\${(s.confidence * 100).toFixed(0)}%</span>
            </div>
          \`).join('') + '<div class="bird-card bird-card--more" onclick="openBirdModal()">View all →</div>';
        }
      } catch (err) {}
    }
    
    function openBirdModal() {
      document.getElementById('bird-modal').classList.add('active');
      loadBirdDetails();
    }
    
    function closeBirdModal() {
      document.getElementById('bird-modal').classList.remove('active');
    }
    
    async function loadBirdDetails() {
      try {
        const [lifeRes, topRes, sightRes] = await Promise.all([
          fetch('/api/birds/lifelist'),
          fetch('/api/birds/top?limit=10'),
          fetch('/api/birds/sightings?limit=30')
        ]);
        
        const life = await lifeRes.json();
        const top = await topRes.json();
        const sight = await sightRes.json();
        
        document.getElementById('bird-modal-content').innerHTML = \`
          <h4 style="margin-bottom: var(--space-3); color: var(--accent);">📋 Life List (\${life.count} species)</h4>
          <div style="display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-5);">
            \${life.species.map(s => \`<span style="background: var(--bg-primary); padding: 4px 10px; border-radius: var(--radius-sm); font-size: 0.8rem;">\${s}</span>\`).join('')}
          </div>
          
          <h4 style="margin-bottom: var(--space-3); color: var(--accent);">🏆 Top Species</h4>
          <div style="margin-bottom: var(--space-5);">
            \${top.species.map((s, i) => \`
              <div class="list-item">
                <span>\${i + 1}. \${s.species}</span>
                <span class="text-success font-bold">\${s.count}</span>
              </div>
            \`).join('')}
          </div>
          
          <h4 style="margin-bottom: var(--space-3); color: var(--accent);">📅 Recent Sightings</h4>
          <div style="max-height: 200px; overflow-y: auto;">
            \${sight.sightings.map(s => \`
              <div class="list-item">
                <div>
                  <div class="font-medium">🐦 \${s.species}</div>
                  <div class="text-xs text-muted">\${new Date(s.timestamp).toLocaleString()}</div>
                </div>
                <span class="text-success">\${(s.confidence * 100).toFixed(0)}%</span>
              </div>
            \`).join('')}
          </div>
        \`;
      } catch (err) {}
    }
    
    async function exportBirdData() {
      const res = await apiFetch('/api/birds/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'birdcam-data.json';
      a.click();
    }

    // ==================== Presets ====================
    async function refreshPresets() {
      try {
        const res = await apiFetch('/api/presets');
        const data = await res.json();
        
        patrolActive = data.patrolActive;
        document.getElementById('patrol-btn').textContent = patrolActive ? '⏹️ Stop Patrol' : '🔄 Start Patrol';
        
        const bar = document.getElementById('presets-bar');
        bar.innerHTML = (data.presets || []).map(p => \`
          <button class="preset-btn" onclick="gotoPreset('\${p.id}')">\${p.name}</button>
        \`).join('') + '<button class="preset-btn add" onclick="saveCurrentPosition()">+ Save</button>';
      } catch (err) {}
    }
    
    function saveCurrentPosition() {
      document.getElementById('preset-modal').classList.add('active');
    }
    
    function closePresetModal() {
      document.getElementById('preset-modal').classList.remove('active');
    }
    
    async function confirmSavePreset() {
      const name = document.getElementById('preset-name').value.trim();
      if (!name) return alert('Enter a name');
      
      await apiFetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createFromCurrent: true, name, description: document.getElementById('preset-desc').value })
      });
      
      closePresetModal();
      refreshPresets();
    }
    
    async function gotoPreset(id) {
      await fetch(\`/api/presets/\${id}/goto\`, { method: 'POST' });
    }
    
    async function togglePatrol() {
      await apiFetch(patrolActive ? '/api/patrol/stop' : '/api/patrol/start', { method: 'POST' });
      patrolActive = !patrolActive;
      document.getElementById('patrol-btn').textContent = patrolActive ? '⏹️ Stop Patrol' : '🔄 Start Patrol';
    }

    // ==================== Status ====================
    async function updateStatus() {
      try {
        const res = await apiFetch('/health');
        const data = await res.json();
        
        document.getElementById('stream-info').textContent = \`\${data.streamStats?.fps || '--'} fps | \${data.streamStats?.bitrate || '--'}\`;
        document.getElementById('stat-fps').textContent = data.streamStats?.fps || '--';
        document.getElementById('stat-resolution').textContent = data.streamStats?.resolution || '--';
        document.getElementById('storage-used').textContent = \`\${data.storage?.usedMb || 0} MB\`;
        document.getElementById('clip-count').textContent = data.storage?.clipCount || 0;
        document.getElementById('motion-status').textContent = data.motionDetection ? 'Enabled' : 'Disabled';
        
        isRecording = data.recording;
        document.getElementById('record-btn').classList.toggle('recording', isRecording);
        
        webrtcAvailable = data.webrtc;
      } catch (err) {}
    }
    
    async function refreshClips() {
      try {
        const res = await apiFetch('/api/clips');
        const data = await res.json();
        
        const list = document.getElementById('clips-list');
        if (data.clips?.length) {
          list.innerHTML = data.clips.slice(0, 5).map(c => \`
            <div class="list-item">
              <div>
                <div class="font-medium">\${c.id}</div>
                <div class="text-xs text-muted">\${new Date(c.startTime).toLocaleString()}</div>
              </div>
              <a href="/api/clips/\${c.id}/video" download class="btn btn-sm btn-secondary">⬇️</a>
            </div>
          \`).join('');
        }
      } catch (err) {}
    }

    // ==================== Weather ====================
    async function refreshWeather() {
      try {
        const res = await apiFetch('/api/weather/current');
        if (!res.ok) return;
        
        const data = await res.json();
        document.getElementById('weather-stat').style.display = 'block';
        document.getElementById('weather-temp').textContent = Math.round(data.temperature) + '°';
        document.getElementById('weather-conditions').textContent = data.conditions;
      } catch (err) {}
    }

    // ==================== Settings ====================
    function openSettings() {
      document.getElementById('settings-modal').classList.add('active');
      loadSettings();
    }
    
    function closeSettings() {
      document.getElementById('settings-modal').classList.remove('active');
    }
    
    function switchSettingsTab(tab) {
      document.querySelectorAll('[data-settings-tab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
      document.querySelector(\`[data-settings-tab="\${tab}"]\`).classList.add('active');
      document.getElementById(\`settings-\${tab}\`).style.display = 'block';
      
      // Hide save/cancel for API keys tab (it has its own regenerate button)
      const footer = document.getElementById('settings-footer');
      footer.style.display = tab === 'apikeys' ? 'none' : 'flex';
    }
    
    async function loadSettings() {
      try {
        // Video settings
        const videoRes = await apiFetch('/api/settings/video');
        const video = await videoRes.json();
        document.getElementById('setting-resolution').value = video.outputResolution || 'source';
        document.getElementById('setting-quality').value = video.qualityPreset || 'ultrafast';
        document.getElementById('setting-bitrate').value = video.outputBitrate || '2000k';
        document.getElementById('setting-audio').checked = video.audioEnabled !== false;
        
        // Notification settings
        const notifyRes = await apiFetch('/api/notifications/settings');
        const notify = await notifyRes.json();
        document.getElementById('notify-enabled').checked = notify.enabled !== false;
        document.getElementById('notify-birds').checked = notify.onBirdDetected !== false;
        document.getElementById('notify-newspecies').checked = notify.onNewSpecies !== false;
        document.getElementById('notify-offline').checked = notify.onCameraOffline !== false;
        document.getElementById('notify-ntfy').value = notify.ntfy?.topic || '';
        document.getElementById('setting-rarespecies').value = (notify.rareSpecies || []).join('\\n');
        
        // API Key settings
        loadApiKeySettings();
      } catch (err) {}
    }
    
    async function loadApiKeySettings() {
      try {
        const res = await apiFetch('/api/auth/key');
        const data = await res.json();
        document.getElementById('current-api-key').value = data.apiKey || '';
        
        // Build URLs
        const baseUrl = window.location.origin;
        const apiKey = data.apiKey;
        document.getElementById('dashboard-url').value = baseUrl + '/?api_key=' + apiKey;
        document.getElementById('hls-stream-url').textContent = baseUrl + '/stream.m3u8?api_key=' + apiKey;
        document.getElementById('webrtc-stream-url').textContent = baseUrl + '/api/webrtc?api_key=' + apiKey;
        
        // go2rtc URL (different port, no auth needed locally)
        const go2rtcHost = window.location.hostname;
        document.getElementById('go2rtc-stream-url').textContent = 'http://' + go2rtcHost + ':1984/stream.html?src=birdcam';
      } catch (err) {
        console.error('Failed to load API key settings:', err);
      }
    }
    
    function copyApiKey() {
      const input = document.getElementById('current-api-key');
      input.select();
      document.execCommand('copy');
      alert('✅ API key copied to clipboard!');
    }
    
    function copyDashboardUrl() {
      const input = document.getElementById('dashboard-url');
      input.select();
      document.execCommand('copy');
      alert('✅ Dashboard URL copied to clipboard!');
    }
    
    async function regenerateApiKey() {
      if (!confirm('⚠️ Are you sure you want to regenerate the API key?\\n\\nThis will invalidate the current key. Any apps or bookmarks using it will stop working.')) {
        return;
      }
      
      try {
        const res = await apiFetch('/api/auth/regenerate', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
          // Update displayed values
          loadApiKeySettings();
          
          // Update current page URL with new key
          const newUrl = window.location.origin + '/?api_key=' + data.apiKey;
          alert('✅ API key regenerated!\\n\\nNew key: ' + data.apiKey + '\\n\\nBookmark the new URL to continue accessing the dashboard.');
          
          // Redirect to new URL
          window.location.href = newUrl;
        } else {
          alert('❌ Failed to regenerate API key');
        }
      } catch (err) {
        alert('❌ Error regenerating API key: ' + err.message);
      }
    }
    
    async function saveSettings() {
      try {
        // Save video settings
        await apiFetch('/api/settings/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outputResolution: document.getElementById('setting-resolution').value,
            qualityPreset: document.getElementById('setting-quality').value,
            outputBitrate: document.getElementById('setting-bitrate').value,
            audioEnabled: document.getElementById('setting-audio').checked,
          })
        });
        
        // Save notification settings
        const ntfyTopic = document.getElementById('notify-ntfy').value.trim();
        await apiFetch('/api/notifications/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: document.getElementById('notify-enabled').checked,
            onBirdDetected: document.getElementById('notify-birds').checked,
            onNewSpecies: document.getElementById('notify-newspecies').checked,
            onCameraOffline: document.getElementById('notify-offline').checked,
            ntfy: ntfyTopic ? { enabled: true, topic: ntfyTopic } : { enabled: false },
            rareSpecies: document.getElementById('setting-rarespecies').value.split('\\n').map(s => s.trim()).filter(Boolean),
          })
        });
        
        closeSettings();
        alert('✅ Settings saved!');
      } catch (err) {
        alert('❌ Failed to save settings');
      }
    }
    
    async function testNotification() {
      try {
        const res = await apiFetch('/api/notifications/test', { method: 'POST' });
        const data = await res.json();
        alert(data.success ? '✅ Test notification sent!' : '❌ Failed to send notification');
      } catch (err) {
        alert('❌ Error sending notification');
      }
    }

    // ==================== Initialize ====================
    async function init() {
      initPTZ();
      
      // Try WebRTC first
      try {
        const res = await apiFetch('/api/webrtc/status');
        const data = await res.json();
        if (data.available) {
          await startWebRTC();
        } else {
          startHLS();
        }
      } catch (err) {
        startHLS();
      }
      
      updateStatus();
      refreshBirdStats();
      refreshPresets();
      refreshClips();
      refreshWeather();
      
      setInterval(updateStatus, 5000);
      setInterval(refreshBirdStats, 30000);
      setInterval(refreshWeather, 300000); // Update weather every 5 min
    }
    
    init();
  </script>
</body>
</html>`;
}
