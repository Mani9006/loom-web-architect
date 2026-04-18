import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import { SceneIntro } from "./scenes/SceneIntro";
import { SceneDashboard } from "./scenes/SceneDashboard";
import { SceneResumeBuilder } from "./scenes/SceneResumeBuilder";
import { SceneATSChecker } from "./scenes/SceneATSChecker";
import { SceneJobSearch } from "./scenes/SceneJobSearch";
import { SceneCTA } from "./scenes/SceneCTA";

// Total: 75 + 130 + 180 + 180 + 200 + 150 = 915 - (5 transitions × 18) = 825 frames ≈ 27.5s
export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0B0F19" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={75}>
          <SceneIntro />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 18 })}
        />

        <TransitionSeries.Sequence durationInFrames={130}>
          <SceneDashboard />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 18 })}
        />

        <TransitionSeries.Sequence durationInFrames={180}>
          <SceneResumeBuilder />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 18 })}
        />

        <TransitionSeries.Sequence durationInFrames={180}>
          <SceneATSChecker />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 18 })}
        />

        <TransitionSeries.Sequence durationInFrames={200}>
          <SceneJobSearch />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 18 })}
        />

        <TransitionSeries.Sequence durationInFrames={150}>
          <SceneCTA />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
