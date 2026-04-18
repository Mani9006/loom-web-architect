import React from "react";

// Apple-style cursor with subtle shadow, scales on click
export const Cursor: React.FC<{
  x: number;
  y: number;
  scale?: number;
  clicking?: boolean;
}> = ({ x, y, scale = 1, clicking = false }) => {
  const s = clicking ? scale * 0.85 : scale;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        transform: `translate(${x}px, ${y}px) scale(${s})`,
        pointerEvents: "none",
        zIndex: 1000,
        transformOrigin: "top left",
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.35))",
      }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path
          d="M5 3L5 24L11 19L14.5 27L18.5 25L15 17L23 17L5 3Z"
          fill="white"
          stroke="black"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

// Click ripple — expanding ring at click moment
export const ClickRipple: React.FC<{ x: number; y: number; progress: number }> = ({
  x,
  y,
  progress,
}) => {
  if (progress <= 0 || progress >= 1) return null;
  const size = 20 + progress * 80;
  const opacity = 1 - progress;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        border: "3px solid #3B5BFF",
        opacity,
        pointerEvents: "none",
        zIndex: 999,
        boxShadow: `0 0 30px rgba(59,91,255,${opacity * 0.6})`,
      }}
    />
  );
};

// Highlight halo around target element
export const Spotlight: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  color?: string;
}> = ({ x, y, w, h, opacity, color = "#3B5BFF" }) => {
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 6,
        top: y - 6,
        width: w + 12,
        height: h + 12,
        borderRadius: 16,
        border: `3px solid ${color}`,
        boxShadow: `0 0 0 6px ${color}33, 0 0 40px ${color}80`,
        opacity,
        pointerEvents: "none",
        zIndex: 998,
      }}
    />
  );
};

// Easing helper for cursor pathing
export const easeInOut = (t: number) => {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

// Move cursor between waypoints with ease
export const cursorPath = (
  frame: number,
  waypoints: { f: number; x: number; y: number }[]
): { x: number; y: number } => {
  if (frame <= waypoints[0].f) return { x: waypoints[0].x, y: waypoints[0].y };
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    if (frame >= a.f && frame <= b.f) {
      const t = (frame - a.f) / (b.f - a.f);
      const e = easeInOut(t);
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    }
  }
  const last = waypoints[waypoints.length - 1];
  return { x: last.x, y: last.y };
};
