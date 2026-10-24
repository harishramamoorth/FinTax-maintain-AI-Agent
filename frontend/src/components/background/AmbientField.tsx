import { useEffect, useRef } from 'react';
import { useMotion } from '@/hooks/useMotion';

/** Restrained drifting particle field with faint links and tiny mouse parallax. Static when motion is reduced/off. */
export function AmbientField() {
  const ref = useRef<HTMLCanvasElement>(null);
  const motion = useMotion();

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let w = 0, h = 0, raf = 0, running = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const count = Math.round(Math.min(70, (window.innerWidth * window.innerHeight) / 26000));
    const pts = Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.00004, vy: (Math.random() - 0.5) * 0.00004, r: Math.random() * 1.2 + 0.4, hue: Math.random() }));
    const mouse = { x: 0, y: 0 };
    const rgb = () => {
      const s = getComputedStyle(document.documentElement);
      return { c: s.getPropertyValue('--cyan').trim().replace(/\s+/g, ','), v: s.getPropertyValue('--violet').trim().replace(/\s+/g, ',') };
    };
    let colors = rgb();
    const resize = () => { w = window.innerWidth; h = window.innerHeight; canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      const ox = mouse.x * 10, oy = mouse.y * 10;
      for (const p of pts) {
        if (motion === 'full') { p.x = (p.x + p.vx * dt + 1) % 1; p.y = (p.y + p.vy * dt + 1) % 1; }
        const x = p.x * w + ox * p.r, y = p.y * h + oy * p.r;
        ctx.fillStyle = `rgba(${p.hue > 0.7 ? colors.v : colors.c},${0.25 + p.r * 0.2})`;
        ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.lineWidth = 0.6;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = (pts[i].x - pts[j].x) * w, dy = (pts[i].y - pts[j].y) * h, d = Math.hypot(dx, dy);
        if (d < 130) { ctx.strokeStyle = `rgba(${colors.c},${(1 - d / 130) * 0.1})`; ctx.beginPath(); ctx.moveTo(pts[i].x * w, pts[i].y * h); ctx.lineTo(pts[j].x * w, pts[j].y * h); ctx.stroke(); }
      }
    };
    resize();
    let last = performance.now();
    const loop = (t: number) => { if (!running) return; draw(Math.min(64, t - last)); last = t; raf = requestAnimationFrame(loop); };
    if (motion === 'off') { canvas.style.display = 'none'; return; }
    canvas.style.display = '';
    if (motion === 'full') raf = requestAnimationFrame(loop); else draw(0);
    const onMove = (e: MouseEvent) => { mouse.x = e.clientX / w - 0.5; mouse.y = e.clientY / h - 0.5; };
    const onVis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (motion === 'full' && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); } };
    const onTheme = new MutationObserver(() => { colors = rgb(); if (motion !== 'full') draw(0); });
    onTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', resize);
    if (motion === 'full') window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    return () => { running = false; cancelAnimationFrame(raf); onTheme.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('mousemove', onMove); document.removeEventListener('visibilitychange', onVis); };
  }, [motion]);

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden>
      <div className="absolute inset-0 bg-aurora" />
      <div className="absolute inset-0 bg-grid" />
      <canvas ref={ref} className="absolute inset-0" />
    </div>
  );
}
