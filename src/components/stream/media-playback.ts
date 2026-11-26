/** Playback races must never mute a replacement stream. Only policy denial may mute. */
export function bindMediaPlayback(
  element: HTMLVideoElement,
  stream: MediaStream,
  muted: boolean,
  blocked: (value: boolean) => void,
  gestures: EventTarget = window
) {
  let disposed = false;
  let attempt = 0;
  const current = () => !disposed && element.srcObject === stream;
  element.srcObject = stream;
  element.muted = muted;
  blocked(false);

  const play = () => {
    if (!current()) return;
    const id = ++attempt;
    element.muted = muted;
    void element.play().then(() => {
      if (current() && id === attempt) blocked(false);
    }).catch((error: unknown) => {
      if (!current() || id !== attempt) return;
      const name = error instanceof Error ? error.name : "";
      // AbortError is normal during stream replacement. canplay/metadata retries it.
      if (name !== "NotAllowedError" || muted) return;
      element.muted = true;
      blocked(true);
      void element.play().catch(() => {}); // Silent video while explicit audio unlock is offered.
    });
  };
  const ready = () => { if (current() && element.paused) play(); };
  const gesture = () => { if (current() && !muted && (element.muted || element.paused)) play(); };
  element.addEventListener("loadedmetadata", ready);
  element.addEventListener("canplay", ready);
  if (!muted) {
    gestures.addEventListener("click", gesture);
    gestures.addEventListener("touchend", gesture);
  }
  play();
  return {
    play,
    dispose() {
      disposed = true;
      attempt++;
      element.removeEventListener("loadedmetadata", ready);
      element.removeEventListener("canplay", ready);
      gestures.removeEventListener("click", gesture);
      gestures.removeEventListener("touchend", gesture);
      if (element.srcObject === stream) element.srcObject = null;
    },
  };
}
