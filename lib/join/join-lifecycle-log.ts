const TAG = "[showtime:join]";

export function joinLifecycleLog(phase: string, detail?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  if (detail && Object.keys(detail).length > 0) {
    console.info(TAG, phase, detail);
  } else {
    console.info(TAG, phase);
  }
}
