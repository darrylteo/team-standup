import { memo, useMemo } from "react";
import type { Avatar as AvatarSpec, Role } from "../../shared/types";
import { avatarSVG } from "../avatar/render.js";
import { roleDefaults } from "../components/Avatar";

/*
 * A chibi figure for the garden: the person's own head (drawn by the avatar renderer, head only) on a small,
 * round full body in their outfit, with arms and legs that move separately. Garden only: cards keep the portrait.
 * Body parts carry classes (.gd-arm, .gd-leg, .gd-torso) that garden.css animates.
 */

const v = (k: string) => `var(--av-${k})`;
const PAW: Record<string, string> = { dog_shiba: "shiba", dog_beagle: "beagle", cat_tabby: "tabby", cat_tuxedo: "white", cow: "white", rabbit: "cream" };

function Body({ spec }: { spec: AvatarSpec }) {
  const oc = spec.outfitColor ?? "o2";
  const kind = spec.outfit ?? "casual";
  const female = spec.kind === "human" && spec.body === "female";
  const hand = v(spec.kind && spec.kind !== "human" ? (PAW[spec.kind] ?? "cream") : (spec.skin ?? "s3"));
  const pilot = kind === "captain" || kind === "first_officer";
  // Sleeves, torso and trousers per outfit.
  const top = pilot || kind === "lab" ? v("white") : kind === "aviator" ? v("leather") : v(oc);
  const sleeve = top;
  const legs = kind === "engineer" ? v(oc) : pilot ? v("o1") : kind === "casual" ? "var(--gd-jeans)" : "var(--gd-trousers)";
  const skirt = female && kind === "cabin_crew";
  const arm = (side: "l" | "r") => {
    const x = side === "l" ? 14 : 46;
    return (
      <g className={`gd-arm ${side}`}>
        <rect x={x - 4} y={10} width={8} height={22} rx={4} fill={sleeve} />
        {pilot && <rect x={x - 4} y={26} width={8} height={2.2} fill={v("gold")} />}
        <circle cx={x} cy={33} r={4} fill={hand} />
      </g>
    );
  };
  const leg = (side: "l" | "r") => {
    const x = side === "l" ? 24 : 36;
    return (
      <g className={`gd-leg ${side}`}>
        <rect x={x - 4.5} y={36} width={9} height={18} rx={4} fill={skirt ? hand : legs} />
        <ellipse cx={x + (side === "l" ? -1 : 1)} cy={55} rx={6} ry={3.6} fill="var(--gd-shoe)" />
      </g>
    );
  };
  return (
    <svg className="gd-body-svg" viewBox="0 0 60 60" aria-hidden="true">
      {leg("l")}
      {leg("r")}
      {arm("l")}
      <g className="gd-torso">
        <path d={female ? "M18 7 Q30 3 42 7 Q46 9 45.5 16 L44 28 Q43 33 45 40 Q45 43 41 43 L19 43 Q15 43 15 40 Q17 33 16 28 L14.5 16 Q14 9 18 7 Z" : "M17 7 Q30 3 43 7 Q47 9 46.5 16 L45.5 39 Q45.5 43 41 43 L19 43 Q14.5 43 14.5 39 L13.5 16 Q13 9 17 7 Z"} fill={top} />
        {skirt && <path d="M15.5 36 L44.5 36 L47 47 Q30 50 13 47 Z" fill={v(oc)} />}
        {kind === "lab" && <path d="M15 40 L45 40 L46.5 50 Q30 52 13.5 50 Z" fill={v("white")} />}
        {/* Front details, hidden when they walk away (garden.css) */}
        <g className="gd-front">
        {kind === "lab" && <path d="M26 5 L30 16 L34 5 Z" fill={v(oc)} />}
        {kind === "lab" && <line x1={30} y1={16} x2={30} y2={50} stroke={v("white-sh")} strokeWidth={1} />}
        {pilot && (
          <>
            <path d="M28.5 6 L31.5 6 L32.6 22 L30 25 L27.4 22 Z" fill={v(oc)} />
            <rect x={13} y={7.5} width={9} height={4} rx={1.4} fill={v(`${oc}-sh`)} transform="rotate(-10 17.5 9.5)" />
            <rect x={38} y={7.5} width={9} height={4} rx={1.4} fill={v(`${oc}-sh`)} transform="rotate(10 42.5 9.5)" />
            <rect x={15.5} y={8.4} width={4} height={1.3} fill={v("gold")} transform="rotate(-10 17.5 9.5)" />
            <rect x={40.5} y={8.4} width={4} height={1.3} fill={v("gold")} transform="rotate(10 42.5 9.5)" />
          </>
        )}
        {kind === "cabin_crew" && (
          <>
            <path d="M24 5 L30 17 L36 5 Z" fill={v("white")} />
            <path d="M27 6 L33 6 L35 12 L30 10 L25 12 Z" fill={v("scarf")} />
            <circle cx={30} cy={23} r={1.2} fill={v("gold")} />
            <circle cx={30} cy={29} r={1.2} fill={v("gold")} />
          </>
        )}
        {kind === "ground_crew" && (
          <>
            <path d="M16 9 L26 6 L27 43 L16 43 Z" fill={v("hivis")} />
            <path d="M44 9 L34 6 L33 43 L44 43 Z" fill={v("hivis")} />
            <rect x={15} y={26} width={12} height={2.4} fill={v("reflect")} />
            <rect x={33} y={26} width={12} height={2.4} fill={v("reflect")} />
          </>
        )}
        {kind === "engineer" && (
          <>
            <line x1={30} y1={8} x2={30} y2={43} stroke={v("reflect")} strokeWidth={1.2} />
            <rect x={15} y={33} width={30} height={3} fill={v(`${oc}-sh`)} />
            <rect x={34} y={15} width={7} height={5} rx={1} fill={v("white")} />
          </>
        )}
        {kind === "aviator" && (
          <>
            <path d="M18 6 Q30 14 42 6 Q42 12 36 13 Q30 15 24 13 Q18 12 18 6 Z" fill={v("shearling")} />
            <line x1={30} y1={14} x2={30} y2={43} stroke={v("leather-sh")} strokeWidth={1.2} />
          </>
        )}
        {kind === "casual" && (
          <>
            <path d="M19 6 Q30 1 41 6 Q38 11 30 11 Q22 11 19 6 Z" fill={v(`${oc}-sh`)} />
            <line x1={27} y1={10} x2={26.6} y2={18} stroke={v("white")} strokeWidth={1} strokeLinecap="round" />
            <line x1={33} y1={10} x2={33.4} y2={18} stroke={v("white")} strokeWidth={1} strokeLinecap="round" />
            <path d="M21 30 L39 30 L37 38 L23 38 Z" fill={v(`${oc}-sh`)} />
          </>
        )}
        </g>
      </g>
      {arm("r")}
    </svg>
  );
}

/** The head (avatar renderer, head only) above a chibi body, with a back view for walking away. `sleep` closes the eyes. */
export const Chibi = memo(function Chibi({ avatar, role, photo, sleep = false }: { avatar: AvatarSpec; role?: Role; photo: string | null; sleep?: boolean }) {
  const spec = { ...roleDefaults(role), ...avatar };
  const key = JSON.stringify(spec);
  const head = useMemo(() => (photo ? "" : avatarSVG(spec, { headOnly: true, sleep })), [photo, sleep, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = useMemo(() => (photo ? "" : avatarSVG(spec, { headOnly: true, back: true })), [photo, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <span className="gd-body">
        <Body spec={spec} />
      </span>
      <span className="gd-head">
        {photo ? (
          <img src={photo} alt="" />
        ) : (
          <>
            <span className="av-svg gd-face" dangerouslySetInnerHTML={{ __html: head }} />
            <span className="av-svg gd-nape" dangerouslySetInnerHTML={{ __html: back }} />
          </>
        )}
      </span>
    </>
  );
});
