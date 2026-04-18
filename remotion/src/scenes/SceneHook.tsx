import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from "remotion";
import { palette, interFont, serifFont } from "../theme";

// Scene 1 — The Pain Hook: "5 tabs. 5 tools. 5 hours wasted."
export const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tabs = ["Resume.io", "Zety", "Teal", "LinkedIn", "Enhancv"];

  return (
    <AbsoluteFill style={{ fontFamily: interFont.fontFamily, color: palette.paper }}>
      {/* Floating browser tabs that stack chaotically */}
      {tabs.map((tab, i) => {
        const enter = spring({ frame: frame - i * 5, fps, config: { damping: 14, stiffness: 120 } });
        const wiggle = Math.sin((frame - i * 8) / 14) * 4;
        const exit = interpolate(frame, [80, 110], [1, 0], { extrapolateRight: "clamp" });
        const opacity = enter * exit;
        const xBase = 220 + i * 110;
        const yBase = 180 + i * 60;
        const rot = (i - 2) * 4 + wiggle * 0.3;
        return (
          <div
            key={tab}
            style={{
              position: "absolute",
              left: xBase,
              top: yBase + (1 - enter) * 40,
              width: 360,
              height: 220,
              background: palette.line,
              border: `1px solid #2A3146`,
              borderRadius: 12,
              transform: `rotate(${rot}deg)`,
              opacity,
              boxShadow: "0 30px 60px rgba(0,0,0,0.4)",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
              <div style={{ marginLeft: 10, fontSize: 13, color: palette.mute }}>{tab}</div>
            </div>
            <div style={{ height: 8, background: "#2A3146", borderRadius: 4, marginTop: 14, width: "70%" }} />
            <div style={{ height: 8, background: "#2A3146", borderRadius: 4, width: "85%" }} />
            <div style={{ height: 8, background: "#2A3146", borderRadius: 4, width: "55%" }} />
            <div style={{ height: 8, background: "#2A3146", borderRadius: 4, width: "78%" }} />
          </div>
        );
      })}

      {/* Punch headline appears as tabs settle */}
      <Sequence from={40}>
        <HookHeadline />
      </Sequence>
    </AbsoluteFill>
  );
};

const HookHeadline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 140 } });
  const exit = interpolate(frame, [60, 80], [1, 0], { extrapolateRight: "clamp" });
  const blur = interpolate(enter, [0, 1], [12, 0]);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 120 }}>
      <div
        style={{
          fontFamily: serifFont.fontFamily,
          fontSize: 140,
          fontWeight: 800,
          letterSpacing: -3,
          lineHeight: 0.95,
          color: palette.paper,
          textAlign: "center",
          opacity: enter * exit,
          filter: `blur(${blur}px)`,
          textShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        Job hunting is <span style={{ color: palette.accent, fontStyle: "italic" }}>broken.</span>
      </div>
    </AbsoluteFill>
  );
};
