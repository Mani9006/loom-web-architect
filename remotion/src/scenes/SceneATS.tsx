import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { palette, interFont, serifFont } from "../theme";

// Scene 5 — Live ATS score animation: dial + checklist
export const SceneATS: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scoreEnter = spring({ frame, fps, config: { damping: 16, stiffness: 100 } });
  const score = Math.floor(interpolate(frame, [10, 70], [0, 94], { extrapolateRight: "clamp" }));
  const arc = interpolate(frame, [10, 70], [0, 0.94], { extrapolateRight: "clamp" });

  const checks = ["Keyword match", "Format clean", "Skills aligned", "Quantified wins"];

  // Donut
  const radius = 220;
  const stroke = 30;
  const C = 2 * Math.PI * radius;

  return (
    <AbsoluteFill style={{ fontFamily: interFont.fontFamily, color: palette.paper, padding: 100 }}>
      <div style={{ display: "flex", alignItems: "center", height: "100%", gap: 120 }}>
        {/* Donut */}
        <div style={{ position: "relative", width: 540, height: 540, transform: `scale(${scoreEnter})` }}>
          <svg width={540} height={540} viewBox="0 0 540 540">
            <circle cx={270} cy={270} r={radius} stroke={palette.line} strokeWidth={stroke} fill="none" />
            <circle
              cx={270}
              cy={270}
              r={radius}
              stroke={palette.accent}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - arc)}
              transform="rotate(-90 270 270)"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontFamily: serifFont.fontFamily, fontSize: 200, fontWeight: 800, lineHeight: 1, letterSpacing: -6 }}>
              {score}
            </div>
            <div style={{ fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: palette.mute, marginTop: 8 }}>
              ATS Score
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ fontSize: 22, letterSpacing: 6, textTransform: "uppercase", color: palette.accent, marginBottom: 10 }}>
            Recruiter-Ready
          </div>
          {checks.map((c, i) => {
            const start = 30 + i * 12;
            const s = spring({ frame: frame - start, fps, config: { damping: 18 } });
            return (
              <div
                key={c}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  opacity: s,
                  transform: `translateX(${(1 - s) * -30}px)`,
                }}
              >
                <div
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 12,
                    background: palette.primary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                    fontWeight: 800,
                  }}
                >
                  ✓
                </div>
                <div style={{ fontSize: 44, fontWeight: 600 }}>{c}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
