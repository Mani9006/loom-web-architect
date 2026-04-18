// ResumePreps brand-aligned palette — editorial, confident, premium
export const palette = {
  ink: "#0B0F19",       // deep ink background
  paper: "#F5F1E8",     // warm cream
  primary: "#3B5BFF",   // royal blue (brand primary)
  accent: "#FF7A45",    // warm coral accent
  violet: "#7C5CFF",    // soft violet
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
