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

// Scene 2 — Resume Builder. Cursor moves to "Enhance with AI" button, clicks,
// AI bullet rewrites in place, then camera zooms in on the rewritten bullet.
export const SceneResumeBuilder: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const browserEnter = spring({ frame, fps, config: { damping: 22, stiffness: 90 } });
  const captionEnter = spring({ frame: frame - 8, fps, config: { damping: 22 } });

  // Cursor path: enter from left, glide to Enhance button (inner ~ x=1180, y=470)
  // Browser offset: x=160, y=120 (70 + 50 chrome)
  const btnX = 160 + 1180;
  const btnY = 120 + 470;

  const cursor = cursorPath(frame, [
    { f: 0, x: 200, y: 800 },
    { f: 30, x: btnX + 80, y: btnY + 18 }, // approach
    { f: 55, x: btnX + 80, y: btnY + 18 },
    { f: 75, x: btnX + 80, y: btnY + 18 }, // click
  ]);
  const clicking = frame >= 70 && frame <= 85;
  const ripple = interpolate(frame, [75, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Spotlight on Enhance button before click
  const spotOp = interpolate(frame, [40, 55, 95, 105], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Camera: hold wide, then push in on the bullet after click (frames 100-150)
  const camScale = interpolate(frame, [0, 100, 145], [1, 1, 1.45], {
    extrapolateRight: "clamp",
    easing: easeInOut,
  });
  const camX = interpolate(frame, [0, 100, 145], [0, 0, 280], { extrapolateRight: "clamp", easing: easeInOut });
  const camY = interpolate(frame, [0, 100, 145], [0, 0, -40], { extrapolateRight: "clamp", easing: easeInOut });

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
          <span style={{ color: palette.accent }}>02</span>  ·  Rewrite any bullet with AI
        </div>
      </Sequence>

      <div
        style={{
          transform: `translate(${-camX}px, ${-camY}px) scale(${camScale * browserEnter})`,
          transformOrigin: "center center",
        }}
      >
        <BrowserFrame url="resumepreps.com/resume-builder">
          <div style={{ display: "flex", height: "100%" }}>
            <AppSidebar active="resume" />
            <ResumeBuilderMain clickFrame={75} />
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
        <Spotlight x={btnX} y={btnY} w={170} h={42} opacity={spotOp} color={palette.accent} />
        <ClickRipple x={cursor.x} y={cursor.y} progress={ripple} />
        <Cursor x={cursor.x} y={cursor.y} clicking={clicking} />
      </div>
    </AbsoluteFill>
  );
};

const ResumeBuilderMain: React.FC<{ clickFrame: number }> = ({ clickFrame }) => {
  const frame = useCurrentFrame();

  // Bullet rewrite — typewriter after click
  const before = "• Worked on the website and helped with sales emails";
  const after =
    "• Shipped 12 conversion-focused landing page tests, lifting paid signups +34% QoQ and reducing CAC by $18";

  const swapped = frame > clickFrame + 10;
  const charCount = swapped
    ? Math.min(after.length, Math.floor(((frame - (clickFrame + 10)) / 60) * after.length))
    : before.length;
  const text = swapped ? after.slice(0, charCount) : before;

  // Sparkle particles burst at click
  const burst = interpolate(frame, [clickFrame, clickFrame + 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ flex: 1, padding: "44px 60px", color: palette.ink, display: "flex", gap: 40 }}>
      {/* Left: form */}
      <div style={{ flex: 1.1 }}>
        <div style={{ fontSize: 14, color: palette.mute, letterSpacing: 1, textTransform: "uppercase" }}>
          Experience · Marketing Lead
        </div>
        <div style={{ fontFamily: serifFont.fontFamily, fontSize: 40, fontWeight: 800, letterSpacing: -1, marginTop: 6, marginBottom: 28 }}>
          Acme Co. · 2021–Present
        </div>

        <div
          style={{
            background: "white",
            border: "1px solid #E6E1D4",
            borderRadius: 16,
            padding: "26px 28px",
            boxShadow: "0 6px 18px rgba(11,15,25,0.04)",
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1.5,
              color: palette.mute,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Bullet point
          </div>
          <div
            style={{
              fontSize: 20,
              lineHeight: 1.5,
              color: swapped ? palette.ink : "#6B7280",
              fontWeight: swapped ? 600 : 400,
              minHeight: 90,
            }}
          >
            {text}
            {swapped && charCount < after.length && (
              <span style={{ borderRight: `2px solid ${palette.accent}`, marginLeft: 1 }}>&nbsp;</span>
            )}
          </div>

          {/* Sparkle burst overlay during rewrite */}
          {burst > 0 && burst < 1 && (
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {Array.from({ length: 12 }).map((_, i) => {
                const angle = (i / 12) * Math.PI * 2;
                const dist = burst * 80;
                const x = 600 + Math.cos(angle) * dist;
                const y = 80 + Math.sin(angle) * dist;
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: x,
                      top: y,
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: palette.accent,
                      opacity: 1 - burst,
                      boxShadow: `0 0 12px ${palette.accent}`,
                    }}
                  />
                );
              })}
            </div>
          )}

          <div
            style={{
              position: "absolute",
              right: 24,
              bottom: 22,
              display: "flex",
              gap: 10,
            }}
          >
            <div
              style={{
                background: palette.accent,
                color: "white",
                padding: "10px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: `0 8px 20px ${palette.accent}55`,
              }}
            >
              ✨ Enhance with AI
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 13, color: palette.mute }}>
          Tip: Quantify outcomes — numbers beat adjectives every time.
        </div>
      </div>

      {/* Right: mini resume preview */}
      <div
        style={{
          width: 360,
          background: "white",
          borderRadius: 12,
          border: "1px solid #E6E1D4",
          padding: 22,
          boxShadow: "0 8px 24px rgba(11,15,25,0.06)",
          color: palette.ink,
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontFamily: serifFont.fontFamily, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
          Alex Morgan
        </div>
        <div style={{ fontSize: 10, color: palette.mute, marginBottom: 14 }}>
          Marketing Lead · alex@email.com · linkedin.com/in/alex
        </div>
        <div style={{ height: 1, background: "#E6E1D4", margin: "8px 0 12px" }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
          Experience
        </div>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>Acme Co. — Marketing Lead</div>
        <div style={{ color: palette.mute, marginBottom: 6, fontSize: 10 }}>2021–Present</div>
        <div style={{ marginBottom: 4 }}>
          <span style={{ background: swapped ? "#FFF3E0" : "transparent", padding: "1px 3px", borderRadius: 3 }}>
            {swapped ? after.slice(0, charCount) : before}
          </span>
        </div>
        <div>• Led brand redesign across web, email, and social</div>
        <div>• Hired and managed 3 contractors and 1 agency</div>

        <div style={{ height: 1, background: "#E6E1D4", margin: "14px 0 10px" }} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
          Skills
        </div>
        <div style={{ color: palette.mute }}>SEO · Paid Acquisition · Lifecycle · Analytics · Figma</div>
      </div>
    </div>
  );
};
