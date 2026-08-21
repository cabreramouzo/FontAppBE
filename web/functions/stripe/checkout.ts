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
 * Si esta cuenta puede cobrar esta clase de donación **ahora mismo**.
 *
 * La usan el GET y el POST, y ese es el punto: si se escribieran dos veces, el día que
 * cambie una condición la pantalla ofrecería un botón que el endpoint rechaza, que es
 * justo el estado que esto viene a eliminar.
 */
function isConfigured(kind: DonationKind, env: Env) {
  const secret = env.STRIPE_SECRET_KEY?.trim()
  if (!secret || !SERVER_KEY_PREFIXES.some((p) => secret.startsWith(p))) return false
  const price = priceFor(kind, env)?.trim()
  return Boolean(price && price.startsWith('price_'))
}

/**
 * Qué formas de donar puede ofrecer la pantalla.
 *
 * Existe porque un botón de pagar que falla es peor que no tener botón: el que falla se
 * lee como «esta gente no sabe cobrar», y encima gasta el único momento en que alguien
 * había decidido dar dinero. Pasó en producción — la función se desplegó antes de que las
 * claves estuvieran puestas en Pages, y durante ese rato `/support` ofrecía un pago que
 * contestaba «no podemos abrir el pago».
 *
 * Se pregunta al servidor y no se resuelve con una variable de compilación porque las
 * claves son **de ejecución**: un `VITE_…` obligaría a reconstruir el sitio para encender
 * el botón, y sobre todo obligaría a acordarse de hacerlo. Así el botón aparece solo en
 * cuanto la configuración existe, y desaparece solo si un día deja de existir.
 *
 * No dice **por qué** no está configurado. Es una ruta pública: que falte la clave o que
 * falte el precio no es asunto de quien pasa por la página, y el prefijo de una clave es
 * justo la clase de dato que no se publica.
 */
export async function onRequestGet({ env }: Pick<PagesContext, 'env'>): Promise<Response> {
  const body = { once: isConfigured('once', env), monthly: isConfigured('monthly', env) }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // El borde cachea cinco minutos (`s-maxage`) y el navegador **no cachea nada**
      // (`max-age=0`). Los dos números importan y el segundo se puso mal a la primera:
      // con `max-age=300` a secas, quien hubiera pasado por /support mientras la cuenta
      // estaba sin configurar seguía sin ver el botón cinco minutos después de haberla
      // configurado — su navegador se quedaba con el «no» viejo. Medido: la misma
      // petición daba `once:false` de caché y `once:true` con `cache: 'reload'`.
      // Así, encender el botón se nota en la siguiente carga; el ahorro de no despertar
      // al worker lo sigue dando el borde.
      'cache-control': 'public, max-age=0, s-maxage=300',
    },
  })
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

  let body: CheckoutBody
  try {
    body = await request.json() as CheckoutBody
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }

  if (body.kind !== 'once' && body.kind !== 'monthly') {
    return json({ error: 'invalid_donation_kind' }, 400)
  }

  // El orden importa: la clase se valida **antes** que la configuración, o un `kind`
  // inventado se llevaba un 503 en vez de un 400 y parecía un problema del servidor.
  if (!isConfigured(body.kind, env)) {
    return json({ error: 'stripe_not_configured' }, 503)
  }
  const price = priceFor(body.kind, env)!.trim()

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

  // El cuerpo se lee como texto y se parsea aparte **a propósito**. Con
  // `await stripeResponse.json()` a pelo, cualquier respuesta que no sea JSON —una página
  // de error de un intermediario, un 502 de Stripe, un cuerpo vacío— lanza una excepción
  // que nadie captura, y entonces Pages devuelve su propia página de error en texto plano
  // en vez de nuestro JSON. Pasó en producción el día que se puso la cuenta real: el
  // cliente recibía `error code: 502` de Cloudflare, o sea el mismo mensaje genérico en
  // pantalla pero sin ninguna pista ni en la respuesta ni en los registros.
  const raw = await stripeResponse.text()
  let result: { url?: unknown; error?: { type?: string; code?: string; message?: string } } = {}
  try {
    result = JSON.parse(raw)
  } catch {
    result = {}
  }

  if (!stripeResponse.ok || typeof result.url !== 'string' || !result.url.startsWith('https://checkout.stripe.com/')) {
    // Al registro del servidor, nunca a la respuesta. El texto de error de Stripe explica
    // exactamente qué falta —un permiso de la clave restringida, un precio de otro modo,
    // un tax code— y sin él cada diagnóstico cuesta una ronda de preguntas. No lleva
    // secretos, pero tampoco es asunto de quien visita la página, así que se queda en
    // «Logs» del panel de Pages.
    console.error('stripe checkout failed', {
      status: stripeResponse.status,
      type: result.error?.type,
      code: result.error?.code,
      message: result.error?.message ?? raw.slice(0, 300),
    })
    return json({ error: 'checkout_creation_failed' }, 502)
  }

  return json({ url: result.url })
}
