// Función de Cloudflare Pages: envía el pedido con la factura adjunta vía Brevo.
// La API key NUNCA viaja al navegador: vive en la variable de entorno BREVO_API_KEY
// (Dashboard de Cloudflare → Pages → tu proyecto → Settings → Environment variables).
//
// Rutas servidas automáticamente por Pages Functions:
//   /api/enviar-pedido  ->  functions/api/enviar-pedido.js

const ORDER_EMAIL_TO = 'produccion@nativacol.shop';
const ORDER_EMAIL_FROM = 'facturacion@nativacol.shop';
const MERCHANT_NAME = 'Nativa Bisutería';

// Responde con un JSON simple.
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export async function onRequestPost(context) {
  const env = context.env;
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: 'Cuerpo inválido' }, 400);
  }

  const { number, customerName, customerEmail, htmlContent, pdfBase64, pdfName } = body || {};
  if (!number || !htmlContent || !pdfBase64) {
    return json({ error: 'Faltan datos del pedido' }, 400);
  }

  // Sin llave configurada (deploy de preview, clon nuevo, etc.): no rompemos el
  // flujo de compra; la tienda muestra el aviso y coordina por otros canales.
  if (!env.BREVO_API_KEY) {
    return json({ skipped: true, reason: 'BREVO_API_KEY no configurada' }, 503);
  }

  const payload = {
    sender: { name: MERCHANT_NAME + ' — Tienda', email: ORDER_EMAIL_FROM },
    to: [{ email: ORDER_EMAIL_TO, name: 'Producción ' + MERCHANT_NAME }],
    cc: customerEmail ? [{ email: customerEmail, name: customerName || 'Cliente' }] : [],
    subject: `Nuevo pedido ${number} — ${customerName || 'Cliente'} (${body.totalCOP || ''})`,
    htmlContent,
    attachment: [{ name: pdfName || `Factura-${number}.pdf`, content: pdfBase64 }]
  };

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 401/402: llave inválida o cuota agotada — no exponemos detalles al cliente.
      return json({ error: 'Proveedor de correo rechazó el envío' }, 502);
    }
    const data = await res.json().catch(() => ({}));
    return json({ ok: true, messageId: data.messageId || null });
  } catch (err) {
    return json({ error: 'No se pudo contactar al proveedor de correo' }, 502);
  }
}
