/**
 * Helpers for invoking App Router route handlers directly — no dev server, no HTTP.
 */

import { NextRequest } from 'next/server'
import { cookieJar } from './cookie-jar'

const BASE_URL = 'https://hms.test'

export interface RequestOptions {
  /** JSON body. Ignored when `formData` is supplied. */
  body?: unknown
  /** Multipart body, for the CSV import and case-sheet upload routes. */
  formData?: FormData
  /** Query string parameters. */
  query?: Record<string, string | number | undefined>
  /** Extra request headers. */
  headers?: Record<string, string>
  /** Extra request cookies, merged over the ones held in the cookie jar. */
  cookies?: Record<string, string>
  /** Send no auth cookies at all, even if a session is active. */
  anonymous?: boolean
  /** Raw body, for the malformed-JSON cases. */
  rawBody?: string
}

/**
 * Build a NextRequest. Auth cookies held in the jar (see `signInAs`) are attached
 * automatically, so both auth paths in the codebase — `verifyAuth(request)` reading
 * request cookies and `getAccessToken()` reading `next/headers` — see the same session.
 */
export function makeRequest(method: string, path: string, options: RequestOptions = {}): NextRequest {
  const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  const headers = new Headers(options.headers)
  let body: BodyInit | undefined

  if (options.formData) {
    body = options.formData
  } else if (options.rawBody !== undefined) {
    body = options.rawBody
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body)
    headers.set('content-type', 'application/json')
  }

  const request = new NextRequest(url, { method, headers, body } as ConstructorParameters<typeof NextRequest>[1])

  if (!options.anonymous) {
    for (const { name, value } of cookieJar.getAll()) {
      request.cookies.set(name, value)
    }
  }
  for (const [name, value] of Object.entries(options.cookies ?? {})) {
    request.cookies.set(name, value)
  }

  return request
}

/**
 * Route handlers type their own params (`{ params: Promise<{ id: string }> }`), so this
 * is generic over that shape rather than fixing it to Record<string, string>.
 */
type RouteHandler<P> = (request: NextRequest, context: { params: Promise<P> }) => Promise<Response>

/** Invoke a handler, passing route params the way Next 16 does (as a Promise). */
export async function callRoute<P extends Record<string, string>>(
  handler: RouteHandler<P>,
  request: NextRequest,
  params: P = {} as P
): Promise<Response> {
  return handler(request, { params: Promise.resolve(params) })
}

/** Read a handler response as `{ status, body }`. */
export async function readJson(response: Response): Promise<{ status: number; body: any }> {
  const text = await response.text()
  let body: any = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  return { status: response.status, body }
}

/** One-liner for the common case: build a request, call the handler, parse the response. */
export async function call<P extends Record<string, string>>(
  handler: RouteHandler<P>,
  method: string,
  path: string,
  options: RequestOptions & { params?: P } = {}
): Promise<{ status: number; body: any; response: Response }> {
  const { params, ...requestOptions } = options
  const request = makeRequest(method, path, requestOptions)
  const response = await callRoute(handler, request, params ?? ({} as P))
  const { status, body } = await readJson(response)
  return { status, body, response }
}
