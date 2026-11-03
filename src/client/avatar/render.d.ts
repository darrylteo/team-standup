export interface AvatarRenderSpec {
  kind?: string;
  body?: string;
  skin?: string;
  hair?: string;
  hairColor?: string;
  eyes?: string;
  brows?: string;
  facialHair?: string;
  outfit?: string;
  outfitColor?: string;
  accessory?: string;
}
export function avatarSVG(spec?: AvatarRenderSpec, opts?: { sleep?: boolean; title?: string; headOnly?: boolean; back?: boolean }): string;
