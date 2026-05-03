/** Subtle haptics for vote flows (mobile browsers). */

export function hapticLight() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(12);
    }
  } catch {
    /* ignore */
  }
}

/** Stronger tap for ballot picks */
export function hapticMedium() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(22);
    }
  } catch {
    /* ignore */
  }
}

export function hapticSuccess() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([18, 40, 22]);
    }
  } catch {
    /* ignore */
  }
}

export function hapticError() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([30, 50, 30, 50, 30]);
    }
  } catch {
    /* ignore */
  }
}
