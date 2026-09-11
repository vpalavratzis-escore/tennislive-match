export const PresentationState = Object.freeze({
  NO_MATCH: "NO_MATCH", PRE_MATCH: "PRE_MATCH", LIVE: "LIVE",
  COMPLETED: "COMPLETED", ABORTED: "ABORTED",
});

export function normalizeMatchState(value, state = {}) {
  const raw = String(value ?? state.matchStatus ?? state.status ?? "").trim().toUpperCase();
  if (["LIVE", "PLAYING", "IN_PROGRESS", "ACTIVE"].includes(raw)) return PresentationState.LIVE;
  if (["COMPLETED", "ENDED", "FINISHED", "FINAL"].includes(raw)) return PresentationState.COMPLETED;
  if (["ABORTED", "CANCELLED", "CANCELED", "RETIRED"].includes(raw)) return PresentationState.ABORTED;
  if (["READY", "WAITING", "SCHEDULED", "WARMUP", "PRE_MATCH"].includes(raw)) return PresentationState.PRE_MATCH;
  const hasMatch = Boolean(state.matchId || state.nameA || state.nameB || state.startedAt);
  return hasMatch ? PresentationState.PRE_MATCH : PresentationState.NO_MATCH;
}

export function isLiveMatch(value, state) {
  return normalizeMatchState(value, state) === PresentationState.LIVE;
}
