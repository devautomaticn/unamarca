// Lo que comparten los dos endpoints de pedidos para el CRM de Vigilant
// (`/api/checkout/pagados` y `/api/checkout/no-pagados`): la clave, las
// respuestas y la vista de un pedido. Ver el encabezado de pagados.ts para las
// reglas de seguridad; valen igual para los dos.
import type { CheckoutEnv } from '@/lib/server/checkout';

export interface PedidosEnv extends CheckoutEnv {
  PEDIDOS_API_KEY?: string;
}

export interface FilaPedido {
  ref: string;
  created_at: string;
  completed_at: string | null;
  status: string;
  payload: string;
}

export const LIMITE = 200;
// No más atrás que esto en una sola consulta.
export const MAX_DIAS = 400;
export const DESDE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/;

export function noEncontrado(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export function autorizado(request: Request, env: PedidosEnv): boolean {
  const clave = env.PEDIDOS_API_KEY || '';
  // Una clave corta es una clave mal cargada: mejor no abrir el endpoint.
  if (clave.length < 32) return false;
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return token.length > 0 && igualSeguro(token, clave);
}

export function vista(f: FilaPedido) {
  let p: {
    marcas?: { nombre?: string; tipo?: string; clases?: number[] }[];
    marca?: { nombre?: string; tipo?: string };
    clases?: number[];
    contacto?: { email?: string; whatsapp?: string };
    garantia?: boolean;
    metodo?: string;
    pricing?: { honorarios?: number; garantia?: number; arancelInpi?: number; total?: number };
    origen?: unknown;
  } = {};
  try { p = JSON.parse(f.payload); } catch { /* ilegible: sólo lo de la fila */ }
  // Pedidos v1 (una sola marca) guardaban `marca` + `clases` sueltos.
  const marcas = p.marcas?.length
    ? p.marcas
    : p.marca ? [{ nombre: p.marca.nombre, tipo: p.marca.tipo, clases: p.clases }] : [];
  return {
    ref: f.ref,
    creado: f.created_at,
    completado: f.completed_at,
    estado: f.status,
    metodo: p.metodo || 'mercadopago',
    marcas: marcas.map(m => ({ nombre: m.nombre || '', tipo: m.tipo || '', clases: m.clases || [] })),
    garantia: !!p.garantia,
    precio: {
      honorarios: p.pricing?.honorarios ?? null,
      garantia: p.pricing?.garantia ?? null,
      arancel_inpi: p.pricing?.arancelInpi ?? null,
      total: p.pricing?.total ?? null,
    },
    contacto: { email: p.contacto?.email || '', whatsapp: p.contacto?.whatsapp || '' },
    origen: p.origen ?? null,
  };
}
