// Ejemplo completo de términos y condiciones y política de privacidad de una
// app, para /terminos-y-condiciones-app. Es el «modelo» que busca la gente en
// Google: está generalizado (datos entre corchetes) y no sale de ningún
// cliente. Cada sección es un título y sus párrafos; un párrafo que empieza con
// «- » se muestra como ítem de lista.
//
// Las normas citadas son las mismas que usan los textos que entregamos. Si se
// cambia una acá, revisar que siga coincidiendo con la página.

export interface SeccionEjemplo {
  titulo: string;
  parrafos: string[];
}

export const TERMINOS_EJEMPLO: SeccionEjemplo[] = [
  {
    titulo: '1. Quiénes somos',
    parrafos: [
      '[NOMBRE DE LA APP] (la «App») es un servicio de [NOMBRE O RAZÓN SOCIAL], CUIT [CUIT], con domicilio en [DOMICILIO] (el «Responsable»). Para cualquier consulta, escribinos a [EMAIL].',
      'Al crear una cuenta o usar la App, el usuario (el «Usuario») acepta estos Términos y Condiciones y la Política de Privacidad. Si no está de acuerdo, no debe usar la App.',
    ],
  },
  {
    titulo: '2. Qué hace la App',
    parrafos: [
      'La App permite [DESCRIPCIÓN DEL SERVICIO EN UNA O DOS ORACIONES]. El Responsable puede agregar, cambiar o quitar funciones, avisando con anticipación cuando el cambio afecte algo que el Usuario ya pagó.',
    ],
  },
  {
    titulo: '3. Quién puede usarla',
    parrafos: [
      'La App es para personas de [EDAD MÍNIMA] años o más. Los menores de 18 años sólo pueden usarla con la autorización de quien ejerce su responsabilidad parental.',
      'El Usuario se compromete a dar datos verdaderos y a mantener la confidencialidad de su cuenta. Es responsable de lo que se haga con ella mientras no avise que alguien más accedió sin permiso.',
    ],
  },
  {
    titulo: '4. Contenido que suben los Usuarios',
    parrafos: [
      'Si el Usuario sube fotos, videos, audios o textos, declara que tiene derecho a hacerlo y que, si aparecen otras personas, cuenta con su consentimiento para usar su imagen (art. 53 del Código Civil y Comercial). Si aparece un menor de edad, declara ser su madre, padre o tutor, o contar con su autorización.',
      'Está prohibido subir contenido ilegal, ofensivo, discriminatorio, sexual, que infrinja derechos de terceros o que contenga virus. El Responsable puede retirar ese contenido y suspender la cuenta.',
    ],
  },
  {
    titulo: '5. Precio y pagos',
    parrafos: [
      'Los precios se informan en la App, en pesos argentinos y con impuestos incluidos, antes de cada compra. Los pagos se procesan a través de [MEDIOS DE PAGO]; el Responsable no guarda los datos de las tarjetas.',
      'Si hay una suscripción, se renueva automáticamente al final de cada período hasta que el Usuario la cancele, lo que puede hacer en cualquier momento desde [DÓNDE SE CANCELA].',
    ],
  },
  {
    titulo: '6. Propiedad intelectual',
    parrafos: [
      'La App, su nombre, su marca, su diseño y su código pertenecen al Responsable. El Usuario recibe un permiso personal y no exclusivo para usarla, que no le permite copiarla, modificarla ni revenderla.',
      'El contenido que sube el Usuario sigue siendo suyo. El Usuario le da al Responsable el permiso necesario para guardarlo, procesarlo y mostrarlo con el único fin de prestar el servicio.',
    ],
  },
  {
    titulo: '7. Arrepentimiento y reintegros',
    parrafos: [
      'El Usuario puede revocar la compra dentro de los 10 días corridos desde que la hizo, mediante el botón de arrepentimiento de la App o escribiendo a [EMAIL], sin costo ni explicación (art. 34 de la Ley 24.240 y Resolución 424/2020).',
      'Si el servicio no se presta por una causa atribuible al Responsable, se reintegra lo pagado por el mismo medio de pago.',
    ],
  },
  {
    titulo: '8. Inteligencia artificial',
    parrafos: [
      'Algunas funciones usan inteligencia artificial de [PROVEEDOR]. Los resultados pueden contener errores y no reemplazan el consejo de un profesional. El Usuario debe revisarlos antes de usarlos.',
    ],
  },
  {
    titulo: '9. Responsabilidad',
    parrafos: [
      'El Responsable trabaja para que la App funcione sin interrupciones, pero puede haber fallas, mantenimientos o cortes de proveedores. En la medida en que lo permite la Ley 24.240, no responde por daños indirectos ni por el uso que el Usuario haga de los resultados.',
    ],
  },
  {
    titulo: '10. Cambios, ley aplicable y contacto',
    parrafos: [
      'El Responsable puede modificar estos Términos. Los cambios importantes se avisan por email o en la App antes de entrar en vigencia; seguir usándola después implica aceptarlos.',
      'Estos Términos se rigen por las leyes de la República Argentina. Ante un conflicto, el Usuario puede recurrir a los tribunales de su domicilio o al Servicio de Conciliación Previa en las Relaciones de Consumo (COPREC). Contacto: [EMAIL].',
    ],
  },
];

export const PRIVACIDAD_EJEMPLO: SeccionEjemplo[] = [
  {
    titulo: '1. Responsable',
    parrafos: [
      'El responsable de los datos personales es [NOMBRE O RAZÓN SOCIAL], CUIT [CUIT], con domicilio en [DOMICILIO]. Contacto para temas de privacidad: [EMAIL].',
    ],
  },
  {
    titulo: '2. Qué datos usamos y para qué',
    parrafos: [
      '- Datos de la cuenta (nombre, email, teléfono): para crear la cuenta, identificar al Usuario y comunicarnos con él.',
      '- Datos de pago (los procesa [PROVEEDOR DE PAGOS]): para cobrar. No guardamos los datos de la tarjeta.',
      '- Contenido que sube el Usuario: para prestar el servicio.',
      '- Datos de uso y del dispositivo: para que la App funcione, detectar errores y mejorarla.',
      'Usamos los datos con el consentimiento del Usuario, que presta al aceptar esta Política, y sólo para las finalidades indicadas (Ley 25.326).',
    ],
  },
  {
    titulo: '3. Menores de edad',
    parrafos: [
      'La App no está dirigida a menores de [EDAD MÍNIMA] años. Si nos enteramos de que recolectamos datos de un menor sin la autorización de quien ejerce su responsabilidad parental, los eliminamos.',
    ],
  },
  {
    titulo: '4. Con quién compartimos los datos',
    parrafos: [
      'No vendemos datos personales. Los compartimos sólo con los proveedores que necesitamos para prestar el servicio: [HOSTING], [PAGOS], [EMAILS], [ANALÍTICA], [IA]. Cada uno los usa únicamente para eso. También podemos compartirlos si lo ordena una autoridad competente.',
    ],
  },
  {
    titulo: '5. Transferencia internacional',
    parrafos: [
      'Algunos proveedores procesan los datos fuera de la Argentina. En esos casos exigimos compromisos contractuales de protección conforme al artículo 12 de la Ley 25.326 y la Disposición 60/2016 de la AAIP. Al aceptar esta Política, el Usuario presta su consentimiento para esa transferencia.',
    ],
  },
  {
    titulo: '6. Cuánto tiempo guardamos los datos',
    parrafos: [
      'Mientras la cuenta esté activa. Si el Usuario la elimina, borramos sus datos dentro de [PLAZO], salvo los que la ley nos obligue a conservar, como los comprobantes de pago.',
    ],
  },
  {
    titulo: '7. Cookies y medición',
    parrafos: [
      'Usamos [GOOGLE ANALYTICS / PÍXEL DE META / NINGUNA] para medir el uso de la App. El Usuario puede desactivar las cookies desde la configuración de su navegador o dispositivo.',
    ],
  },
  {
    titulo: '8. Seguridad',
    parrafos: [
      'Aplicamos medidas técnicas y organizativas razonables para proteger los datos: conexiones cifradas, acceso restringido y proveedores con estándares de seguridad reconocidos.',
    ],
  },
  {
    titulo: '9. Derechos del Usuario',
    parrafos: [
      'El Usuario puede acceder a sus datos en forma gratuita a intervalos no menores de seis meses, salvo que acredite un interés legítimo (art. 14 de la Ley 25.326), y pedir su rectificación, actualización o supresión (art. 16). Para hacerlo, escribe a [EMAIL]. Respondemos dentro de los 10 días corridos para el acceso y de los 5 días hábiles para la rectificación o supresión.',
      'La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.',
    ],
  },
  {
    titulo: '10. Cambios y contacto',
    parrafos: [
      'Si cambiamos esta Política, avisamos por email o en la App antes de que el cambio entre en vigencia. Consultas: [EMAIL].',
    ],
  },
];
