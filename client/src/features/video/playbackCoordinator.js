// Shared across provider types and both Pulse layouts. A player owns its
// callback only while active; unmount/visibility loss releases it.
let active = null;
export function activatePlayback(owner, pause) {
  if (active && active.owner !== owner) active.pause();
  active = { owner, pause };
}
export function releasePlayback(owner) {
  if (active?.owner === owner) active = null;
}
