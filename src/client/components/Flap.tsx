/** Split-flap departure-board lettering. Each character flips in with a small stagger. */
export function Flap({ text, tone = "amber", className = "" }: { text: string; tone?: "amber" | "white" | "dim"; className?: string }) {
  let i = 0;
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  // The longest word's length, so CSS can shrink the tiles to fit a narrow box (see .who-name in app.css).
  const n = Math.max(1, ...words.map((w) => [...w].length));
  return (
    <span className={`flap ${tone === "amber" ? "" : tone} ${className}`} aria-label={text} role="text" style={{ ["--n" as string]: n }}>
      {words.map((w, wi) => (
        <span key={wi} style={{ display: "contents" }}>
          {wi > 0 && <span className="sp" />}
          <span className="wd" aria-hidden="true">
            {[...w].map((c, ci) => (
              <span key={ci} style={{ ["--i" as string]: i++ }}>
                {c}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
