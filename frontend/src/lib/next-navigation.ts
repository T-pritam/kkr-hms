/**
 * Drop-in shim for `next/navigation`, backed by React Router. Aliased in
 * vite.config/tsconfig so the copied components keep importing 'next/navigation'
 * verbatim — only the routing engine underneath changes.
 */
import { useNavigate, useLocation, useParams as useRRParams, useSearchParams as useRRSearchParams } from 'react-router-dom'

export function useRouter() {
  const navigate = useNavigate()
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => { /* no-op: client-side data is refetched by hooks */ },
    prefetch: () => { /* no-op */ },
  }
}

export function usePathname(): string {
  return useLocation().pathname
}

export function useSearchParams(): URLSearchParams {
  const [params] = useRRSearchParams()
  return params
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useRRParams() as T
}
