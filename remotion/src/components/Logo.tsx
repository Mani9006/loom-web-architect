import React from "react";

export const LogoMark: React.FC<{ size?: number; color?: string; accent?: string }> = ({
  size = 80,
  color = "#F5F1E8",
  accent = "#3B5BFF",
}) => (
  <svg viewBox="0 0 40 40" width={size} height={size} fill="none">
    <rect x="6" y="4" width="22" height="28" rx="3" stroke={color} strokeWidth={2.5} />
    <line x1="11" y1="12" x2="23" y2="12" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <line x1="11" y1="17" x2="20" y2="17" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <line x1="11" y1="22" x2="17" y2="22" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <path d="M22 26L32 16" stroke={accent} strokeWidth={2.8} strokeLinecap="round" />
    <path d="M26 15H33V22" stroke={accent} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
