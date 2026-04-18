import React from "react";
import { palette, interFont } from "../theme";
import { LogoMark } from "./Logo";

// Reusable browser chrome wrapping a 1600x900 inner viewport.
// We render the app at fixed inner coords so cursor math is deterministic.
export const BrowserFrame: React.FC<{
  url: string;
  children: React.ReactNode;
}> = ({ url, children }) => {
  return (
    <div
      style={{
        width: 1600,
        height: 950,
        background: "#1A1F2E",
        borderRadius: 18,
        overflow: "hidden",
        boxShadow:
          "0 60px 120px rgba(0,0,0,0.55), 0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        border: "1px solid #2A3146",
        fontFamily: interFont.fontFamily,
        position: "relative",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: 50,
          background: "#11151F",
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          gap: 14,
          borderBottom: "1px solid #1F2536",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#FF5F57" }} />
          <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#FEBC2E" }} />
          <div style={{ width: 13, height: 13, borderRadius: "50%", background: "#28C840" }} />
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#1F2536",
              color: "#9AA3B7",
              fontSize: 13,
              padding: "6px 22px",
              borderRadius: 8,
              minWidth: 460,
              textAlign: "center",
              border: "1px solid #2A3146",
            }}
          >
            🔒  {url}
          </div>
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* App body — 1600 x 900 inner area */}
      <div style={{ width: 1600, height: 900, background: palette.paper, position: "relative" }}>
        {children}
      </div>
    </div>
  );
};

// Sidebar nav used across simulated app
export const AppSidebar: React.FC<{ active: string }> = ({ active }) => {
  const items = [
    { id: "chat", label: "Chat", icon: "💬" },
    { id: "resume", label: "Resume Builder", icon: "📄" },
    { id: "ats", label: "ATS Checker", icon: "🎯" },
    { id: "cover", label: "Cover Letters", icon: "✉️" },
    { id: "jobs", label: "Job Search", icon: "🔍" },
    { id: "interview", label: "Interview Prep", icon: "🎤" },
  ];
  return (
    <div
      style={{
        width: 260,
        height: "100%",
        background: "#0B0F19",
        color: palette.paper,
        padding: "26px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        borderRight: "1px solid #1A1F2E",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, paddingLeft: 6 }}>
        <LogoMark size={32} color={palette.paper} accent={palette.accent} />
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>
          Resume<span style={{ color: palette.primary }}>Preps</span>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#5A6378", letterSpacing: 1.5, textTransform: "uppercase", padding: "10px 12px 6px" }}>
        Workspace
      </div>

      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <div
            key={it.id}
            data-nav={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 14px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? palette.paper : "#9AA3B7",
              background: isActive ? "#1A1F2E" : "transparent",
              border: isActive ? "1px solid #2A3146" : "1px solid transparent",
            }}
          >
            <span style={{ fontSize: 16 }}>{it.icon}</span>
            {it.label}
          </div>
        );
      })}
    </div>
  );
};
