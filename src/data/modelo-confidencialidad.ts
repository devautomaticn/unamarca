// Modelo de acuerdo de confidencialidad (NDA) unilateral para
// /acuerdo-de-confidencialidad. Genérico, con los datos a completar entre
// corchetes, y no sale de ningún cliente. Mismo formato que ejemplo-terminos.ts
// (un párrafo que empieza con «- » es un ítem de lista).
//
// Las normas citadas son el Código Civil y Comercial y la Ley 24.766. Si se
// cambia una acá, revisar que siga coincidiendo con el texto de la página.

import type { SeccionEjemplo } from './ejemplo-terminos';

export const MODELO_CONFIDENCIALIDAD: SeccionEjemplo[] = [
  {
    titulo: '',
    parrafos: [
      'Entre [NOMBRE O RAZÓN SOCIAL], CUIT [CUIT], con domicilio en [DOMICILIO] (la «Parte Reveladora»), y [NOMBRE O RAZÓN SOCIAL], CUIT [CUIT], con domicilio en [DOMICILIO] (la «Parte Receptora»), en conjunto «las Partes», celebran este acuerdo de confidencialidad, que se rige por las cláusulas siguientes.',
    ],
  },
  {
    titulo: 'Primera. Finalidad',
    parrafos: [
      'Las Partes están evaluando [PROPÓSITO: EL DESARROLLO DE UNA APP, UNA POSIBLE INVERSIÓN, UNA ASOCIACIÓN COMERCIAL] (el «Proyecto»). Para eso, la Parte Reveladora va a compartir con la Parte Receptora información que no es pública.',
    ],
  },
  {
    titulo: 'Segunda. Información confidencial',
    parrafos: [
      'Es «Información Confidencial» toda la información que la Parte Reveladora entregue, muestre o haga accesible a la Parte Receptora, por cualquier medio y antes o después de firmar este acuerdo, relacionada con el Proyecto o con su negocio. Incluye, entre otras:',
      '- planes de negocio, proyecciones y datos financieros;',
      '- diseños, prototipos, código fuente y documentación técnica;',
      '- bases de clientes y de proveedores, precios y condiciones comerciales;',
      '- know-how, procesos y métodos de trabajo;',
      '- [OTRA INFORMACIÓN PROPIA DEL PROYECTO].',
      'Es Información Confidencial aunque no esté marcada como tal, si una persona razonable entendería que lo es.',
    ],
  },
  {
    titulo: 'Tercera. Excepciones',
    parrafos: [
      'No es Información Confidencial la que la Parte Receptora pueda probar que:',
      '- ya era pública, o se hizo pública sin culpa de la Parte Receptora;',
      '- ya conocía antes de recibirla de la Parte Reveladora;',
      '- recibió legítimamente de un tercero que no tenía deber de reserva;',
      '- desarrolló por su cuenta, sin usar la Información Confidencial.',
      'Si una autoridad judicial o administrativa le ordena revelarla, la Parte Receptora avisa antes a la Parte Reveladora, si la ley lo permite, y revela sólo lo que se le exige.',
    ],
  },
  {
    titulo: 'Cuarta. Obligaciones de la Parte Receptora',
    parrafos: [
      'La Parte Receptora se obliga a:',
      '- usar la Información Confidencial sólo para el Proyecto;',
      '- no revelarla a terceros sin autorización escrita de la Parte Reveladora;',
      '- compartirla sólo con los empleados o asesores que necesiten conocerla para el Proyecto y que estén obligados a la misma reserva, respondiendo por ellos;',
      '- protegerla con, al menos, el mismo cuidado con que protege su propia información reservada, y nunca con menos que un cuidado razonable;',
      '- avisar de inmediato a la Parte Reveladora si se entera de un uso o una divulgación no autorizados.',
    ],
  },
  {
    titulo: 'Quinta. Sin licencia ni compromiso',
    parrafos: [
      'Compartir la Información Confidencial no le da a la Parte Receptora ningún derecho de propiedad ni licencia sobre ella, ni sobre las marcas, patentes, diseños o derechos de autor de la Parte Reveladora. Este acuerdo tampoco obliga a las Partes a celebrar ningún otro contrato.',
    ],
  },
  {
    titulo: 'Sexta. Devolución',
    parrafos: [
      'Cuando la Parte Reveladora lo pida, o al terminar el Proyecto, la Parte Receptora devuelve o destruye la Información Confidencial, con sus copias, dentro de los [DÍAS] días, y lo confirma por escrito.',
    ],
  },
  {
    titulo: 'Séptima. Plazo',
    parrafos: [
      'Este acuerdo rige desde su firma. Las obligaciones de confidencialidad duran hasta [PLAZO] después de terminado el Proyecto. Para la información que sea un secreto comercial en los términos de la Ley 24.766, duran mientras siga siéndolo.',
    ],
  },
  {
    titulo: 'Octava. Incumplimiento',
    parrafos: [
      'Si la Parte Receptora incumple este acuerdo, debe pagar a la Parte Reveladora, en concepto de cláusula penal, [MONTO] (arts. 790 y siguientes del Código Civil y Comercial). Además, la Parte Reveladora puede pedir judicialmente que cese el uso o la divulgación de la información.',
    ],
  },
  {
    titulo: 'Novena. Ley aplicable y jurisdicción',
    parrafos: [
      'Este acuerdo se rige por las leyes de la República Argentina. Ante cualquier conflicto, las Partes se someten a los tribunales ordinarios de [CIUDAD].',
    ],
  },
  {
    titulo: '',
    parrafos: [
      'En prueba de conformidad, se firman dos ejemplares de un mismo tenor en [LUGAR], el [FECHA].',
    ],
  },
];
