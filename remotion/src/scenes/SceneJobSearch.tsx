import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import { palette, interFont, serifFont } from "../theme";
import { BrowserFrame, AppSidebar } from "../components/BrowserFrame";
import { Cursor, ClickRipple, Spotlight, cursorPath, easeInOut } from "../components/Cursor";

// Scene 4 — Job Search. Cursor clicks "Find jobs", cards stream in, then
// cursor hovers + clicks "Apply" on the top card. Camera tilts/pans across results.
export const SceneJobSearch: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const browserEnter = spring({ frame, fps, config: { damping: 22, stiffness: 90 } });
  const captionEnter = spring({ frame: frame - 8, fps, config: { damping: 22 } });

  // First click: Find jobs button, inner ~ (1320, 200), browser (160,120)
  const findX = 160 + 1320;
  const findY = 120 + 200;

  // Second click: Apply on top card, inner ~ (1380, 360)
  const applyX = 160 + 1380;
  const applyY = 120 + 360;

  const cursor = cursorPath(frame, [
    { f: 0, x: 200, y: 800 },
    { f: 25, x: findX + 60, y: findY + 22 },
    { f: 45, x: findX + 60, y: findY + 22 }, // click 1
    { f: 95, x: applyX + 50, y: applyY + 22 }, // travel to apply
    { f: 125, x: applyX + 50, y: applyY + 22 }, // click 2
  ]);
  const clicking = (frame >= 42 && frame <= 55) || (frame >= 122 && frame <= 135);
  const ripple1 = interpolate(frame, [45, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ripple2 = interpolate(frame, [125, 150], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Spotlights
  const spotFind = interpolate(frame, [15, 28, 60, 70], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const spotApply = interpolate(frame, [100, 115, 145, 155], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Camera: gentle pan-down to follow result cards as they stream in (60-100), then push toward Apply
  const camScale = interpolate(frame, [0, 60, 110, 150], [1, 1, 1.1, 1.3], {
    extrapolateRight: "clamp",
    easing: easeInOut,
  });
  const camX = interpolate(frame, [0, 60, 110, 150], [0, 0, 80, 320], { extrapolateRight: "clamp", easing: easeInOut });
  const camY = interpolate(frame, [0, 60, 110, 150], [0, 0, 40, 60], { extrapolateRight: "clamp", easing: easeInOut });

  return (
    <AbsoluteFill
      style={{
        background: palette.ink,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: interFont.fontFamily,
      }}
    >
      <Sequence from={5} durationInFrames={170}>
        <div
          style={{
            position: "absolute",
            top: 30,
            left: 0,
            right: 0,
            textAlign: "center",
            color: palette.paper,
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            fontWeight: 600,
            opacity: captionEnter,
          }}
        >
          <span style={{ color: palette.accent }}>04</span>  ·  Find &amp; apply in one click
        </div>
      </Sequence>

      <div
        style={{
          transform: `translate(${-camX}px, ${-camY}px) scale(${camScale * browserEnter})`,
          transformOrigin: "center center",
        }}
      >
        <BrowserFrame url="resumepreps.com/job-search">
          <div style={{ display: "flex", height: "100%" }}>
            <AppSidebar active="jobs" />
            <JobsMain searchClickFrame={45} />
          </div>
        </BrowserFrame>
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${-camX}px, ${-camY}px) scale(${camScale * browserEnter})`,
          transformOrigin: "center center",
          pointerEvents: "none",
        }}
      >
        <Spotlight x={findX} y={findY} w={140} h={48} opacity={spotFind} color={palette.primary} />
        <Spotlight x={applyX} y={applyY} w={120} h={42} opacity={spotApply} color={palette.accent} />
        <ClickRipple x={cursor.x} y={cursor.y} progress={ripple1} />
        <ClickRipple x={cursor.x} y={cursor.y} progress={ripple2} />
        <Cursor x={cursor.x} y={cursor.y} clicking={clicking} />
      </div>
    </AbsoluteFill>
  );
};

const jobs = [
  { title: "Senior Marketing Manager", company: "Stripe", loc: "Remote · US", match: 96, salary: "$180k–220k" },
  { title: "Growth Lead", company: "Linear", loc: "Remote · Worldwide", match: 92, salary: "$160k–200k" },
  { title: "Head of Lifecycle", company: "Vercel", loc: "Remote · US/EU", match: 89, salary: "$170k–210k" },
  { title: "Product Marketing Lead", company: "Notion", loc: "San Francisco", match: 85, salary: "$150k–190k" },
];

const JobsMain: React.FC<{ searchClickFrame: number }> = ({ searchClickFrame }) => {
  const frame = useCurrentFrame();

  return (
    <div style={{ flex: 1, padding: "40px 56px", color: palette.ink }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 13, color: palette.mute, letterSpacing: 1, textTransform: "uppercase" }}>
            Job Search
          </div>
          <div style={{ fontFamily: serifFont.fontFamily, fontSize: 38, fontWeight: 800, letterSpacing: -1 }}>
            Roles tailored to your resume
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div
        style={{
          background: "white",
          border: "1px solid #E6E1D4",
          borderRadius: 14,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          boxShadow: "0 6px 18px rgba(11,15,25,0.04)",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 18 }}>🔍</div>
        <div
          style={{
            flex: 1,
            display: "flex",
            gap: 10,
          }}
        >
          <Pill>Marketing Lead</Pill>
          <Pill>Remote</Pill>
          <Pill>$150k+</Pill>
        </div>
        <div
          style={{
            background: palette.primary,
            color: "white",
            padding: "10px 22px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            boxShadow: `0 10px 22px ${palette.primary}55`,
          }}
        >
          Find jobs
        </div>
      </div>

      {/* Results stream in after Find click */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {jobs.map((j, i) => {
          const start = searchClickFrame + 8 + i * 8;
          const en = interpolate(frame - start, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const isTop = i === 0;
          // Top card "applied" state at frame 130+
          const applied = isTop && frame > 132;
          return (
            <div
              key={j.title}
              style={{
                background: "white",
                border: `1px solid ${isTop ? palette.accent + "55" : "#E6E1D4"}`,
                borderRadius: 14,
                padding: "18px 22px",
                display: "flex",
                alignItems: "center",
                gap: 18,
                opacity: en,
                transform: `translateY(${(1 - en) * 14}px)`,
                boxShadow: isTop ? "0 10px 22px rgba(11,15,25,0.06)" : "0 4px 12px rgba(11,15,25,0.03)",
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 12,
                  background: palette.ink,
                  color: palette.paper,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                {j.company[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
                  {j.title}  <span style={{ fontWeight: 500, color: palette.mute }}>· {j.company}</span>
                </div>
                <div style={{ fontSize: 13, color: palette.mute, marginTop: 3 }}>
                  {j.loc}  ·  {j.salary}
                </div>
              </div>
              <div
                style={{
                  background: "#22C55E1A",
                  color: "#16A34A",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "6px 12px",
                  borderRadius: 999,
                }}
              >
                {j.match}% match
              </div>
              <div
                style={{
                  background: applied ? "#22C55E" : palette.accent,
                  color: "white",
                  fontSize: 14,
                  fontWeight: 700,
                  padding: "10px 20px",
                  borderRadius: 10,
                  boxShadow: `0 8px 20px ${(applied ? "#22C55E" : palette.accent)}55`,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {applied ? "✓ Applied" : "Apply"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      background: "#EFEAE0",
      color: palette.ink,
      padding: "6px 12px",
      borderRadius: 999,
      fontSize: 13,
      fontWeight: 500,
    }}
  >
    {children}
  </div>
);
