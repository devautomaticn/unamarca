// Títulos oficiales de las clases de la Clasificación Internacional de Niza.
// Se usan los encabezados oficiales completos (no versiones abreviadas) para
// evitar disputas de alcance, spec docs/spec_self_checkout.md §4 y §10.
//
// VERIFICADO 2026-09-20 contra la publicación oficial de la OMPI
// (nclpub.wipo.int, español, edición-versión 20260101, en vigor). El INPI no
// publica un texto propio: su página de clasificación remite a la OMPI.
//
// Antes de esta verificación los textos venían de otra traducción al español
// (la europea: "complementos alimenticios", "emplastos", "composiciones"),
// y 27 de las 45 no coincidían con la de la OMPI. Eran variantes de traducción,
// no diferencias de alcance, pero el usuario las lee en el wizard para elegir
// su clase, así que ahora dicen lo mismo que la fuente.
//
// Para actualizarlas: bajar el heading de cada clase de nclpub.wipo.int fijando
// `version=` a la edición en vigor. Sin fijar la versión, el sitio sirve una
// edición futura que todavía no rige.

export interface NizaClass {
  num: number;
  /** Nombre corto y reconocible — se muestra en el dropdown del wizard */
  nombre: string;
  /** Encabezado oficial completo de la clase — para la presentación y la búsqueda */
  textoOficial: string;
}

export const NIZA_CLASSES: NizaClass[] = [
  { num: 1, nombre: 'Productos químicos industriales y científicos', textoOficial: 'Productos químicos para la industria, la ciencia y la fotografía, así como para la agricultura, la horticultura y la silvicultura; resinas artificiales en bruto, materias plásticas en bruto; compuestos para la extinción de incendios y la prevención de incendios; preparaciones para templar y soldar metales; sustancias para curtir cueros y pieles de animales; adhesivos (pegamentos) para la industria; compost, abonos, fertilizantes; preparaciones biológicas para la industria y la ciencia' },
  { num: 2, nombre: 'Pinturas, barnices, lacas', textoOficial: 'Pinturas, barnices, lacas; productos contra la herrumbre y el deterioro de la madera; colorantes, tintes; tintas de imprenta, tintas de marcado y tintas de grabado; resinas naturales en bruto; metales en hojas y en polvo para la pintura, la decoración, la imprenta y trabajos artísticos' },
  { num: 3, nombre: 'Cosméticos, perfumería, limpieza', textoOficial: 'Productos cosméticos y preparaciones de tocador no medicinales; dentífricos no medicinales; perfumes; preparaciones para blanquear y otras sustancias para lavar la ropa; preparaciones para limpiar, pulir y raspar' },
  { num: 4, nombre: 'Aceites, grasas industriales y combustibles', textoOficial: 'Aceites y grasas para uso industrial, ceras; lubricantes; compuestos para absorber, rociar y asentar el polvo; combustibles y materiales de alumbrado; velas y mechas de iluminación' },
  { num: 5, nombre: 'Productos farmacéuticos y veterinarios', textoOficial: 'Productos farmacéuticos, preparaciones para uso médico y veterinario; preparaciones higiénicas para uso médico; alimentos y sustancias dietéticas para uso médico o veterinario, alimentos para bebés; suplementos alimenticios para personas o animales; esparadrapos, material para apósitos; materiales para empastes dentales, cera dental; desinfectantes; preparaciones para eliminar animales dañinos; fungicidas, herbicidas' },
  { num: 6, nombre: 'Metales comunes y sus aleaciones', textoOficial: 'Metales comunes y sus aleaciones, menas; materiales de construcción metálicos; construcciones transportables metálicas; cables e hilos metálicos no eléctricos; pequeños artículos de ferretería metálicos; contenedores metálicos de almacenamiento y transporte; cajas de caudales' },
  { num: 7, nombre: 'Máquinas y máquinas herramientas', textoOficial: 'Máquinas, máquinas herramientas y herramientas mecánicas; motores, excepto motores para vehículos terrestres; acoplamientos y elementos de transmisión, excepto para vehículos terrestres; instrumentos agrícolas que no sean herramientas de mano accionadas manualmente; incubadoras de huevos; distribuidores automáticos' },
  { num: 8, nombre: 'Herramientas e instrumentos de mano', textoOficial: 'Herramientas e instrumentos de mano accionados manualmente; artículos de cuchillería, tenedores y cucharas; armas blancas; maquinillas de afeitar' },
  { num: 9, nombre: 'Aparatos científicos, informáticos y electrónicos; software', textoOficial: 'Aparatos e instrumentos científicos, de investigación, de navegación, geodésicos, fotográficos, cinematográficos, audiovisuales, ópticos, de pesaje, de medición, de señalización, de detección, de pruebas, de inspección, de salvamento y de enseñanza; aparatos e instrumentos de conducción, distribución, transformación, acumulación, regulación o control de la distribución o del consumo de electricidad; aparatos e instrumentos de grabación, transmisión, reproducción o tratamiento de sonidos, imágenes o datos; archivos multimedia grabados o descargables, software, soportes de registro y almacenamiento digitales o análogos vírgenes; mecanismos para aparatos que funcionan con monedas; cajas registradoras, dispositivos de cálculo; ordenadores y periféricos de ordenador; trajes de buceo, máscaras de buceo, tapones para los oídos para buceo, pinzas nasales para submarinistas, guantes de buceo, aparatos de respiración para la natación subacuática; extintores' },
  { num: 10, nombre: 'Aparatos médicos y quirúrgicos', textoOficial: 'Aparatos e instrumentos quirúrgicos, médicos, odontológicos y veterinarios; miembros, ojos y dientes artificiales; gafas de óptica, lentes de contacto y gafas de sol; artículos ortopédicos; material de sutura; dispositivos terapéuticos y de asistencia para personas con discapacidad; aparatos de masaje; aparatos, dispositivos y artículos de puericultura; aparatos, dispositivos y artículos para actividades sexuales' },
  { num: 11, nombre: 'Aparatos de alumbrado, calefacción, refrigeración', textoOficial: 'Aparatos e instalaciones de iluminación, calefacción, enfriamiento, producción de vapor, cocción, secado, ventilación y distribución de agua, así como instalaciones sanitarias' },
  { num: 12, nombre: 'Vehículos y medios de transporte', textoOficial: 'Vehículos; aparatos de locomoción terrestre, aérea o acuática' },
  { num: 13, nombre: 'Armas de fuego, municiones, explosivos', textoOficial: 'Armas de fuego; municiones y proyectiles; explosivos; fuegos artificiales' },
  { num: 14, nombre: 'Joyería, relojería, metales preciosos', textoOficial: 'Metales preciosos y sus aleaciones; artículos de joyería, piedras preciosas y semipreciosas; artículos de relojería e instrumentos cronométricos' },
  { num: 15, nombre: 'Instrumentos musicales', textoOficial: 'Instrumentos musicales; atriles para partituras y soportes para instrumentos musicales; batutas' },
  { num: 16, nombre: 'Papel, cartón, artículos de imprenta', textoOficial: 'Papel y cartón; productos de imprenta; material de encuadernación; fotografías; artículos de papelería y artículos de oficina, excepto muebles; adhesivos (pegamentos) de papelería o para uso doméstico; material de dibujo y material para artistas; pinceles; material de instrucción y material didáctico; hojas, películas y bolsas de materias plásticas para embalar y empaquetar; caracteres de imprenta, clichés de imprenta' },
  { num: 17, nombre: 'Caucho, goma, plásticos semielaborados', textoOficial: 'Caucho, gutapercha, goma, amianto y mica en bruto o semielaborados, así como sucedáneos de estos materiales; materias plásticas y resinas en forma extrudida utilizadas en procesos de fabricación; materiales para calafatear, estopar y aislar; tuberías, tubos y mangueras flexibles no metálicos' },
  { num: 18, nombre: 'Cuero, artículos de viaje, bolsos', textoOficial: 'Cuero y cuero de imitación; pieles de animales; artículos de equipaje y bolsas de transporte; paraguas y sombrillas de paseo; bastones; fustas, arneses y artículos de guarnicionería; collares, correas y ropa para animales' },
  { num: 19, nombre: 'Materiales de construcción no metálicos', textoOficial: 'Materiales de construcción no metálicos; tuberías rígidas no metálicas para la construcción; asfalto, pez, alquitrán y betún; construcciones transportables no metálicas; monumentos no metálicos' },
  { num: 20, nombre: 'Muebles, espejos, marcos', textoOficial: 'Muebles, espejos, marcos; contenedores no metálicos de almacenamiento o transporte; hueso, cuerno, ballena o nácar, en bruto o semielaborados; conchas; espuma de mar; ámbar amarillo' },
  { num: 21, nombre: 'Utensilios del hogar, vidrio, porcelana', textoOficial: 'Utensilios y recipientes para uso doméstico y culinario; utensilios de cocina y vajilla, excepto tenedores, cuchillos y cucharas; peines y esponjas; cepillos; materiales para fabricar cepillos; material de limpieza; vidrio en bruto o semielaborado, excepto vidrio de construcción; artículos de cristalería, porcelana y loza' },
  { num: 22, nombre: 'Cuerdas, redes, lonas, textiles fibrosos', textoOficial: 'Cuerdas y cordeles; redes; tiendas de campaña y lonas; toldos de materias textiles o sintéticas; velas de navegación; sacos de gran capacidad para transportar y almacenar productos a granel; materiales de acolchado y relleno, excepto papel, cartón, caucho o materias plásticas; materias textiles fibrosas en bruto y sus sucedáneos' },
  { num: 23, nombre: 'Hilos para uso textil', textoOficial: 'Hilos e hilados para uso textil' },
  { num: 24, nombre: 'Tejidos y ropa de hogar', textoOficial: 'Tejidos y sus sucedáneos; ropa de hogar; cortinas de materias textiles o de materias plásticas' },
  { num: 25, nombre: 'Prendas de vestir, calzado, sombrerería', textoOficial: 'Prendas de vestir, calzado, artículos de sombrerería' },
  { num: 26, nombre: 'Encajes, bordados, botones, mercería', textoOficial: 'Encajes y bordados, así como cintas y lazos de mercería; botones, ganchos y ojetes, alfileres y agujas; flores artificiales; adornos para el cabello; cabello postizo' },
  { num: 27, nombre: 'Alfombras y revestimientos de suelos', textoOficial: 'Alfombras, felpudos, esteras y esterillas, linóleo y otros revestimientos de suelos; tapices murales que no sean de materias textiles' },
  { num: 28, nombre: 'Juegos, juguetes, artículos deportivos', textoOficial: 'Juegos y juguetes; aparatos de videojuegos; artículos de gimnasia y deporte; adornos para árboles de Navidad' },
  { num: 29, nombre: 'Carne, pescado, conservas, lácteos', textoOficial: 'Carne, pescado, carne de ave y carne de caza; extractos de carne para uso culinario; frutas, verduras, hortalizas y legumbres, y algas en conserva, congeladas, secas y cocidas; jaleas, mermeladas, compotas; huevos; leche, quesos, mantequilla, yogur y otros productos lácteos; aceites y grasas para uso alimenticio' },
  { num: 30, nombre: 'Café, té, panadería, repostería', textoOficial: 'Café, té, cacao y sus sucedáneos; arroz, pastas alimenticias y fideos; tapioca y sagú; harinas y preparaciones a base de cereales; pan, productos de pastelería y confitería; chocolate; helados cremosos, sorbetes y otros helados; azúcar, miel, melaza; levadura, polvos de hornear; sal, productos para sazonar, especias, hierbas en conserva; vinagre, salsas y otros condimentos; hielo' },
  { num: 31, nombre: 'Productos agrícolas, plantas, animales vivos', textoOficial: 'Productos agrícolas, acuícolas, hortícolas y forestales en bruto y sin procesar; granos y semillas en bruto o sin procesar; frutas y verduras, hortalizas y legumbres frescas, hierbas aromáticas frescas; plantas y flores naturales; bulbos, plantones y semillas para plantar; animales vivos; productos alimenticios y bebidas para animales; malta' },
  { num: 32, nombre: 'Cervezas, aguas, bebidas sin alcohol', textoOficial: 'Cervezas; bebidas sin alcohol; aguas minerales y carbonatadas; bebidas a base de frutas y zumos de frutas; siropes y otras preparaciones para elaborar bebidas sin alcohol' },
  { num: 33, nombre: 'Bebidas alcohólicas (excepto cervezas)', textoOficial: 'Bebidas alcohólicas, excepto cervezas; preparaciones alcohólicas para elaborar bebidas' },
  { num: 34, nombre: 'Tabaco y artículos para fumadores', textoOficial: 'Tabaco y sucedáneos del tabaco; cigarrillos y puros; cigarrillos electrónicos y vaporizadores bucales para fumadores; artículos para fumadores; cerillas' },
  { num: 35, nombre: 'Publicidad, gestión comercial, venta', textoOficial: 'Publicidad; gestión, organización y administración de negocios comerciales; trabajos de oficina' },
  { num: 36, nombre: 'Seguros, finanzas, inmobiliaria', textoOficial: 'Servicios financieros, monetarios y bancarios; servicios de seguros; servicios inmobiliarios' },
  { num: 37, nombre: 'Construcción, reparación, instalación', textoOficial: 'Servicios de construcción; servicios de instalación y reparación; extracción minera, perforación de gas y de petróleo' },
  { num: 38, nombre: 'Telecomunicaciones', textoOficial: 'Servicios de telecomunicaciones' },
  { num: 39, nombre: 'Transporte, logística, almacenamiento', textoOficial: 'Transporte; embalaje y almacenamiento de mercancías; organización de viajes' },
  { num: 40, nombre: 'Tratamiento de materiales, reciclaje', textoOficial: 'Tratamiento de materiales; reciclaje de residuos y desechos; purificación del aire y tratamiento del agua; servicios de impresión; conservación de alimentos y bebidas' },
  { num: 41, nombre: 'Educación, entretenimiento, deporte, cultura', textoOficial: 'Educación; formación; servicios de entretenimiento; actividades deportivas y culturales' },
  { num: 42, nombre: 'Servicios científicos, tecnológicos, informáticos', textoOficial: 'Servicios científicos y tecnológicos, así como servicios de investigación y diseño conexos; servicios de análisis industrial, investigación industrial y diseño industrial; control de calidad y servicios de autenticación; diseño y desarrollo de hardware y software' },
  { num: 43, nombre: 'Restaurantes, gastronomía y alojamiento', textoOficial: 'Servicios de restauración (alimentación); hospedaje temporal' },
  { num: 44, nombre: 'Servicios médicos, veterinarios, de belleza', textoOficial: 'Servicios médicos; servicios veterinarios; tratamientos de higiene y de belleza para personas o animales; servicios de agricultura, acuicultura, horticultura y silvicultura' },
  { num: 45, nombre: 'Servicios jurídicos, de seguridad, personales', textoOficial: 'Servicios jurídicos; servicios de seguridad para la protección física de bienes materiales y personas; servicios de clubes de encuentro, servicios de redes sociales en línea; servicios funerarios; cuidado de niños a domicilio' },
];
