import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { palette, interFont, serifFont } from "../theme";
import { LogoMark } from "../components/Logo";

// Outro CTA
export const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headEnter = spring({ frame, fps, config: { damping: 22 } });
  const subEnter = spring({ frame: frame - 25, fps, config: { damping: 22 } });
  const urlEnter = spring({ frame: frame - 55, fps, config: { damping: 18 } });
  const logoEnter = spring({ frame: frame - 10, fps, config: { damping: 20 } });

  const pulse = 1 + Math.sin(frame / 12) * 0.02;

  return (
    <AbsoluteFill
      style={{
        background: palette.ink,
        color: palette.paper,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: interFont.fontFamily,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${palette.primary}40 0%, transparent 60%)`,
          filter: "blur(50px)",
          left: -300,
          top: -400,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1100,
          height: 1100,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${palette.accent}30 0%, transparent 65%)`,
          filter: "blur(50px)",
          right: -200,
          bottom: -300,
        }}
      />

      <div style={{ opacity: logoEnter, transform: `scale(${logoEnter})`, marginBottom: 40 }}>
        <LogoMark size={100} color={palette.paper} accent={palette.accent} />
      </div>

      <div
        style={{
          fontFamily: serifFont.fontFamily,
          fontSize: 130,
          fontWeight: 800,
          letterSpacing: -4,
          textAlign: "center",
          lineHeight: 1,
          opacity: headEnter,
          transform: `translateY(${(1 - headEnter) * 30}px)`,
        }}
      >
        Land the <span style={{ fontStyle: "italic", color: palette.accent }}>interview.</span>
      </div>

      <div
        style={{
          fontSize: 32,
          fontWeight: 500,
          color: palette.mute,
          marginTop: 36,
          maxWidth: 1100,
          textAlign: "center",
          opacity: subEnter,
          transform: `translateY(${(1 - subEnter) * 20}px)`,
        }}
      >
        AI résumé · ATS scoring · cover letters · job search · interview prep
      </div>

      <div
        style={{
          marginTop: 56,
          display: "flex",
          alignItems: "center",
          gap: 22,
          opacity: urlEnter,
          transform: `scale(${pulse})`,
        }}
      >
        <div
          style={{
            background: palette.accent,
            color: palette.ink,
            padding: "26px 56px",
            borderRadius: 999,
            fontSize: 38,
            fontWeight: 800,
            letterSpacing: -0.5,
            boxShadow: `0 20px 60px ${palette.accent}60`,
          }}
        >
          resumepreps.com
        </div>
      </div>
    </AbsoluteFill>
  );
};
