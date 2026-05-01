import { useEffect, useRef } from 'react'

// Sentinel key on history.state.<this> tells our listener "this entry was
// pushed by an overlay" so back gestures can be intercepted.
const KEY = '__dovviaOverlay'

/**
 * Closes a layered surface (panel, modal, sheet) when the user invokes
 * browser-style "back" — iOS swipe-back, Android back gesture, or the
 * desktop browser's back button. Without this, swiping back from an
 * open call panel leaves the dashboard entirely.
 *
 *   useDismissOnBack(onClose)
 *
 * Each instance pushes a unique sentinel onto history when it mounts.
 * On popstate, only the listener whose sentinel was popped fires its
 * onClose, so stacked overlays peel off one layer at a time.
 *
 * If the surface closes any other way (X button, backdrop, parent
 * state change), the cleanup pops the sentinel we pushed so we don't
 * leak phantom entries into history.
 */
export default function useDismissOnBack(onClose) {
  // Ref keeps the latest onClose without re-running the effect on every
  // parent render — the effect itself only depends on mount/unmount.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    history.pushState({ [KEY]: true, id }, '')

    let closedByGesture = false
    function onPop(e) {
      const cur = e.state
      // Still on our sentinel? Another (deeper) overlay was popped, not us.
      if (cur && cur[KEY] && cur.id === id) return
      closedByGesture = true
      closeRef.current?.()
    }

    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Programmatic close — pop our sentinel so the stack stays balanced.
      if (!closedByGesture && history.state?.[KEY] && history.state.id === id) {
        history.back()
      }
    }
  }, [])
}
