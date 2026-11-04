import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

type ModalScope = { activate: () => void; deactivate: () => void }
const scopes: ModalScope[] = []

/** Shared modal stack; focus() never dispatches synthetic session-activity events. */
export function useModalFocus(open: boolean, rootRef: RefObject<HTMLElement | null>, onDismiss: () => void, backdropRef?: RefObject<HTMLElement | null>) {
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  useEffect(() => {
    const root = rootRef.current
    if (!open || !root) return
    const previousFocus = document.activeElement
    const isolated: { node: HTMLElement; inert: string | null; hidden: string | null }[] = []

    const controls = () => Array.from(root.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]'))
      .filter((node) => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden], [inert], [aria-hidden="true"]'))
    const focusFirst = () => (controls()[0] ?? root).focus()
    const scope: ModalScope = {
      activate() {
        const initial = root.querySelector<HTMLElement>('[data-modal-initial-focus]')
        if (initial && controls().includes(initial)) initial.focus()
        else focusFirst()
        // Isolate sibling branches, never an ancestor containing the modal itself.
        for (let branch: HTMLElement | null = root; branch && branch !== document.body; branch = branch.parentElement) {
          for (const sibling of Array.from(branch.parentElement?.children ?? [])) {
            if (sibling === branch || sibling === backdropRef?.current || !(sibling instanceof HTMLElement)) continue
            isolated.push({ node: sibling, inert: sibling.getAttribute('inert'), hidden: sibling.getAttribute('aria-hidden') })
            sibling.setAttribute('inert', '')
            sibling.setAttribute('aria-hidden', 'true')
          }
        }
      },
      deactivate() {
        for (const { node, inert, hidden } of isolated.splice(0)) {
          if (inert === null) node.removeAttribute('inert')
          else node.setAttribute('inert', inert)
          if (hidden === null) node.removeAttribute('aria-hidden')
          else node.setAttribute('aria-hidden', hidden)
        }
      },
    }
    const isTop = () => scopes[scopes.length - 1] === scope
    scopes[scopes.length - 1]?.deactivate()
    scopes.push(scope)
    scope.activate()
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismissRef.current()
      } else if (event.key === 'Tab') {
        const items = controls()
        const first = items[0] ?? root
        const last = items[items.length - 1] ?? root
        if (!items.includes(document.activeElement as HTMLElement) ||
          (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    const onFocus = (event: FocusEvent) => {
      if (isTop() && !root.contains(event.target as Node)) focusFirst()
    }
    const blockOutside = (event: Event) => {
      if (isTop() && !root.contains(event.target as Node) && event.target !== backdropRef?.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    document.addEventListener('focusin', onFocus, true)
    document.addEventListener('pointerdown', blockOutside, true)
    document.addEventListener('click', blockOutside, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('focusin', onFocus, true)
      document.removeEventListener('pointerdown', blockOutside, true)
      document.removeEventListener('click', blockOutside, true)
      document.removeEventListener('keydown', onKeyDown, true)
      const wasTop = isTop()
      scope.deactivate()
      scopes.splice(scopes.indexOf(scope), 1)
      if (wasTop) {
        scopes[scopes.length - 1]?.activate()
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected && !previousFocus.closest('[hidden], [inert]')) previousFocus.focus()
      }
    }
  }, [open, rootRef, backdropRef])
}
