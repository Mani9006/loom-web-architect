import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { palette, interFont } from "../theme";

const features = [
  { label: "AI Resume Builder", num: "01", color: palette.primary },
  { label: "ATS Score Checker", num: "02", color: palette.accent },
  { label: "Cover Letter Studio", num: "03", color: palette.violet },
  { label: "Mock Interview AI", num: "04", color: palette.primary },
  { label: "Job Tracker", num: "05", color: palette.accent },
];

export const SceneFeatures: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerEnter = spring({ frame, fps, config: { damping: 22 } });

  return (
    <AbsoluteFill style={{ fontFamily: interFont.fontFamily, color: palette.ink, padding: "100px 140px" }}>
      <div
        style={{
          fontSize: 22,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: palette.primary,
          fontWeight: 600,
          opacity: headerEnter,
        }}
      >
        Career OS — Five Tools, One Flow
      </div>

      <div style={{ marginTop: 60, display: "flex", flexDirection: "column", gap: 18 }}>
        {features.map((f, i) => {
          const start = 12 + i * 8;
          const s = spring({ frame: frame - start, fps, config: { damping: 18, stiffness: 130 } });
          const lineW = interpolate(frame - start, [10, 40], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={f.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 36,
                opacity: s,
                transform: `translateX(${(1 - s) * -50}px)`,
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  color: palette.mute,
                  fontVariantNumeric: "tabular-nums",
                  width: 80,
                }}
              >
                {f.num}
              </div>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: f.color,
                  boxShadow: `0 0 30px ${f.color}80`,
                }}
              />
              <div
                style={{
                  fontSize: 76,
                  fontWeight: 800,
                  letterSpacing: -2,
                  color: palette.ink,
                }}
              >
                {f.label}
              </div>
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: palette.ink,
                  opacity: 0.15,
                  transformOrigin: "left",
                  transform: `scaleX(${lineW})`,
                  marginLeft: 30,
                }}
              />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
