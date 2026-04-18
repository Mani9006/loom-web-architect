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

// Scene 3 — ATS Checker. Cursor clicks "Run Check", score animates from 0 to 94,
// camera zooms into the score donut for a hero moment.
export const SceneATSChecker: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const browserEnter = spring({ frame, fps, config: { damping: 22, stiffness: 90 } });
  const captionEnter = spring({ frame: frame - 8, fps, config: { damping: 22 } });

  // Run Check button at inner (~700, ~440), browser offset (160, 120)
  const btnX = 160 + 700;
  const btnY = 120 + 460;

  const cursor = cursorPath(frame, [
    { f: 0, x: 1700, y: 200 },
    { f: 30, x: btnX + 90, y: btnY + 22 },
    { f: 55, x: btnX + 90, y: btnY + 22 },
  ]);
  const clicking = frame >= 50 && frame <= 65;
  const ripple = interpolate(frame, [55, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Spotlight before click
  const spotOp = interpolate(frame, [25, 40, 75, 85], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Camera: hold wide, then big zoom into score donut on right side
  // Donut center inner: x ~ 1240, y ~ 460. Browser offset (160,120) => canvas (1400, 580)
  const camScale = interpolate(frame, [0, 90, 150], [1, 1, 1.6], {
    extrapolateRight: "clamp",
    easing: easeInOut,
  });
  const camX = interpolate(frame, [0, 90, 150], [0, 0, -440], { extrapolateRight: "clamp", easing: easeInOut });
  const camY = interpolate(frame, [0, 90, 150], [0, 0, 60], { extrapolateRight: "clamp", easing: easeInOut });

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
          <span style={{ color: palette.accent }}>03</span>  ·  Beat the ATS — instantly
        </div>
      </Sequence>

      <div
        style={{
          transform: `translate(${-camX}px, ${-camY}px) scale(${camScale * browserEnter})`,
          transformOrigin: "center center",
        }}
      >
        <BrowserFrame url="resumepreps.com/ats-checker">
          <div style={{ display: "flex", height: "100%" }}>
            <AppSidebar active="ats" />
            <ATSMain clickFrame={55} />
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
        <Spotlight x={btnX} y={btnY} w={180} h={48} opacity={spotOp} color={palette.primary} />
        <ClickRipple x={cursor.x} y={cursor.y} progress={ripple} />
        <Cursor x={cursor.x} y={cursor.y} clicking={clicking} />
      </div>
    </AbsoluteFill>
  );
};

const ATSMain: React.FC<{ clickFrame: number }> = ({ clickFrame }) => {
  const frame = useCurrentFrame();
  const ran = frame > clickFrame + 5;
  const progress = ran
    ? interpolate(frame, [clickFrame + 5, clickFrame + 55], [0, 1], { extrapolateRight: "clamp" })
    : 0;
  const score = Math.floor(progress * 94);

  const radius = 110;
  const stroke = 18;
  const C = 2 * Math.PI * radius;

  const checks = [
    { label: "Keyword match", ok: progress > 0.3 },
    { label: "Format clean", ok: progress > 0.5 },
    { label: "Quantified wins", ok: progress > 0.7 },
    { label: "Action verbs", ok: progress > 0.9 },
  ];

  return (
    <div style={{ flex: 1, padding: "44px 60px", color: palette.ink, display: "flex", gap: 36 }}>
      {/* Left: JD paste box */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: palette.mute, letterSpacing: 1, textTransform: "uppercase" }}>
          ATS Compatibility Check
        </div>
        <div style={{ fontFamily: serifFont.fontFamily, fontSize: 38, fontWeight: 800, letterSpacing: -1, marginTop: 6, marginBottom: 22 }}>
          Paste a job description
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 14,
            border: "1px solid #E6E1D4",
            padding: 22,
            minHeight: 240,
            fontSize: 13,
            lineHeight: 1.6,
            color: palette.ink,
            boxShadow: "0 6px 18px rgba(11,15,25,0.04)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Senior Marketing Manager — Stripe</div>
          <div style={{ color: palette.mute }}>
            We're looking for a senior marketing manager to lead growth experiments across paid, lifecycle, and SEO.
            You'll partner with product to drive activation, run rigorous A/B tests, and own pipeline KPIs end-to-end.
          </div>
          <div style={{ marginTop: 14, color: palette.mute }}>
            Requirements: 5+ years B2B SaaS, SQL fluency, hands-on experience with paid acquisition, lifecycle email,
            and SEO content programs. Bonus: HubSpot, Looker, conversion rate optimization.
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              background: palette.primary,
              color: "white",
              padding: "13px 26px",
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              boxShadow: `0 12px 26px ${palette.primary}55`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            🎯 Run Check
          </div>
        </div>
      </div>

      {/* Right: result */}
      <div
        style={{
          width: 460,
          background: "white",
          borderRadius: 18,
          border: "1px solid #E6E1D4",
          padding: 30,
          boxShadow: "0 12px 30px rgba(11,15,25,0.06)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 1.5, color: palette.mute, textTransform: "uppercase" }}>
          Live ATS Score
        </div>

        <div style={{ position: "relative", width: 280, height: 280, marginTop: 14 }}>
          <svg width={280} height={280} viewBox="0 0 280 280">
            <circle cx={140} cy={140} r={radius} stroke="#EFEAE0" strokeWidth={stroke} fill="none" />
            <circle
              cx={140}
              cy={140}
              r={radius}
              stroke={palette.accent}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - (progress * 0.94))}
              transform="rotate(-90 140 140)"
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
            <div style={{ fontFamily: serifFont.fontFamily, fontSize: 88, fontWeight: 800, lineHeight: 1, letterSpacing: -3 }}>
              {score}
            </div>
            <div style={{ fontSize: 12, color: palette.mute, letterSpacing: 2, textTransform: "uppercase", marginTop: 4 }}>
              {progress >= 1 ? "Recruiter-Ready" : ran ? "Analyzing…" : "Press Run"}
            </div>
          </div>
        </div>

        <div style={{ width: "100%", marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {checks.map((c) => (
            <div
              key={c.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 14,
                color: c.ok ? palette.ink : palette.mute,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: c.ok ? "#22C55E" : "#E6E1D4",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {c.ok ? "✓" : ""}
              </div>
              {c.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
