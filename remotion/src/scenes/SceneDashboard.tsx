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

// Scene 1 — Open dashboard, hover & click "Resume Builder" in sidebar.
// Camera: starts wide, pushes in toward sidebar on click.
export const SceneDashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Cursor starts off-screen-right, glides to "Resume Builder" nav item, clicks
  const cursor = cursorPath(frame, [
    { f: 0, x: 1500, y: 700 },
    { f: 25, x: 240, y: 360 }, // hover sidebar
    { f: 55, x: 240, y: 360 }, // dwell
    { f: 70, x: 240, y: 360 }, // click moment
  ]);
  const clicking = frame >= 65 && frame <= 80;
  const ripple = interpolate(frame, [70, 95], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Spotlight on the "Resume Builder" sidebar item (rendered inside browser at inner x=20, y=348)
  const spotOp = interpolate(frame, [40, 55, 95, 105], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Camera: subtle push-in toward the sidebar item (which sits on left side of canvas).
  // Push the camera LEFT (negative X) so the left side of the frame moves into center.
  const camScale = interpolate(frame, [0, 50, 110], [1, 1, 1.25], {
    extrapolateRight: "clamp",
    easing: easeInOut,
  });
  const camX = interpolate(frame, [0, 50, 110], [0, 0, -380], { extrapolateRight: "clamp", easing: easeInOut });
  const camY = interpolate(frame, [0, 50, 110], [0, 0, -60], { extrapolateRight: "clamp", easing: easeInOut });

  // Caption
  const captionEnter = spring({ frame: frame - 8, fps, config: { damping: 22 } });

  // Browser entry
  const browserEnter = spring({ frame, fps, config: { damping: 22, stiffness: 90 } });

  // Inner-coords of nav item: sidebar starts at inner x=0, item at y≈348 within app body, item box ~ 224x44
  // Browser is centered on canvas (1920 - 1600)/2 = 160 horizontal, 70 vertical. Title bar 50px.
  // So absolute spotlight: x = 160 + 18, y = 70 + 50 + 348
  const spotX = 160 + 18;
  const spotY = 70 + 50 + 348;

  return (
    <AbsoluteFill
      style={{
        background: palette.ink,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: interFont.fontFamily,
      }}
    >
      {/* Caption above browser */}
      <Sequence from={5} durationInFrames={120}>
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
          <span style={{ color: palette.accent }}>01</span>  ·  One workspace for your job hunt
        </div>
      </Sequence>

      {/* Camera-transformed browser */}
      <div
        style={{
          transform: `translate(${-camX}px, ${-camY}px) scale(${camScale * browserEnter})`,
          transformOrigin: "center center",
        }}
      >
        <BrowserFrame url="resumepreps.com/dashboard">
          <div style={{ display: "flex", height: "100%" }}>
            <AppSidebar active="chat" />
            <DashboardMain />
          </div>
        </BrowserFrame>
      </div>

      {/* Overlay spotlight + cursor (above camera transform so they sit at canvas coords pre-transform).
          We render inside the camera transform group instead so they move with content. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${-camX}px, ${-camY}px) scale(${camScale * browserEnter})`,
          transformOrigin: "center center",
          pointerEvents: "none",
        }}
      >
        {/* The spotlight + cursor positions are in the same canvas coordinate space as the browser */}
        <Spotlight x={spotX} y={spotY} w={224} h={44} opacity={spotOp} />
        <ClickRipple x={cursor.x} y={cursor.y} progress={ripple} />
        <Cursor x={cursor.x} y={cursor.y} clicking={clicking} />
      </div>
    </AbsoluteFill>
  );
};

const DashboardMain: React.FC = () => {
  const frame = useCurrentFrame();
  const tiles = [
    { t: "Build Resume", d: "AI-tailored to any role", c: palette.primary },
    { t: "ATS Checker", d: "Score before you apply", c: palette.accent },
    { t: "Cover Letter", d: "Drafted in seconds", c: "#7C5CFF" },
    { t: "Interview Prep", d: "Practice live with AI", c: "#22C55E" },
  ];
  return (
    <div style={{ flex: 1, padding: "60px 70px", color: palette.ink }}>
      <div style={{ fontSize: 16, color: palette.mute, marginBottom: 8 }}>Welcome back, Alex</div>
      <div style={{ fontFamily: serifFont.fontFamily, fontSize: 56, fontWeight: 800, letterSpacing: -1.5, marginBottom: 40 }}>
        How can I help today?
      </div>

      <div
        style={{
          background: "white",
          borderRadius: 20,
          border: "1px solid #E6E1D4",
          padding: "22px 26px",
          fontSize: 18,
          color: palette.mute,
          marginBottom: 50,
          boxShadow: "0 8px 24px rgba(11,15,25,0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>Ask about resumes, jobs, interviews…</span>
        <div
          style={{
            background: palette.ink,
            color: palette.paper,
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          ↑
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {tiles.map((t, i) => {
          const en = interpolate(frame - 20 - i * 5, [0, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={t.t}
              style={{
                background: "white",
                border: "1px solid #E6E1D4",
                borderRadius: 18,
                padding: "26px 28px",
                opacity: en,
                transform: `translateY(${(1 - en) * 14}px)`,
                boxShadow: "0 6px 18px rgba(11,15,25,0.04)",
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: `${t.c}1A`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ width: 16, height: 16, borderRadius: 4, background: t.c }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>{t.t}</div>
                <div style={{ fontSize: 14, color: palette.mute, marginTop: 2 }}>{t.d}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
