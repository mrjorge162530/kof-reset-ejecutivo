// KOF Reset Ejecutivo — API: guarda el avance del cliente en D1 y avisa al coach por correo (Resend).
// Todo lo que no sea /api/* lo sirven los assets estáticos de ./public.

const DIAS = {
  1: { titulo: 'Tu punto de partida', campos: [
    ['d1_obs', 'Qué le impide cumplir'], ['d1_obstaculo', 'Detalle'], ['d1_momentos', 'Momentos disponibles'],
    ['d1_peso', 'Peso'], ['d1_cintura', 'Cintura'], ['d1_energia', 'Energía (1–10)'] ] },
  2: { titulo: 'Tu agenda, tu sistema', campos: [
    ['ventana_a', 'Ventana A'], ['ventana_b', 'Ventana B'], ['ventana_c', 'Ventana C'],
    ['d2_alternativa', 'Alternativa de 10–15 min'] ] },
  3: { titulo: 'Primer entrenamiento', campos: [
    ['d3_sesion', 'Sesión realizada'], ['d3_facilito', 'Qué le facilitó cumplir'] ] },
  4: { titulo: 'Alimentación sin extremos', campos: [
    ['d4_desayuno', 'Desayuno'], ['d4_almuerzo', 'Almuerzo'], ['d4_cena', 'Cena'], ['d4_fuera', 'Si come fuera'] ] },
  5: { titulo: 'Segunda sesión', campos: [
    ['d5_sesion', 'Sesión realizada'], ['d5_ajuste', 'Qué ajustará'] ] },
  6: { titulo: 'Plan B cuando el trabajo aprieta', campos: [
    ['d6_mv', 'Mínimo viable'], ['d6_obstaculo', 'Obstáculo más probable'], ['d6_accion', 'Cuando ocurra, hará'] ] },
  7: { titulo: 'Cierre y continuidad', campos: [
    ['d7_entrenos', 'Entrenamientos completados (de 3)'], ['d7_comidas', 'Comidas planificadas (días)'],
    ['d7_energia', 'Energía hoy (1–10)'], ['d1_energia', 'Energía Día 1'],
    ['d7_aprendizaje', 'Mayor aprendizaje'], ['d7_compromiso', 'Compromiso próxima semana'] ] },
};

const MAX_BODY = 64 * 1024;
const MAX_TEXT = 4000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/progreso') {
      if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
      return guardarProgreso(request, env, ctx);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'No encontrado' }, 404);
    return env.ASSETS.fetch(request);
  },
};

async function guardarProgreso(request, env, ctx) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Datos demasiado grandes' }, 413);

  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'JSON inválido' }, 400); }

  const id = str(body.clientId, 64);
  const dia = Number(body.dia);
  const f = body.respuestas && typeof body.respuestas === 'object' ? body.respuestas : null;
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id) || !DIAS[dia] || !f) return json({ error: 'Datos incompletos' }, 400);

  const nombre = str(f.nombre, 120);
  const email = str(f.email, 160);
  const whatsapp = str(f.whatsapp, 40);
  const done = body.done && typeof body.done === 'object' ? body.done : {};
  const diasCompletados = [1, 2, 3, 4, 5, 6, 7].filter(n => done[n]).length;
  const respuestasDia = extraerDia(dia, f);

  await env.DB.prepare(
    `INSERT INTO clientes (id, nombre, email, whatsapp, dias_completados, respuestas)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET nombre = ?2, email = ?3, whatsapp = ?4,
       dias_completados = ?5, respuestas = ?6, actualizado = datetime('now')`
  ).bind(id, nombre, email, whatsapp, diasCompletados, JSON.stringify(f).slice(0, MAX_BODY)).run();

  const envio = await env.DB.prepare(
    `INSERT INTO envios (cliente_id, dia, respuestas_dia) VALUES (?1, ?2, ?3) RETURNING id`
  ).bind(id, dia, JSON.stringify(respuestasDia)).first();

  // El correo no bloquea la respuesta al cliente
  ctx.waitUntil(avisarCoach(env, { envioId: envio.id, dia, nombre, email, whatsapp, diasCompletados, respuestasDia }));

  return json({ ok: true });
}

function extraerDia(dia, f) {
  const out = {};
  const s = k => str(f[k], MAX_TEXT);
  for (const [k] of DIAS[dia].campos) {
    if (k === 'd1_obs') {
      out[k] = ['reuniones', 'cansancio', 'viajes', 'familia', 'horarios'].filter(o => f['d1_obs_' + o]).join(', ');
    } else if (k === 'd6_mv') {
      out[k] = [['caminata', '10–15 min de caminata o movilidad'], ['comida', 'Comida organizada'], ['manana', 'Preparar mañana']]
        .filter(([o]) => f['d6_mv_' + o]).map(([, t]) => t).join(', ');
    } else if (k.startsWith('ventana_')) {
      const x = k.slice(-1);
      out[k] = [s(`d2_${x}_dia`), s(`d2_${x}_hora`), s(`d2_${x}_lugar`)].filter(Boolean).join(' · ');
    } else {
      out[k] = s(k);
    }
  }
  return out;
}

async function avisarCoach(env, d) {
  if (!env.RESEND_API_KEY || !env.COACH_EMAIL) {
    console.log('Correo no enviado: falta RESEND_API_KEY o COACH_EMAIL');
    return;
  }
  const { titulo, campos } = DIAS[d.dia];
  const filas = campos.map(([k, label]) => [label, d.respuestasDia[k] || '—']);
  const quien = d.nombre || 'Cliente sin nombre';

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#0a0a0a;color:#f2f2f2;padding:28px;border-radius:12px">
  <div style="font-size:28px;font-weight:900;font-style:italic"><span style="color:#C41230">K</span>OF <span style="font-size:13px;letter-spacing:3px;color:#c8c8c8">RESET EJECUTIVO</span></div>
  <h2 style="margin:18px 0 4px;font-style:italic;text-transform:uppercase">Día ${d.dia} · ${esc(titulo)}</h2>
  <p style="margin:0 0 18px;color:#c8c8c8">${esc(quien)} completó el día ${d.dia} · lleva ${d.diasCompletados}/7 días</p>
  <table style="width:100%;border-collapse:collapse;background:#121212;border-radius:8px">
    ${filas.map(([l, v]) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #262626;color:#9a9a9a;width:40%;vertical-align:top">${esc(l)}</td><td style="padding:10px 12px;border-bottom:1px solid #262626;white-space:pre-wrap">${esc(v)}</td></tr>`).join('')}
  </table>
  <h3 style="margin:22px 0 8px;font-size:13px;letter-spacing:2px;color:#e0213f">CONTACTO</h3>
  <p style="margin:0;line-height:1.7">${esc(quien)}<br>
    ${d.email ? `<a style="color:#fff" href="mailto:${esc(d.email)}">${esc(d.email)}</a><br>` : ''}
    ${d.whatsapp ? `<a style="color:#fff" href="https://wa.me/${d.whatsapp.replace(/\D/g, '')}">WhatsApp ${esc(d.whatsapp)}</a>` : ''}</p>
</div>`;
  const text = [`KOF Reset Ejecutivo — Día ${d.dia}: ${titulo}`, `${quien} · ${d.diasCompletados}/7 días`, '',
    ...filas.map(([l, v]) => `${l}: ${v}`), '', `Correo: ${d.email || '—'}`, `WhatsApp: ${d.whatsapp || '—'}`].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'KOF Reset Ejecutivo <onboarding@resend.dev>',
      to: [env.COACH_EMAIL],
      ...(d.email ? { reply_to: d.email } : {}),
      subject: `KOF Reset · ${quien} completó el Día ${d.dia} (${d.diasCompletados}/7)`,
      html, text,
    }),
  });
  if (res.ok) {
    await env.DB.prepare('UPDATE envios SET correo_enviado = 1 WHERE id = ?1').bind(d.envioId).run();
  } else {
    console.log('Error de Resend', res.status, await res.text());
  }
}

function str(v, max) { return (v ?? '').toString().trim().slice(0, max); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
