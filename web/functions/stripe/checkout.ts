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

/**
 * Las dos formas que puede tener una clave de servidor de Stripe.
 *
 * `sk_` lo puede todo sobre la cuenta; `rk_` (restricted) solo los permisos que le marcas
 * al crearla. Para esto basta con **Checkout Sessions: write**, así que la restringida es
 * la que conviene: si el fichero de secretos se filtra, lo peor que puede hacer quien la
 * tenga es crear sesiones de pago hacia esta misma cuenta — no leer clientes, no mover
 * dinero, no emitir devoluciones.
 *
 * Se comprueba el prefijo y no solo que haya algo porque el fallo típico es pegar la
 * **publishable** (`pk_`), que se parece, se copia del mismo sitio y con ella Stripe
 * responde 401. Mejor decir «no configurado» antes de salir a la red.
 */
const SERVER_KEY_PREFIXES = ['sk_', 'rk_']

export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  const secret = env.STRIPE_SECRET_KEY?.trim()
  if (!secret || !SERVER_KEY_PREFIXES.some((p) => secret.startsWith(p))) {
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
    // Managed Payments viene **encendido por defecto** en las cuentas nuevas de Stripe, y
    // con él la sesión se rechaza entera si el producto no lleva un `tax_code` elegible:
    // `Invalid line_items[0]: this product tax code is ineligible for Managed Payments`.
    // No es un caso raro que se pueda dejar para luego — es el 100 % de los intentos desde
    // una cuenta recién creada, y el mensaje no llega al usuario: la función lo convierte
    // en `checkout_creation_failed` y la pantalla dice «no podemos abrir el pago».
    //
    // Se apaga aquí y no en el panel de Stripe, aunque el panel también deja hacerlo, por
    // dos razones. Una es que un ajuste de panel es invisible desde el repositorio y se
    // configura por cuenta: bastaría con que producción y el sandbox no coincidan para que
    // esto funcione en pruebas y falle al cobrar de verdad. La otra es que Managed Payments
    // es Stripe actuando de **merchant of record** —se ocupa de impuestos, fraude y
    // disputas globales, y cobra por ello—, que es un producto pensado para vender, no para
    // recibir una donación de cinco euros a un proyecto sin ánimo de lucro.
    'managed_payments[enabled]': 'false',
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
