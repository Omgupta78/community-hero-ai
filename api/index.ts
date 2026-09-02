// Vercel serverless entry point.
//
// Vercel calls this file as a Node.js function for every request that isn't
// a static file in public/. It bridges Node.js's IncomingMessage/ServerResponse
// to the Web API Request/Response that Hono uses internally.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { vercelApp } from '../src/server.vercel'

// Tell Vercel not to parse the body — we do it ourselves so streaming works.
export const config = { api: { bodyParser: false } }

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Build the full URL from forwarded headers (set by Vercel's proxy).
  const protocol = (req.headers['x-forwarded-proto'] as string) ?? 'https'
  const host =
    (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost'
  const url = `${protocol}://${host}${req.url}`

  // Collect the request body (async iteration over Node.js stream).
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  let body: Buffer | undefined
  if (hasBody) {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
  }

  // Construct a Web API Request for Hono.
  const webRequest = new Request(url, {
    method: req.method ?? 'GET',
    headers: req.headers as HeadersInit,
    ...(body && body.length > 0 ? { body } : {}),
  })

  // Run the Hono app (with SQLite bindings injected by server.vercel.ts).
  const response = await vercelApp.fetch(webRequest)

  // Write status + headers back to the Node.js response.
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))

  // Stream the response body.
  if (response.body) {
    const reader = response.body.getReader()
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
  }

  res.end()
}
