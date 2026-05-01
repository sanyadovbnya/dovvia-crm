import { useEffect, useRef } from 'react'

// Sentinel key on history.state.<this> tells our listener "this entry was
// pushed by an overlay" so back gestures can be intercepted.
const KEY = '__dovviaOverlay'
// Ignore-window after a fresh mount: in React StrictMode dev, the
// unmount→remount dance triggers a popstate from our own cleanup that
// also bubbles to React Router; the router resyncs by replaceState, and
// the second mount's listener sees a non-sentinel state and would
// mistakenly close the panel. Echoes settle in well under 80ms.
const MOUNT_QUIET_MS = 120

/**
 * Closes a layered surface (panel, modal, sheet) when the user invokes
 * browser-style "back" — iOS swipe-back, Android back gesture, or the
 * desktop browser's back button. Without this, swiping back from an
 * open call panel leaves the dashboard entirely.
 *
 *   useDismissOnBack(onClose)
 *
 * Each instance pushes a unique sentinel onto history when it mounts.
 * On popstate, we read the *live* history.state — if we still own the
 * top entry, the gesture wasn't aimed at us; otherwise we close.
 *
 * If the surface closes any other way (X button, backdrop, parent state
 * change), the cleanup pops the sentinel we pushed so we don't leak
 * phantom entries into history.
 */
export default function useDismissOnBack(onClose) {
  // Ref keeps the latest onClose without re-running the effect on every
  // parent render — the effect itself only depends on mount/unmount.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    const mountedAt = Date.now()
    // Sandboxed iframes (some embedded previews) throw SecurityError from
    // history.pushState. Fail silently and skip the listener — overlay
    // stays functional, just without back-gesture support.
    try {
      history.pushState({ [KEY]: true, id }, '')
    } catch {
      return undefined
    }

    let closedByGesture = false
    function onPop() {
      // Quiet window after mount — popstate during this window is almost
      // always an echo from React Router resyncing after our own cleanup.
      if (Date.now() - mountedAt < MOUNT_QUIET_MS) return
      // Read the *live* history.state rather than e.state — by the time
      // a real listener fires, browsers have updated the active entry,
      // so live state is the truth.
      const cur = history.state
      if (cur && cur[KEY] && cur.id === id) return
      closedByGesture = true
      closeRef.current?.()
    }

    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Programmatic close — pop our sentinel so the stack stays balanced.
      try {
        if (!closedByGesture && history.state?.[KEY] && history.state.id === id) {
          history.back()
        }
      } catch { /* same SecurityError lane */ }
    }
  }, [])
}
