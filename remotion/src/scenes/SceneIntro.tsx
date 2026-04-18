import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { palette, interFont, serifFont } from "../theme";
import { LogoMark } from "../components/Logo";

// Short intro card — brand reveal before the demo
export const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  const wordEnter = spring({ frame: frame - 12, fps, config: { damping: 22 } });
  const subEnter = spring({ frame: frame - 28, fps, config: { damping: 22 } });
  const lineEnter = interpolate(frame, [25, 50], [0, 1], { extrapolateRight: "clamp" });

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
      {/* Soft brand glow */}
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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          transform: `scale(${logoSpring})`,
        }}
      >
        <LogoMark size={110} color={palette.paper} accent={palette.accent} />
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: -3,
            opacity: wordEnter,
            transform: `translateX(${(1 - wordEnter) * -30}px)`,
          }}
        >
          Resume<span style={{ color: palette.primary }}>Preps</span>
        </div>
      </div>

      <div
        style={{
          height: 2,
          width: 500 * lineEnter,
          background: `linear-gradient(90deg, transparent, ${palette.accent}, transparent)`,
          marginTop: 36,
          marginBottom: 24,
        }}
      />

      <div
        style={{
          fontFamily: serifFont.fontFamily,
          fontStyle: "italic",
          fontSize: 42,
          color: palette.mute,
          opacity: subEnter,
          transform: `translateY(${(1 - subEnter) * 14}px)`,
        }}
      >
        Your entire job search, in one tab.
      </div>
    </AbsoluteFill>
  );
};
