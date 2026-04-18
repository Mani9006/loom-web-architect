import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

// 24s @ 30fps = 720 frames. TransitionSeries overlaps subtract; we add slack.
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="main"
      component={MainVideo}
      durationInFrames={720}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
