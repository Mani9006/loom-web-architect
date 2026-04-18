import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from "remotion";
import { palette, interFont, serifFont } from "../theme";
import { LogoMark } from "../components/Logo";

// Scene 3 — Brand reveal + product tagline
export const SceneSolution: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({ frame, fps, config: { damping: 14, stiffness: 110 } });
  const wordmarkEnter = spring({ frame: frame - 18, fps, config: { damping: 20 } });
  const lineEnter = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ fontFamily: interFont.fontFamily, color: palette.paper, alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          transform: `scale(${logoSpring})`,
        }}
      >
        <LogoMark size={140} color={palette.paper} accent={palette.accent} />
        <div
          style={{
            fontSize: 110,
            fontWeight: 800,
            letterSpacing: -3,
            opacity: wordmarkEnter,
            transform: `translateX(${(1 - wordmarkEnter) * -30}px)`,
          }}
        >
          Resume<span style={{ color: palette.primary }}>Preps</span>
        </div>
      </div>

      <div
        style={{
          height: 2,
          width: 600 * lineEnter,
          background: `linear-gradient(90deg, transparent, ${palette.accent}, transparent)`,
          marginTop: 50,
          marginBottom: 36,
        }}
      />

      <Sequence from={50}>
        <Tagline />
      </Sequence>
    </AbsoluteFill>
  );
};

const Tagline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 24 } });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 240,
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily: serifFont.fontFamily,
        fontStyle: "italic",
        fontSize: 56,
        fontWeight: 400,
        color: palette.mute,
        opacity: enter,
        transform: `translateY(${(1 - enter) * 14}px)`,
      }}
    >
      Your entire career, in one tab.
    </div>
  );
};
