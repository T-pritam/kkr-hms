/**
 * Drop-in shim for `next/link` over React Router's Link (maps `href` -> `to`).
 * Aliased in vite.config/tsconfig so copied components keep importing 'next/link'.
 */
import { Link as RouterLink } from 'react-router-dom'
import type { ReactNode, AnchorHTMLAttributes } from 'react'

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string
  children: ReactNode
}

export default function Link({ href, children, ...rest }: LinkProps) {
  return (
    <RouterLink to={href} {...rest}>
      {children}
    </RouterLink>
  )
}
