import { useEffect, useRef } from "react";

export default function NetworkBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const N = 70,
      MAX_DIST = 160,
      SPEED = 0.32;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rgb = "21,101,192";
    let particles = [];
    let animFrameId;

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    function init() {
      resize();
      particles = [];
      for (let i = 0; i < N; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * SPEED * 2,
          vy: (Math.random() * 0.7 - 0.55) * SPEED * 2,
          pulse: 0,
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // draw lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX_DIST) {
            ctx.strokeStyle = `rgba(${rgb},${(1 - d / MAX_DIST) * 0.16})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      // draw dots
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const pulse = p.pulse || 0;
        ctx.fillStyle = `rgba(${rgb},${0.32 + pulse * 0.55})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.0 + pulse * 2.5, 0, Math.PI * 2);
        ctx.fill();
        if (pulse > 0) p.pulse = Math.max(0, pulse - 0.006);
      }
      if (!reduced) {
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
          if (p.y < -10) {
            p.y = canvas.height + 5;
            p.x = Math.random() * canvas.width;
          }
          if (p.y > canvas.height + 10) p.vy *= -1;
        }
        animFrameId = requestAnimationFrame(draw);
      }
    }

    init();
    draw();

    const pulseInterval = !reduced
      ? setInterval(() => {
          if (particles.length > 0) {
            const idx = Math.floor(Math.random() * particles.length);
            particles[idx].pulse = 1;
          }
        }, 2800)
      : null;

    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animFrameId);
      if (pulseInterval !== null) clearInterval(pulseInterval);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
