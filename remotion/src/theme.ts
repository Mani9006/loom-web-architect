// ResumePreps brand-aligned palette
export const palette = {
  ink: "#0B0F19",
  paper: "#F5F1E8",
  primary: "#3B5BFF",
  accent: "#FF7A45",
  violet: "#7C5CFF",
  mute: "#8A93A6",
  line: "#1B2030",
};

import { loadFont as loadDisplay } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/Fraunces";

export const interFont = loadDisplay("normal", {
  weights: ["400", "600", "800", "900"],
  subsets: ["latin"],
});

export const serifFont = loadSerif("normal", {
  weights: ["400", "600", "800"],
  subsets: ["latin"],
});
