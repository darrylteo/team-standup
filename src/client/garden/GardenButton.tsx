import { forwardRef } from "react";
import { useGardenScene } from "./ScenePicker";
import { Scenery } from "./Scenery";

/** "Visit the garden", drawn as a little window onto the scene this viewer picked in the garden. */
export const GardenButton = forwardRef<HTMLButtonElement, { onClick: () => void }>(function GardenButton({ onClick }, ref) {
  const [scene] = useGardenScene();
  return (
    <button ref={ref} type="button" className={`garden-btn scene-${scene.key}`} onClick={onClick} title="A calm screen where the team wanders an airfield">
      <span className="garden-btn-scene" aria-hidden="true">
        <Scenery scene={scene.key} width={900 * 3.6} />
      </span>
      <span className="garden-btn-label">
        <b>Visit the garden</b>
        <small>{scene.label} · {scene.place}</small>
      </span>
    </button>
  );
});
