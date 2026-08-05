import type { ButtonHTMLAttributes, ReactNode } from 'react'

type TableActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  tone?: 'primary' | 'secondary' | 'danger'
}

export function TableActionButton({ children, tone = 'primary', className = '', ...props }: TableActionButtonProps) {
  const classes = ['table-action', tone !== 'primary' ? tone : '', className].filter(Boolean).join(' ')
  return <button className={classes} {...props}>{children}</button>
}
