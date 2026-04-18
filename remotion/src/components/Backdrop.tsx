import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { palette } from "../theme";

// Persistent layered background — subtle drifting gradient + grain
export const Backdrop: React.FC<{ tone?: "dark" | "light" }> = ({ tone = "dark" }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 720], [0, 40]);
  const hue = interpolate(frame, [0, 720], [0, 8]);

  const isDark = tone === "dark";
  const bg = isDark ? palette.ink : palette.paper;
  const glow1 = isDark ? `${palette.primary}55` : `${palette.primary}22`;
  const glow2 = isDark ? `${palette.accent}33` : `${palette.accent}1A`;

  return (
    <AbsoluteFill style={{ backgroundColor: bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          left: -300 + drift,
          top: -400 - drift / 2,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${glow1} 0%, transparent 60%)`,
          filter: "blur(40px)",
          transform: `rotate(${hue}deg)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          right: -200 - drift,
          bottom: -300 + drift / 3,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${glow2} 0%, transparent 65%)`,
          filter: "blur(50px)",
        }}
      />
      {/* faint grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${isDark ? "#ffffff08" : "#00000008"} 1px, transparent 1px), linear-gradient(90deg, ${isDark ? "#ffffff08" : "#00000008"} 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          opacity: 0.6,
        }}
      />
    </AbsoluteFill>
  );
};
