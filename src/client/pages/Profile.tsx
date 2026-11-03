import { lazy, Suspense, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AVATAR, AVATAR_BACKGROUNDS, FLAIR_COLORS } from "../../shared/catalog";
import type { Avatar as AvatarSpec, Flair } from "../../shared/types";
import { api, apiUpload } from "../api";
import { Avatar, roleDefaults } from "../components/Avatar";
import { Flap } from "../components/Flap";
import { GardenButton } from "../garden/GardenButton";
import { Flairs } from "../components/UpdateCard";
import { WaitingOnMe } from "../components/WaitingOnMe";
import { saveLabel, useAutosave, useUnsavedGuard } from "../hooks";
import { preparePhoto } from "../photo";
import { useTeam } from "../state";

// Loaded only when someone opens it, so the garden adds nothing to the rest of the app.
const Garden = lazy(() => import("../garden/Garden"));


function Options({ label, options, value, onPick }: { label: string; options: readonly (readonly [string, string])[]; value: string | undefined; onPick: (k: string) => void }) {
  return (
    <div className="opt-row">
      <span className="hint">{label}</span>
      <div className="chips" role="group" aria-label={label}>
        {options.map(([k, text]) => (
          <button key={k} type="button" className="chip" aria-pressed={value === k} onClick={() => onPick(k)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Swatches({ label, keys, value, onPick, color }: { label: string; keys: readonly string[]; value: string | undefined; onPick: (k: string) => void; color: (k: string) => string }) {
  return (
    <div className="swatches" role="group" aria-label={label}>
      {keys.map((k) => (
        <button key={k} type="button" className="swatch" style={{ background: color(k) }} aria-pressed={value === k} aria-label={`${label} ${k}`} onClick={() => onPick(k)} />
      ))}
    </div>
  );
}

export function Profile() {
  const { me, byId, reloadMe, reloadMembers, toast } = useTeam();
  const live = byId.get(me.id) ?? me;
  const [garden, setGarden] = useState(false);
  const gardenBtn = useRef<HTMLButtonElement>(null);
  const initial = {
    name: me.name,
    handle: me.handle ?? "",
    avatar: { kind: "human", body: "male", skin: "s3", hair: "short", hairColor: "h2", ...roleDefaults(me.role), ...me.avatar } as AvatarSpec,
    flairs: me.profile.flairs,
    avatarBg: me.profile.avatarBg,
  };
  const [name, setName] = useState(initial.name);
  const [handle, setHandle] = useState(initial.handle);
  const [a, setA] = useState<AvatarSpec>(initial.avatar);
  const [flairs, setFlairs] = useState<Flair[]>(initial.flairs);
  const [avatarBg, setAvatarBg] = useState(initial.avatarBg);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => Promise.all([reloadMe(), reloadMembers()]);
  // Changes save themselves a moment after you stop typing or clicking; there's no Save button to hunt for.
  const auto = useAutosave({ name, handle, avatar: a, flairs, avatarBg }, async (v) => {
    try {
      await api("/account/profile", { method: "PATCH", body: { ...v, avatar: v.avatar, flairs: v.flairs.filter((f) => f.text.trim()) } });
      await refresh();
    } catch (e) {
      toast((e as Error).message);
      throw e;
    }
  });
  useUnsavedGuard(auto.dirty, auto.flush);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast(msg);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = (file: File | undefined) =>
    file &&
    run(async () => {
      const { blob } = await preparePhoto(file);
      await apiUpload("/account/avatar", blob);
      if (fileRef.current) fileRef.current.value = "";
    }, "Photo updated 📸");

  const preview = { ...live, name, handle: handle.replace(/^@/, "") || null, avatar: a, profile: { ...live.profile, flairs, avatarBg } };

  return (
    <main className="two">
      <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
        <section className="panel profile-card" aria-label="Your profile" data-focus="profile-card">
          <div className="hero">
            <div className={`hero-face ${live.photo ? "photo" : ""}`} style={live.photo ? undefined : { background: `var(--avbg-${avatarBg})` }}>
              {live.photo ? <img src={live.photo} alt="" /> : <Avatar avatar={a} role={me.role} title={`${name}'s avatar`} />}
            </div>
          </div>
          <div className="pmain">
            <Flap text={name || "?"} tone="white" />
            <Flairs member={preview} u={null} />
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
              Signed in as {me.email}
              {me.is_admin && " · admin"}
            </p>
            <GardenButton ref={gardenBtn} onClick={() => setGarden(true)} />
            {garden &&
              createPortal(
                <Suspense fallback={null}>
                  <Garden
                    onClose={() => {
                      setGarden(false);
                      gardenBtn.current?.focus();
                    }}
                  />
                </Suspense>,
                document.body,
              )}
          </div>
        </section>

        <section className="panel" aria-label="Edit profile">
          <div className="ph cond">
            <b>Edit profile</b>
            <span className={auto.state === "error" ? "err" : ""} aria-live="polite">{saveLabel(auto.state)}</span>
          </div>
          <div className="pmain form">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <div className="field">
                <label htmlFor="nm">Display name</label>
                <input id="nm" type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="hd">@handle</label>
                <input id="hd" type="text" value={handle} maxLength={21} placeholder="e.g. priya" onChange={(e) => setHandle(e.target.value.toLowerCase())} />
              </div>
            </div>

            <div className="field">
              <span className="lbl">Profile picture</span>
              <div className="pic-choice">
                <button
                  type="button"
                  className={`pic-opt ${!live.photo ? "on" : ""}`}
                  aria-pressed={!live.photo}
                  disabled={busy || !live.photo}
                  onClick={() => run(() => api("/account/avatar/use", { body: { photo: false } }), "Using your drawn avatar")}
                >
                  <span className="pic-thumb" style={{ background: `var(--avbg-${avatarBg})` }}>
                    <Avatar avatar={a} role={me.role} />
                  </span>
                  Drawn avatar
                </button>
                {live.saved_photo && (
                  <button
                    type="button"
                    className={`pic-opt ${live.photo ? "on" : ""}`}
                    aria-pressed={!!live.photo}
                    disabled={busy || !!live.photo}
                    onClick={() => run(() => api("/account/avatar/use", { body: { photo: true } }), "Using your photo")}
                  >
                    <span className="pic-thumb photo">
                      <img src={live.saved_photo} alt="" />
                    </span>
                    {live.photo ? "My photo" : "Last used photo"}
                  </button>
                )}
                <label className="pic-opt upload" style={{ cursor: busy ? "default" : "pointer" }}>
                  <span className="pic-thumb add">＋</span>
                  {live.saved_photo ? "Upload new photo" : "Upload a photo"}
                  <input ref={fileRef} type="file" accept="image/*" className="sr" disabled={busy} aria-label="Upload a photo" onChange={(e) => upload(e.target.files?.[0])} />
                </label>
              </div>
              <span className="hint">Photos are cropped to a square. GIFs up to 1 MB keep their animation.</span>
            </div>

            <div className="field">
              <span className="lbl">Drawn avatar</span>
              <div className="builder-row">
                <div className="mini-preview" style={{ background: `var(--avbg-${avatarBg})` }}>
                  <Avatar avatar={a} role={me.role} />
                </div>
                <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                  <Options label="Who" options={AVATAR.kind} value={a.kind} onPick={(kind) => setA({ ...a, kind })} />
                  {(a.kind ?? "human") === "human" && (
                    <>
                      <Options label="Body" options={AVATAR.body} value={a.body} onPick={(body) => setA({ ...a, body })} />
                      <div className="opt-row">
                        <span className="hint">Skin</span>
                        <Swatches label="Skin" keys={AVATAR.skin} value={a.skin} onPick={(skin) => setA({ ...a, skin })} color={(k) => `var(--av-${k})`} />
                      </div>
                      <Options label="Hair" options={AVATAR.hair} value={a.hair} onPick={(hair) => setA({ ...a, hair })} />
                      <div className="opt-row">
                        <span className="hint">Hair colour</span>
                        <Swatches label="Hair colour" keys={AVATAR.hairColor} value={a.hairColor} onPick={(hairColor) => setA({ ...a, hairColor })} color={(k) => `var(--av-${k})`} />
                      </div>
                      <Options label="Eyes" options={AVATAR.eyes} value={a.eyes} onPick={(eyes) => setA({ ...a, eyes })} />
                    </>
                  )}
                  <Options label="Uniform" options={AVATAR.outfit} value={a.outfit} onPick={(outfit) => setA({ ...a, outfit })} />
                  <div className="opt-row">
                    <span className="hint">Uniform colour</span>
                    <Swatches label="Uniform colour" keys={AVATAR.outfitColor} value={a.outfitColor} onPick={(outfitColor) => setA({ ...a, outfitColor })} color={(k) => `var(--av-${k})`} />
                  </div>
                  <Options label="Extras" options={AVATAR.accessory} value={a.accessory} onPick={(accessory) => setA({ ...a, accessory })} />
                  <div className="opt-row">
                    <span className="hint">Background colour</span>
                    <Swatches label="Avatar background" keys={AVATAR_BACKGROUNDS} value={avatarBg} onPick={setAvatarBg} color={(k) => `var(--avbg-${k})`} />
                  </div>
                </div>
              </div>
            </div>

            <div className="field" data-focus="profile-flairs">
              <span className="lbl">My flairs (up to 3)</span>
              {flairs.map((f, i) => (
                <div className="item" key={i} style={{ alignItems: "center" }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <input
                      type="text"
                      value={f.text}
                      maxLength={24}
                      placeholder="e.g. ☕ powered"
                      aria-label={`Flair ${i + 1} text`}
                      onChange={(e) => setFlairs(flairs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    />
                    <Swatches
                      label={`Flair ${i + 1} colour`}
                      keys={FLAIR_COLORS}
                      value={f.color}
                      color={(k) => `var(--flair-${k}-fg)`}
                      onPick={(color) => setFlairs(flairs.map((x, j) => (j === i ? { ...x, color } : x)))}
                    />
                  </div>
                  <button type="button" className="x" aria-label={`Remove flair ${i + 1}`} onClick={() => setFlairs(flairs.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </div>
              ))}
              {flairs.length < 3 && (
                <button type="button" className="add" onClick={() => setFlairs([...flairs, { text: "", color: FLAIR_COLORS[flairs.length] }])}>
                  + add a flair
                </button>
              )}
            </div>

            <p className="hint">Changes save automatically · {saveLabel(auto.state)}</p>
          </div>
        </section>
      </div>
      <div className="side">
        <WaitingOnMe />
      </div>
    </main>
  );
}
