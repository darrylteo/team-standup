import { useMemo } from "react";
import type { Avatar as AvatarSpec, Role } from "../../shared/types";
import { avatarSVG } from "../avatar/render.js";

/** Starting look before someone customises: pilots in captain's uniform, crew in cabin crew. */
export const roleDefaults = (role?: Role): AvatarSpec => ({ outfit: role === "prof" ? "captain" : "cabin_crew", outfitColor: "o1" });

// Brows and facial hair are no longer offered (too fiddly for a work tool), so older saved values are ignored.
const KEYS = ["kind", "body", "skin", "hair", "hairColor", "eyes", "outfit", "outfitColor", "accessory"] as const;
const clean = (a: AvatarSpec): AvatarSpec => Object.fromEntries(KEYS.filter((k) => a[k]).map((k) => [k, a[k]]));

/** Drawn avatar. The renderer only emits var(--av-*) colours and the spec holds short keys checked by the API. */
export function Avatar({ avatar, role, sleep = false, title }: { avatar: AvatarSpec; role?: Role; sleep?: boolean; title?: string }) {
  const svg = useMemo(() => avatarSVG({ ...roleDefaults(role), ...clean(avatar) }, { sleep, title }), [avatar, role, sleep, title]);
  return <span className="av-svg" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** A teammate's face: their uploaded photo in a rounded-square frame, or the drawn avatar in a circle. */
export function Face({
  member,
  sleep = false,
  className = "av",
  as: Tag = "div",
  title,
}: {
  member: { avatar: AvatarSpec; photo: string | null; name: string; role?: Role; profile?: { avatarBg?: string } };
  sleep?: boolean;
  className?: string;
  as?: "div" | "span";
  title?: string;
}) {
  return (
    <Tag
      className={`${className} ${member.photo ? "photo" : ""} ${sleep ? "sleep" : ""}`}
      title={title}
      style={member.photo ? undefined : { background: `var(--avbg-${member.profile?.avatarBg ?? "navy"})` }}
    >
      {member.photo ? (
        <img src={member.photo} alt={title ? member.name : ""} loading="lazy" decoding="async" />
      ) : (
        <Avatar avatar={member.avatar} role={member.role} sleep={sleep} title={title ? member.name : undefined} />
      )}
    </Tag>
  );
}
