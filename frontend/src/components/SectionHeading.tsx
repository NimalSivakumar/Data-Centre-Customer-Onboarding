import type { ReactNode } from 'react'

type SectionHeadingProps = {
  title: ReactNode
  helpText?: ReactNode
  count?: number
  className?: string
}

export function SectionHeading({ title, helpText, count, className = '' }: SectionHeadingProps) {
  const classes = ['section-heading', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <div>
        <h2>{title}</h2>
        {helpText && <p className="help-text mb-0">{helpText}</p>}
      </div>
      {typeof count === 'number' && <span className="badge text-bg-secondary">{count} records</span>}
    </div>
  )
}
