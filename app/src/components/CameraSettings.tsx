import { useEffect, useState } from "react";
import { invoke } from "../ipc";
import { errorMessage } from "../errors";
import type { CameraProfile } from "../bindings";
import { PRO_CAMERA } from "../replayMath";
type Profile = { camera: CameraProfile; source: string; detail: string; player_id: string };
const fields = [
  ["fov", "Field of view", 60, 110, 1],
  ["distance", "Distance", 100, 400, 10],
  ["height", "Height", 40, 200, 10],
  ["angle", "Angle", -15, 0, 1],
  ["stiffness", "Stiffness", 0, 1, 0.05],
] as const;
export default function CameraSettings({
  accountId,
  onChange,
}: {
  accountId?: string | null;
  onChange: (camera: CameraProfile) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [draft, setDraft] = useState<CameraProfile>({ ...PRO_CAMERA }),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setProfile(null);
    setDraft({ ...PRO_CAMERA });
    onChange({ ...PRO_CAMERA });
    setNotice("");
    if (accountId) {
      invoke<Profile>("camera_profile")
        .then((p) => {
          if (live && p.camera) {
            setProfile(p);
            setDraft(p.camera);
            onChange(p.camera);
          }
        })
        .catch((e) => {
          if (live) setNotice(errorMessage(e));
        });
    }
    return () => {
      live = false;
    };
  }, [accountId, onChange]);
  const save = async (reset = false) => {
    setBusy(true);
    try {
      const p = await invoke<Profile>(
        reset ? "reset_camera_profile" : "save_camera_profile",
        reset ? {} : { body: draft },
      );
      if (p.camera) {
        setProfile(p);
        setDraft(p.camera);
        onChange(p.camera);
        setNotice(reset ? "Camera rediscovered." : "Camera saved locally for your account.");
      }
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="camera-settings">
      <summary>Your replay camera · {profile?.source ?? "AntiRL default"}</summary>
      <p className="studio-hint">
        {profile?.detail ?? "Confirm your player in Settings to discover and save your camera."}{" "}
        These optics apply to Chase and Ball Cam. Rocket League's camera response is approximated.
      </p>
      <div className="camera-fields">
        {fields.map(([key, label, min, max, step]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              aria-label={`Camera ${label}`}
              min={min}
              max={max}
              step={step}
              value={Number(draft[key].toFixed(3))}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))}
            />
          </label>
        ))}
      </div>
      <div className="intelligence-actions">
        <button
          className="btn primary"
          type="button"
          disabled={busy || !accountId}
          onClick={() => void save()}
        >
          Save camera
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={busy || !accountId}
          onClick={() => void save(true)}
        >
          Rediscover game camera
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
