import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { palette, interFont, serifFont } from "../theme";

// Scene 2 — The stat reveal
export const SceneProblem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelEnter = spring({ frame, fps, config: { damping: 20 } });
  const counter = Math.min(75, Math.floor(interpolate(frame, [10, 60], [0, 75], { extrapolateRight: "clamp" })));
  const lineWidth = interpolate(frame, [50, 90], [0, 700], { extrapolateRight: "clamp" });
  const subEnter = spring({ frame: frame - 70, fps, config: { damping: 22 } });

  return (
    <AbsoluteFill style={{ fontFamily: interFont.fontFamily, color: palette.paper, padding: "120px 160px", justifyContent: "center" }}>
      <div
        style={{
          fontSize: 22,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: palette.accent,
          opacity: labelEnter,
          marginBottom: 30,
          transform: `translateX(${(1 - labelEnter) * -20}px)`,
        }}
      >
        ATS Reality Check
      </div>

      <div
        style={{
          fontFamily: serifFont.fontFamily,
          fontSize: 320,
          fontWeight: 800,
          lineHeight: 0.9,
          letterSpacing: -10,
          color: palette.paper,
          display: "flex",
          alignItems: "baseline",
          gap: 20,
        }}
      >
        <span>{counter}</span>
        <span style={{ fontSize: 120, color: palette.accent }}>%</span>
      </div>

      <div
        style={{
          height: 4,
          width: lineWidth,
          background: palette.accent,
          marginTop: 20,
          marginBottom: 36,
          borderRadius: 2,
        }}
      />

      <div
        style={{
          fontSize: 38,
          fontWeight: 600,
          maxWidth: 1100,
          lineHeight: 1.2,
          opacity: subEnter,
          transform: `translateY(${(1 - subEnter) * 20}px)`,
          color: palette.paper,
        }}
      >
        of resumes are filtered out by ATS bots — <span style={{ color: palette.mute }}>before a human ever reads them.</span>
      </div>
    </AbsoluteFill>
  );
};
