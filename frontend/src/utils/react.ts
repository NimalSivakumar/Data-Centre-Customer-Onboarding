import type { ReactNode } from 'react'

export function isReactNode(value: unknown): value is ReactNode {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value
}
