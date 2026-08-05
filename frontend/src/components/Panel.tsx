import type { ReactNode, Ref } from 'react'

type PanelProps = {
  children: ReactNode
  className?: string
  panelRef?: Ref<HTMLElement>
}

export function Panel({ children, className = '', panelRef }: PanelProps) {
  const classes = ['panel', className].filter(Boolean).join(' ')
  return <section className={classes} ref={panelRef}>{children}</section>
}
