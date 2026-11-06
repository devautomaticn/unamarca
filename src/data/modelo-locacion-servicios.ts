// Modelo de contrato de locación de servicios para /contrato-de-locacion-de-servicios.
// Es el «modelo» que busca la gente en Google: genérico, con los datos a
// completar entre corchetes, y no sale de ningún cliente. Mismo formato que
// ejemplo-terminos.ts (un párrafo que empieza con «- » es un ítem de lista).
//
// Los artículos citados son del Código Civil y Comercial de la Nación. Si se
// cambia uno acá, revisar que siga coincidiendo con el texto de la página.

import type { SeccionEjemplo } from './ejemplo-terminos';

export const MODELO_LOCACION_SERVICIOS: SeccionEjemplo[] = [
  {
    titulo: '',
    parrafos: [
      'Entre [NOMBRE O RAZÓN SOCIAL DEL COMITENTE], CUIT [CUIT], con domicilio en [DOMICILIO] (el «Comitente»), y [NOMBRE DEL PRESTADOR], CUIT [CUIT], con domicilio en [DOMICILIO] (el «Prestador»), en conjunto «las Partes», celebran este contrato de locación de servicios, que se rige por las cláusulas siguientes y, en lo que no prevean, por los artículos 1251 y siguientes del Código Civil y Comercial de la Nación.',
    ],
  },
  {
    titulo: 'Primera. Objeto',
    parrafos: [
      'El Prestador se obliga a prestar al Comitente los siguientes servicios: [DESCRIPCIÓN DETALLADA DE LOS SERVICIOS Y DE LO QUE SE ENTREGA, SI SE ENTREGA ALGO].',
      'Los servicios que no figuran en esta cláusula no forman parte del contrato. Si el Comitente los pide, el Prestador los presupuesta aparte.',
    ],
  },
  {
    titulo: 'Segunda. Plazo',
    parrafos: [
      'El contrato rige desde el [FECHA DE INICIO] hasta el [FECHA DE FINALIZACIÓN]. Si las Partes quieren continuar, lo renuevan por escrito.',
    ],
  },
  {
    titulo: 'Tercera. Precio y forma de pago',
    parrafos: [
      'El Comitente paga al Prestador [MONTO] [por mes / en total], dentro de los [DÍAS] días de recibida la factura correspondiente, por transferencia a la cuenta [CBU O ALIAS] de titularidad del Prestador.',
      'El precio se actualiza cada [PERÍODO] según [ÍNDICE DE ACTUALIZACIÓN]. La falta de pago en término devenga un interés de [TASA] desde el vencimiento.',
    ],
  },
  {
    titulo: 'Cuarta. Independencia del Prestador',
    parrafos: [
      'El Prestador presta los servicios en forma autónoma, con sus propios medios y organización, y elige cómo y cuándo trabajar dentro de los plazos acordados (art. 1253 del Código Civil y Comercial). Puede prestar servicios a otras personas.',
      'Entre las Partes no existe relación de dependencia laboral. El Prestador está inscripto ante ARCA como [MONOTRIBUTISTA / RESPONSABLE INSCRIPTO] y es el único responsable de sus impuestos, aportes y seguros.',
    ],
  },
  {
    titulo: 'Quinta. Obligaciones de las Partes',
    parrafos: [
      'El Prestador se obliga a prestar los servicios con la diligencia y los conocimientos que exige su actividad (art. 1256), a informar al Comitente sobre su avance cuando éste lo pida y a [OTRAS OBLIGACIONES].',
      'El Comitente se obliga a pagar el precio en término y a dar al Prestador, a tiempo, la información, los materiales y los accesos que necesite para trabajar (art. 1257).',
    ],
  },
  {
    titulo: 'Sexta. Propiedad intelectual',
    parrafos: [
      'Los [TEXTOS / DISEÑOS / CÓDIGO / MATERIALES] que el Prestador produzca para el Comitente en ejecución de este contrato pertenecen al Comitente una vez pagado el precio. El Prestador le cede los derechos patrimoniales de autor sobre ellos, sin cargo adicional.',
      'El Prestador conserva lo que ya era suyo antes del contrato (herramientas, plantillas, conocimientos) y puede mostrar el trabajo realizado en su portfolio, salvo que el Comitente se lo prohíba por escrito.',
    ],
  },
  {
    titulo: 'Séptima. Confidencialidad',
    parrafos: [
      'El Prestador no revela ni usa para otro fin la información del Comitente a la que acceda por este contrato (datos de clientes, precios, planes, accesos). Esta obligación sigue vigente durante [PLAZO] después de terminado el contrato.',
    ],
  },
  {
    titulo: 'Octava. Terminación',
    parrafos: [
      'Cualquiera de las Partes puede terminar el contrato sin expresar causa, avisando a la otra por escrito con [DÍAS] días de anticipación. En ese caso, el Comitente paga los servicios prestados hasta la fecha de terminación y los gastos ya realizados, y las Partes renuncian a cualquier otra indemnización por la terminación anticipada.',
      'Si una Parte incumple, la otra puede intimarla a cumplir dentro de los 15 días y, si no lo hace, dar por resuelto el contrato (art. 1088).',
    ],
  },
  {
    titulo: 'Novena. Domicilios, ley aplicable y jurisdicción',
    parrafos: [
      'Las Partes constituyen domicilio en los indicados al comienzo y aceptan como válidas las comunicaciones a los emails [EMAIL DEL COMITENTE] y [EMAIL DEL PRESTADOR].',
      'Este contrato se rige por las leyes de la República Argentina. Ante cualquier conflicto, las Partes se someten a los tribunales ordinarios de [CIUDAD].',
    ],
  },
  {
    titulo: '',
    parrafos: [
      'En prueba de conformidad, se firman dos ejemplares de un mismo tenor en [LUGAR], el [FECHA].',
    ],
  },
];
