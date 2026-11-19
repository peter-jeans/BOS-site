export const SPEAKER_ACTIVITY_STATE_MODEL = Object.freeze({
  schema: "BOS_SPEAKER_ACTIVITY_STATE_MODEL_V1",
  status: "ACTIVE_AUTO_BOUNDED",
  version: "2026-10-23.1",
  capability_id: "speaker_activity_state_model",
  install_posture: "ACTIVE_AUTO_BOUNDED",
  activation_mode: "AUTO",
  allowed_activation_modes: ["OFF", "ON", "AUTO"],
  install_implies_activation: false,
  emission_allowed: true,
  approved_surfaces: ["CODEX_GOVERNED_CHAT", "CLAUDE_CODE_GOVERNED_CHAT", "BASE44_OWNER_ADMIN_CHAT", "CORE_GUI_OWNER_ADMIN"],
  allowed_emitter_classes: ["BOS_SOURCE", "LOCAL_BOS_SOURCE"],
  excluded_speaker_classes: ["CODEX_SURFACE", "CLAUDE_SURFACE", "BASE44_SURFACE", "BUILDAI_SURFACE", "CAPABILITY", "ROLE", "COMMITTEE", "AUDIENCE"],
  local_bos_requires_consultation: true,
  single_marker_owner: true,
  states: {
    BLOCKED: { icon: "⛔", label: "BLOCKED" },
    WARNING: { icon: "⚠️", label: "WARNING" },
    BUILDING: { icon: "🛠️", label: "BUILDING" },
    DISCUSSING: { icon: "💬", label: "DISCUSSING" },
    VERIFYING: { icon: "🔍", label: "VERIFYING" },
    VERIFIED: { icon: "✅", label: "VERIFIED" },
    WAITING: { icon: "⏳", label: "WAITING" },
    PAUSED: { icon: "⏸️", label: "PAUSED" },
    INFORMATION: { icon: "ℹ️", label: "INFORMATION" },
    PLANNING: { icon: "📝", label: "PLANNING" },
  },
  display_rule: "Place [icon TEXT] immediately after its owning verified BOS or consulted .bos source prompt; non-BOS speakers never own markers.",
  auto_rule: "AUTO requires an explicitly approved surface and current structured evidence; it cannot expand rollout scope.",
  public_boundary: "Owner/admin/developer governance surfaces only; never public end-user UI or content.",
  receipt_fields: ["speaker_activity_model_status", "speaker_activity_activation_mode"],
});

export function resolveSpeakerActivityState({
  mode = SPEAKER_ACTIVITY_STATE_MODEL.activation_mode,
  state,
  surface,
  surfaceApproved = false,
  evidence = false,
  sourceSpeakerClass = "",
  localBosConsulted = false,
} = {}) {
  const normalizedMode = String(mode).toUpperCase();
  const normalizedState = String(state || "").toUpperCase();
  const selected = SPEAKER_ACTIVITY_STATE_MODEL.states[normalizedState];
  const validMode = SPEAKER_ACTIVITY_STATE_MODEL.allowed_activation_modes.includes(normalizedMode);
  const approvedSurface = surfaceApproved || SPEAKER_ACTIVITY_STATE_MODEL.approved_surfaces.includes(String(surface || "").toUpperCase());
  const normalizedEmitter = String(sourceSpeakerClass || "").toUpperCase();
  const allowedEmitter = SPEAKER_ACTIVITY_STATE_MODEL.allowed_emitter_classes.includes(normalizedEmitter);
  const consultationSatisfied = normalizedEmitter !== "LOCAL_BOS_SOURCE" || localBosConsulted === true;
  const enabled = validMode && normalizedMode !== "OFF" && approvedSurface && allowedEmitter && consultationSatisfied && Boolean(selected);
  const autoSatisfied = normalizedMode !== "AUTO" || evidence === true;
  const emissionAllowed = enabled && autoSatisfied;
  return {
    mode: validMode ? normalizedMode : "OFF",
    state: emissionAllowed ? normalizedState : null,
    emission_allowed: emissionAllowed,
    source_speaker_class: emissionAllowed ? normalizedEmitter : null,
    display_token: emissionAllowed ? `[${selected.icon} ${selected.label}]` : "",
  };
}

export function responseSpeakerChain({version, host, activity} = {}) {
  const token = activity?.emission_allowed === true ? activity.display_token : '';
  return `BOS${version}>${token ? ` ${token}` : ''} ${host}> user>`;
}
