/**
 * ResumePreps custom icon pack sprite (rp-*).
 * Mount once at the app root. Each <RPIcon name="..."/> renders via <use href="#rp-name"/>.
 *
 * Duotone: .fill elements paint the tinted shape (currentColor at 12% alpha),
 * .stroke elements paint the outline (currentColor at brand stroke width).
 */
export function RPIconSprite() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <style>{`
          .rp-icon .fill { fill: currentColor; fill-opacity: 0.12; }
          .rp-icon .stroke { fill: none; stroke: currentColor; stroke-width: var(--rp-sw, 1.75); stroke-linecap: round; stroke-linejoin: round; }
          .rp-icon--filled .fill { fill-opacity: 1; }
          .rp-icon--filled .stroke { stroke: none; }
        `}</style>
      </defs>

      <symbol id="rp-home" viewBox="0 0 24 24">
        <path className="fill" d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
        <path className="stroke" d="M4 11 12 4l8 7M5 10v9a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1v-9" />
      </symbol>

      <symbol id="rp-search" viewBox="0 0 24 24">
        <circle className="fill" cx="11" cy="11" r="7" />
        <circle className="stroke" cx="11" cy="11" r="7" />
        <path className="stroke" d="m16.5 16.5 4 4M8 9a3 3 0 0 1 3-3" />
      </symbol>

      <symbol id="rp-resume" viewBox="0 0 24 24">
        <path className="fill" d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path className="stroke" d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V7z" />
        <path className="stroke" d="M14 3v4h4M8 12h6M8 16h4" />
        <circle className="stroke" cx="8.5" cy="9" r=".5" />
      </symbol>

      <symbol id="rp-score" viewBox="0 0 24 24">
        <path className="fill" d="M4 14a8 8 0 0 1 16 0v2H4z" />
        <path className="stroke" d="M4 16a8 8 0 0 1 16 0" />
        <path className="stroke" d="M12 16 15 9" />
        <circle className="stroke" cx="12" cy="16" r="1.25" />
      </symbol>

      <symbol id="rp-pipeline" viewBox="0 0 24 24">
        <rect className="fill" x="4" y="5" width="4" height="14" rx="1" />
        <rect className="fill" x="14" y="5" width="6" height="9" rx="1" />
        <rect className="stroke" x="4" y="5" width="4" height="14" rx="1" />
        <rect className="stroke" x="10" y="5" width="4" height="11" rx="1" />
        <rect className="stroke" x="16" y="5" width="4" height="7" rx="1" />
      </symbol>

      <symbol id="rp-letter" viewBox="0 0 24 24">
        <rect className="fill" x="3" y="6" width="18" height="13" rx="2" />
        <rect className="stroke" x="3" y="6" width="18" height="13" rx="2" />
        <path className="stroke" d="m3.5 7 8.5 7 8.5-7" />
        <path className="stroke" d="M15 4h4v4" />
      </symbol>

      <symbol id="rp-interview" viewBox="0 0 24 24">
        <rect className="fill" x="9" y="3" width="6" height="11" rx="3" />
        <rect className="stroke" x="9" y="3" width="6" height="11" rx="3" />
        <path className="stroke" d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
      </symbol>

      <symbol id="rp-chat" viewBox="0 0 24 24">
        <path className="fill" d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
        <path className="stroke" d="M21 15a1 1 0 0 1-1 1h-9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1z" />
        <path className="stroke" d="m13 9 1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
      </symbol>

      <symbol id="rp-tailor" viewBox="0 0 24 24">
        <path className="fill" d="m14 4 6 6-11 11-6-6z" />
        <path className="stroke" d="m14 4 6 6-11 11-6-6z" />
        <path className="stroke" d="m13 7 4 4M19 3v2M22 6h-2M20.5 4.5 19 6" />
      </symbol>

      <symbol id="rp-pitch" viewBox="0 0 24 24">
        <path className="fill" d="M21 3 3 10l7 3z" />
        <path className="stroke" d="M21 3 3 10l7 3 3 7z" />
        <path className="stroke" d="m21 3-11 10" />
      </symbol>

      <symbol id="rp-trophy" viewBox="0 0 24 24">
        <path className="fill" d="M7 4h10v5a5 5 0 0 1-10 0z" />
        <path className="stroke" d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H5a2 2 0 0 0 0 4h2M17 6h2a2 2 0 0 1 0 4h-2M9 14h6l-1 4h-4zM8 20h8" />
      </symbol>

      <symbol id="rp-bookmark" viewBox="0 0 24 24">
        <path className="fill" d="M6 3h12v18l-6-4-6 4z" />
        <path className="stroke" d="M6 3h12v18l-6-4-6 4z" />
      </symbol>

      <symbol id="rp-applied" viewBox="0 0 24 24">
        <circle className="fill" cx="12" cy="12" r="9" />
        <circle className="stroke" cx="12" cy="12" r="9" />
        <path className="stroke" d="m8 12 3 3 5-6" />
      </symbol>

      <symbol id="rp-reject" viewBox="0 0 24 24">
        <circle className="fill" cx="12" cy="12" r="9" />
        <circle className="stroke" cx="12" cy="12" r="9" />
        <path className="stroke" d="m9 9 6 6M15 9l-6 6" />
      </symbol>

      <symbol id="rp-spark" viewBox="0 0 24 24">
        <path className="fill" d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
        <path className="stroke" d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" />
      </symbol>

      <symbol id="rp-zap" viewBox="0 0 24 24">
        <path className="fill" d="M13 2 4 14h7l-1 8 9-12h-7z" />
        <path className="stroke" d="M13 2 4 14h7l-1 8 9-12h-7z" />
      </symbol>

      <symbol id="rp-settings" viewBox="0 0 24 24">
        <circle className="fill" cx="12" cy="12" r="3.5" />
        <circle className="stroke" cx="12" cy="12" r="3" />
        <path className="stroke" d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </symbol>

      <symbol id="rp-moon" viewBox="0 0 24 24">
        <path className="fill" d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z" />
        <path className="stroke" d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z" />
      </symbol>

      <symbol id="rp-play" viewBox="0 0 24 24">
        <path className="fill" d="M7 4v16l13-8z" />
        <path className="stroke" d="M7 4v16l13-8z" />
      </symbol>

      <symbol id="rp-arrow" viewBox="0 0 24 24">
        <path className="stroke" d="M5 12h14M13 5l7 7-7 7" />
      </symbol>

      <symbol id="rp-check" viewBox="0 0 24 24">
        <path className="stroke" d="m5 12 4 5 10-12" />
      </symbol>
    </svg>
  );
}

export default RPIconSprite;
