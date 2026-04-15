const NIZA_NAMES: Record<number, string> = {
  1: 'Productos químicos industriales y científicos',
  2: 'Pinturas, barnices, lacas, preservativos',
  3: 'Cosméticos, perfumería, limpieza',
  4: 'Aceites y grasas industriales, combustibles',
  5: 'Productos farmacéuticos y veterinarios',
  6: 'Metales comunes y sus aleaciones',
  7: 'Máquinas y máquinas herramientas',
  8: 'Herramientas e instrumentos de mano',
  9: 'Aparatos científicos, ópticos, informáticos, electrónicos',
  10: 'Aparatos médicos y quirúrgicos',
  11: 'Aparatos de alumbrado, calefacción, refrigeración',
  12: 'Vehículos y medios de transporte',
  13: 'Armas de fuego, municiones, explosivos',
  14: 'Joyería, relojería, metales preciosos',
  15: 'Instrumentos musicales',
  16: 'Papel, cartón, artículos de imprenta',
  17: 'Caucho, goma, plásticos semielaborados',
  18: 'Cuero, artículos de viaje, bolsos',
  19: 'Materiales de construcción no metálicos',
  20: 'Muebles, espejos, marcos, madera',
  21: 'Utensilios del hogar, vidrio, porcelana',
  22: 'Cuerdas, redes, tiendas, telas técnicas',
  23: 'Hilos y fibras textiles industriales',
  24: 'Tejidos y sustitutos; ropa de hogar',
  25: 'Prendas de vestir, calzado, sombrerería',
  26: 'Encajes, bordados, botones, adornos textiles',
  27: 'Alfombras, revestimientos de suelos',
  28: 'Juegos, juguetes, artículos deportivos',
  29: 'Carne, pescado, aves, conservas, lácteos',
  30: 'Café, té, panadería, repostería, condimentos',
  31: 'Productos agrícolas, hortícolas, animales vivos',
  32: 'Cervezas, aguas, bebidas sin alcohol',
  33: 'Bebidas alcohólicas (excepto cervezas)',
  34: 'Tabaco, cigarrillos, artículos para fumadores',
  35: 'Publicidad, gestión comercial, oficina',
  36: 'Seguros, finanzas, inmobiliaria',
  37: 'Construcción, reparación, instalación',
  38: 'Telecomunicaciones',
  39: 'Transporte, logística, almacenamiento',
  40: 'Tratamiento de materiales, reciclaje',
  41: 'Educación, entretenimiento, deporte, cultura',
  42: 'Servicios científicos, tecnológicos, informáticos',
  43: 'Restauración, alojamiento temporal',
  44: 'Servicios médicos, veterinarios, de belleza',
  45: 'Servicios jurídicos, de seguridad, personales',
};

interface Domicilio {
  pais: string;
  provincia: string;
  localidad: string;
  codigoPostal: string;
  calle: string;
  numero: string;
  piso?: string;
  depto?: string;
}

interface Titular {
  tipoPersona: 'Humana' | 'Juridica';
  nombre: string;
  genero?: string;
  estadoCivil?: string;
  nombreConyuge?: string;
  cuit: string;
  porcentaje: number;
  email: string;
  domicilio: Domicilio;
}

interface FormData {
  marca: { nombre: string; tipo: string };
  titulares: Titular[];
  clases: number[];
}

function buildEmailHTML(data: FormData): string {
  const date = new Date().toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });

  const row = (label: string, value: string) =>
    `<tr>
      <td style="padding:7px 0;color:#64748b;font-size:14px;width:42%;vertical-align:top">${label}</td>
      <td style="padding:7px 0;color:#0f172a;font-size:14px;font-weight:500;vertical-align:top">${value}</td>
    </tr>`;

  const titularesHTML = data.titulares
    .map(
      (t, i) => `
    <div style="background:#f8faff;border-radius:10px;padding:22px 24px;margin-bottom:14px;border:1px solid #e2e8f0">
      <p style="margin:0 0 14px;color:#0B1D3A;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">
        Titular ${i + 1}${data.titulares.length > 1 ? ` — ${t.porcentaje}%` : ''}
      </p>
      <table style="width:100%;border-collapse:collapse">
        ${row('Tipo de Persona', t.tipoPersona)}
        ${row(t.tipoPersona === 'Juridica' ? 'Razón Social' : 'Nombre', t.nombre)}
        ${t.tipoPersona === 'Humana' && t.genero ? row('Género', t.genero) : ''}
        ${t.tipoPersona === 'Humana' && t.estadoCivil ? row('Estado Civil', t.estadoCivil) : ''}
        ${t.tipoPersona === 'Humana' && t.estadoCivil === 'Casado/a' && t.nombreConyuge ? row('Nombre del Cónyuge', t.nombreConyuge) : ''}
        ${row('CUIT / CUIL', t.cuit)}
        ${row('Porcentaje', `${t.porcentaje}%`)}
        ${row('Correo Electrónico', t.email)}
      </table>
      <p style="margin:16px 0 8px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Domicilio Real</p>
      <table style="width:100%;border-collapse:collapse">
        ${row('País', t.domicilio.pais)}
        ${row('Provincia', t.domicilio.provincia)}
        ${row('Localidad', t.domicilio.localidad)}
        ${row('Código Postal', t.domicilio.codigoPostal)}
        ${row('Calle', t.domicilio.calle)}
        ${row('Número', t.domicilio.numero)}
        ${t.domicilio.piso ? row('Piso', t.domicilio.piso) : ''}
        ${t.domicilio.depto ? row('Depto', t.domicilio.depto) : ''}
      </table>
    </div>
  `
    )
    .join('');

  const clasesHTML =
    data.clases.length > 0
      ? data.clases
          .map(
            (c) =>
              `<span style="display:inline-block;background:#dbeafe;color:#1e40af;border-radius:6px;padding:5px 12px;margin:3px;font-size:13px;font-weight:600">Clase ${c}: ${NIZA_NAMES[c] ?? ''}</span>`
          )
          .join('')
      : '<p style="color:#94a3b8;font-style:italic;font-size:14px;margin:0">No se especificaron clases</p>';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 16px;background:#f1f5f9;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:640px;margin:0 auto">

    <div style="background:linear-gradient(145deg,#060E1E 0%,#0B1D3A 45%,#122040 100%);border-radius:16px 16px 0 0;padding:32px 36px">
      <p style="margin:0 0 12px;color:rgba(255,255,255,0.5);font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase">UnaMarca · Registro de Marcas</p>
      <h1 style="margin:0 0 8px;color:white;font-size:22px;font-weight:800;letter-spacing:-0.025em">Nuevo Formulario de Registro de Marca</h1>
      <p style="margin:0;color:rgba(255,255,255,0.5);font-size:13px">${date}</p>
    </div>

    <div style="background:white;padding:36px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">

      <div style="margin-bottom:32px">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#2563EB;border-bottom:2px solid #2563EB;padding-bottom:8px;display:inline-block">Marca</p>
        <table style="width:100%;border-collapse:collapse;margin-top:4px">
          <tr>
            <td style="padding:8px 0;color:#64748b;font-size:14px;width:42%">Nombre</td>
            <td style="padding:8px 0;color:#0B1D3A;font-size:20px;font-weight:800;letter-spacing:-0.02em">${data.marca.nombre}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#64748b;font-size:14px">Tipo</td>
            <td style="padding:8px 0">
              <span style="background:#dbeafe;color:#1e40af;border-radius:100px;padding:4px 14px;font-size:13px;font-weight:600">${data.marca.tipo}</span>
            </td>
          </tr>
        </table>
      </div>

      <div style="margin-bottom:32px">
        <p style="margin:0 0 16px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#2563EB;border-bottom:2px solid #2563EB;padding-bottom:8px;display:inline-block">Titulares (${data.titulares.length})</p>
        ${titularesHTML}
      </div>

      <div>
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#2563EB;border-bottom:2px solid #2563EB;padding-bottom:8px;display:inline-block">Clases Niza</p>
        <div style="margin-top:4px">${clasesHTML}</div>
      </div>

    </div>

    <div style="background:#f8faff;border-radius:0 0 16px 16px;padding:18px 36px;border:1px solid #e2e8f0;border-top:none;text-align:center">
      <p style="margin:0;color:#94a3b8;font-size:12px">Enviado automáticamente desde el formulario de registro de <strong style="color:#64748b">unamarca.com.ar</strong></p>
    </div>

  </div>
</body>
</html>`;
}

interface Env {
  RESEND_API_KEY: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.RESEND_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: FormData;
  try {
    body = await context.request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Cuerpo de solicitud inválido' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { marca, titulares } = body;

  const replyTo = titulares?.[0]?.email;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Formulario UnaMarca <formulario@vigilante.unamarca.com.ar>',
        to: ['mike@automaticnation.com'],
        reply_to: replyTo,
        subject: `Nuevo registro de marca: ${marca?.nombre ?? 'Sin nombre'} (${marca?.tipo ?? ''})`,
        html: buildEmailHTML(body),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Resend API error:', errText);
      return new Response(
        JSON.stringify({ success: false, error: 'Error al enviar el correo' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Fetch error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Error de red' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
