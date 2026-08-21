import type { Env } from '../_meta.ts'
import { siteOrigin } from '../_meta.ts'

type DonationKind = 'once' | 'monthly'

interface CheckoutBody {
  kind?: unknown
}

interface PagesContext {
  request: Request
  env: Env
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/** Only these two server-side price IDs may ever reach Stripe. */
function priceFor(kind: DonationKind, env: Env) {
  return kind === 'monthly' ? env.STRIPE_MONTHLY_PRICE_ID : env.STRIPE_ONE_TIME_PRICE_ID
}

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const secret = env.STRIPE_SECRET_KEY?.trim()
  if (!secret || !secret.startsWith('sk_')) {
    return json({ error: 'stripe_not_configured' }, 503)
  }

  let body: CheckoutBody
  try {
    body = await request.json() as CheckoutBody
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  if (body.kind !== 'once' && body.kind !== 'monthly') {
    return json({ error: 'invalid_donation_kind' }, 400)
  }

  const price = priceFor(body.kind, env)?.trim()
  if (!price || !price.startsWith('price_')) {
    return json({ error: 'stripe_not_configured' }, 503)
  }

  const origin = siteOrigin(request)
  const params = new URLSearchParams({
    mode: body.kind === 'monthly' ? 'subscription' : 'payment',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: `${origin}/support?stripe=success`,
    cancel_url: `${origin}/support?stripe=cancelled`,
    'metadata[source]': 'fontapp_support',
  })

  let stripeResponse: Response
  try {
    stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })
  } catch {
    return json({ error: 'stripe_unavailable' }, 502)
  }

  const result = await stripeResponse.json() as { url?: unknown }
  if (!stripeResponse.ok || typeof result.url !== 'string' || !result.url.startsWith('https://checkout.stripe.com/')) {
    return json({ error: 'checkout_creation_failed' }, 502)
  }

  return json({ url: result.url })
}
