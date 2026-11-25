-- Documentos legales y bitácora de aceptaciones y consentimientos (docs/LEGAL.md).
--
-- 1. "devpware_documentos_legales": cada versión de cada documento (Términos,
--    Licencia, avisos de privacidad, Políticas comerciales, Anexo de IA e
--    Información disociada) con su texto íntegro y su huella SHA-256. Una fila
--    nunca se cambia ni se borra: una versión nueva es otra fila. "BPublicable"
--    distingue la versión que el abogado liberó de un borrador; se fija al
--    insertarla (pnpm legal:publish). Dos versiones publicadas de un mismo
--    documento no comparten número (índice único parcial).
--
-- 2. "devpware_bitacora_consentimientos": un renglón por aceptación o cambio de
--    casilla (alta, usuario previo, nueva aceptación, casillas 2 a 4), con los
--    documentos y versiones, las casillas marcadas y no marcadas, la fecha del
--    servidor con su zona horaria, la IP y la huella de la cookie de la sesión
--    de registro. Solo se inserta: se conserva diez años (CCom art. 49). Sin
--    llave foránea a la cuenta para que ninguna baja la arrastre.
--
-- 3. Columnas nuevas y opcionales: "JPerfilProfesional" en
--    "devpware_usuarios" (cédula, si la tiene, y especialidad del registro) y
--    "JRegistro" en "devpware_solicitudes_oauth" (las casillas que la persona
--    marcó en «Crear cuenta» antes de ir a Google). Ninguna fila cambia.
--
-- 4. Los textos actuales del abogado (15 nov 2026) como borradores, versión 1,
--    sin publicar; su fuente es docs/legal/<documento>.md y una prueba revisa
--    que coincidan. Todavía tienen espacios en blanco («______»).
--
-- Solo CREATE TABLE / INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS e INSERT
-- de filas nuevas. Es idempotente.

CREATE TABLE IF NOT EXISTS "devpware_documentos_legales" (
  "IdDocumentoLegal" SERIAL NOT NULL,
  "SDocumento" VARCHAR(40) NOT NULL,
  "IVersion" INTEGER NOT NULL,
  "STitulo" VARCHAR(200) NOT NULL,
  "DFechaActualizacion" DATE NOT NULL,
  "TTexto" TEXT NOT NULL,
  "SHashSha256" CHAR(64) NOT NULL,
  "BPublicable" BOOLEAN NOT NULL DEFAULT false,
  "BRequiereAceptacion" BOOLEAN NOT NULL DEFAULT true,
  "SRegistradoPor" VARCHAR(180),
  "DFechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devpware_documentos_legales_pkey" PRIMARY KEY ("IdDocumentoLegal")
);

CREATE INDEX IF NOT EXISTS "devpware_documentos_legales_SDocumento_IVersion_idx"
  ON "devpware_documentos_legales" ("SDocumento", "IVersion");

CREATE UNIQUE INDEX IF NOT EXISTS "devpware_documentos_legales_publicada_key"
  ON "devpware_documentos_legales" ("SDocumento", "IVersion")
  WHERE "BPublicable" = true;

CREATE TABLE IF NOT EXISTS "devpware_bitacora_consentimientos" (
  "IdBitacoraConsentimiento" BIGSERIAL NOT NULL,
  "UIdentificadorPublico" UUID NOT NULL DEFAULT gen_random_uuid(),
  "IdUsuario" INTEGER NOT NULL,
  "SCorreo" VARCHAR(180) NOT NULL,
  "SEvento" VARCHAR(40) NOT NULL,
  "SMetodo" VARCHAR(20) NOT NULL,
  "JDocumentos" JSONB NOT NULL,
  "JCasillas" JSONB NOT NULL,
  "JFormulario" JSONB,
  "SDireccionIP" VARCHAR(64),
  "SAgenteUsuario" TEXT,
  "SCookieSesionHash" VARCHAR(128),
  "DFechaEvento" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "SZonaHoraria" VARCHAR(64) NOT NULL DEFAULT current_setting('TimeZone'),
  CONSTRAINT "devpware_bitacora_consentimientos_pkey" PRIMARY KEY ("IdBitacoraConsentimiento")
);

CREATE UNIQUE INDEX IF NOT EXISTS "devpware_bitacora_consentimientos_UIdentificadorPublico_key"
  ON "devpware_bitacora_consentimientos" ("UIdentificadorPublico");

CREATE INDEX IF NOT EXISTS "devpware_bitacora_consentimientos_IdUsuario_DFechaEvento_idx"
  ON "devpware_bitacora_consentimientos" ("IdUsuario", "DFechaEvento" DESC);

ALTER TABLE "devpware_usuarios" ADD COLUMN IF NOT EXISTS "JPerfilProfesional" JSONB;

ALTER TABLE "devpware_solicitudes_oauth" ADD COLUMN IF NOT EXISTS "JRegistro" JSONB;

-- Términos y condiciones de uso, versión 1 (borrador).
INSERT INTO "devpware_documentos_legales" ("SDocumento", "IVersion", "STitulo", "DFechaActualizacion", "TTexto", "SHashSha256", "BPublicable", "BRequiereAceptacion", "SRegistradoPor")
SELECT 'terminos', 1, 'Términos y condiciones de uso', DATE '2026-11-15', $legal$# Términos y condiciones de uso de la plataforma Valuaxis Soft

Estos términos y condiciones (los «Términos») regulan el acceso a la plataforma Valuaxis Soft y su uso, y forman el contrato entre Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft, y cada persona que crea una cuenta. La Licencia de uso del software es un capítulo de estos Términos, no un documento aparte, y se acepta con ellos en un solo acto. Junto con estos Términos se aceptan también las Políticas comerciales y el Anexo de inteligencia artificial y uso de comparables, que forman parte del mismo contrato. El tratamiento de datos personales se rige por el Aviso de privacidad integral y el Aviso de privacidad simplificado, que se aceptan por separado.

## 1. QUIÉNES SOMOS Y OBJETO

**1.1 Proveedor.** El servicio lo presta Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft (el «Proveedor»). El nombre comercial identifica el servicio; la persona obligada frente a los Usuarios es siempre el Proveedor. Datos de identificación y contacto (LFPC art. 76 Bis, fracción III; NMX-COE-001-SCFI-2018, numeral 5.2.1.1):

1. Domicilio: ______.
2. Correo electrónico de atención: ______.
3. Teléfono y WhatsApp de atención: ______.
4. Sitio web: ______.

**1.2 Objeto.** La Plataforma es un software en línea para que el Usuario elabore sus propios avalúos de inmuebles y de maquinaria y equipo, capture información, realice cálculos y genere su Reporte.

**1.3 Lo que la Plataforma no hace.**

1. No propone factores ni valores: el Usuario los captura con su propio criterio. El catálogo de factores, cuando existe, es opcional y no contiene sugerencias.
2. No trae precargadas tablas de vidas útiles: cada Usuario carga las suyas y es responsable de sus fuentes.
3. No revisa, valida ni firma avalúos, y no sustituye el juicio profesional de quien los elabora.
4. No valúa bienes intangibles.
5. No usa la inteligencia artificial para proponer factores, valores ni conclusiones. «Pegar anuncio» propone datos de un Comparable a partir solo del texto y la liga que el Usuario pega; la Plataforma no entra por sí misma a portales de anuncios. El Usuario debe revisar los datos propuestos. Las funciones «Redactar borrador» y «Redactar resumen del apartado» están en pausa; si el Proveedor las reactiva, lo avisará conforme a la sección 15.1 y se regirán por el Anexo de inteligencia artificial y uso de comparables. El régimen de revisión humana y de datos se desarrolla en el Anexo de inteligencia artificial y uso de comparables.

**1.4 El Proveedor no presta servicios de valuación.** El Proveedor no presta servicios de valuación, no recibe encargos de valuación dentro de la Plataforma y no es parte de la relación entre el Usuario y sus clientes. El nombre comercial Valuaxis Soft identifica el software y no servicios profesionales de valuación. Ninguna otra persona o empresa es parte de estos Términos por el hecho de usar un nombre o una marca parecidos.

**1.5 Servicios de terceros integrados.** La Plataforma incluye funciones y contenido de Google Maps. El uso de esas funciones y contenido está sujeto a las versiones vigentes de los Términos de Servicio Adicionales de Google Maps/Google Earth (https://maps.google.com/help/terms_maps/) y de la Política de Privacidad de Google (https://policies.google.com/privacy). La Plataforma también usa mapas de OpenStreetMap y componentes de software de terceros, cuyas atribuciones y licencias se publican en la página «Avisos de terceros» de la Plataforma.

## 2. DEFINICIONES

Las palabras con mayúscula inicial tienen el significado siguiente, en singular o en plural, y es el mismo en el capítulo de Licencia de uso del software y en el Aviso de privacidad integral, las Políticas comerciales, el Anexo de inteligencia artificial y uso de comparables, la Política de información disociada y la Matriz de implementación:

1. Plataforma: el software en línea Valuaxis Soft para la elaboración de avalúos que el Proveedor ofrece a sus Usuarios, respecto del cual el Proveedor es titular de los derechos patrimoniales por obra por encargo (LFDA art. 83).
2. Cuenta: el espacio personal del Usuario en la Plataforma, al que accede con sus credenciales.
3. Usuario: la persona que crea una cuenta en la Plataforma, sea valuador independiente, integrante del equipo de un despacho o persona sin cédula verificada.
4. Usuario Acreditado: el Usuario cuya cédula profesional de valuador fue verificada por la Plataforma.
5. Usuario No Acreditado: el Usuario cuya cédula profesional no ha sido verificada.
6. Administrador: el Usuario que administra la cuenta de un despacho por cuenta de este, invita a otros Usuarios a trabajar en ella y les asigna permisos.
7. Valuador responsable: el Usuario, o el despacho que administra la cuenta, que decide elaborar un avalúo dentro de la Plataforma y que decide qué datos de terceros captura y para qué.
8. Avalúo: el expediente de valuación que el Usuario crea en la Plataforma, con sus datos, cálculos, imágenes y reporte.
9. Sujeto: el bien que se valúa en un Avalúo.
10. Comparable: el bien similar al Sujeto que el Usuario usa como referencia para sus cálculos.
11. Reporte: el documento en PDF que la Plataforma genera a partir del Avalúo.
12. Avalúo Disponible: el derecho a elaborar y concluir un Avalúo que el Usuario obtiene por compra individual o prueba gratuita, en los términos de las Políticas comerciales. Es la única unidad con la que se compra y se mide el saldo del Usuario en la Plataforma.
13. Contenido del Usuario: los datos, textos, imágenes y demás información que el Usuario captura o sube a la Plataforma.
14. Terceros del avalúo: el solicitante, el propietario y cualquier otra persona cuyos datos el Valuador responsable captura en un avalúo.
15. Anunciante: la persona que publicó un anuncio de un bien que el Usuario utiliza como comparable.
16. Titular: la persona a quien corresponden los datos personales (Usuario, Tercero del avalúo o Anunciante).
17. Avalúo reabierto: la versión 2 de un Avalúo concluido, con el mismo folio, que la Plataforma crea cuando se reabre conforme a la sección 10.1; la versión concluida y su Reporte se conservan sin cambios.
18. Día hábil: cualquier día de lunes a viernes, salvo los días de descanso obligatorio que señala el artículo 74 de la Ley Federal del Trabajo.

Los plazos de estos Términos se cuentan en días u horas naturales, salvo que el texto diga expresamente que se cuentan en Días hábiles.

## 3. ACEPTACIÓN Y FORMACIÓN DEL CONTRATO

**3.1 Aceptación electrónica.** El Usuario acepta estos Términos al crear su Cuenta, marcando una casilla no premarcada y pulsando el botón de registro. El contrato queda perfeccionado al recibirse la aceptación (CCom art. 80). La aceptación es un consentimiento expreso por medios electrónicos (CCF arts. 1803, fracción I, y 1834 bis) y la constancia electrónica tiene valor probatorio (CCom arts. 89 bis y 93). La aceptación de estos Términos comprende su capítulo de Licencia de uso del software y se da con una sola casilla. Es distinta de la aceptación del aviso de privacidad (NMX-COE-001-SCFI-2018, numeral 5.2.2; el Aviso de privacidad simplificado, casilla 1).

**3.2 Constancia de la aceptación.** Al aceptar, la Plataforma registra el formulario de alta con los datos de contacto e identificación del Usuario, la versión de los Términos y de los demás documentos aceptados, la fecha y la hora, la dirección IP desde la que se aceptó, el identificador de la Cuenta y la cookie de la sesión de registro. Ese registro se guarda en la base de datos propia del Proveedor. El Proveedor puede pedir otros datos cuando el servicio lo requiera. El Proveedor conserva ese registro durante diez años, plazo mínimo de conservación de los mensajes de datos en que se consignan contratos (CCom art. 49), conforme a la sección 8.3 del Aviso de privacidad integral.

**3.3 Usuarios registrados antes de la publicación.** Los Usuarios que crearon su Cuenta antes de la publicación de estos Términos deberán aceptarlos expresamente, en la forma de la sección 3.1, en su siguiente acceso para seguir usando la Plataforma.

**3.4 Idioma.** Estos Términos están redactados en español, en lenguaje claro y con caracteres legibles (LFPC art. 85).

## 4. USUARIOS ELEGIBLES, ACREDITADOS Y NO ACREDITADOS

**4.1 Quién puede registrarse.** Pueden registrarse personas mayores de edad con capacidad para contratar (CCF arts. 646 y 647), aunque no sean valuadoras, incluidas inmobiliarias. La falta de cédula verificada determina el nivel No Acreditado y no acredita competencia profesional (sección 4.2). Los servicios no se restringen solo a profesionales de la valuación. Al registrarse, el Usuario declara que es mayor de edad (NMX-COE-001-SCFI-2018, numeral 5.2.1.9). El registro no exige acreditar la cédula profesional: quien no la acredita usa la Plataforma como Usuario No Acreditado (sección 4.2).

**4.2 Usuarios Acreditados y No Acreditados.** El Usuario puede pedir que se verifique su cédula profesional; la Plataforma la verifica en el Registro Nacional de Profesionistas de la Secretaría de Educación Pública. Mientras no esté verificada, puede usar la Plataforma y concluir avalúos, pero cada Reporte que genere llevará, en pantalla y en el propio Reporte, la leyenda «Este reporte no tiene validez oficial como avalúo; no puede considerarse opinión de valor ni estimación de valor.» El Usuario No Acreditado no puede quitar ni ocultar la leyenda, y el Reporte que la lleva no es un avalúo con validez oficial (sección 6, punto 2).

## 5. CUENTA, PERFILES Y SEGURIDAD

**5.1 Registro y Cuenta.** El Usuario debe proporcionar en el formulario de alta su nombre, correo electrónico, teléfono, cédula profesional, si la tiene, y especialidad, verdaderos, completos y actualizados, y corregirlos cuando cambien. Cada Cuenta es personal: corresponde a una sola persona y no puede compartirse, prestarse ni transmitirse. El Usuario puede iniciar sesión con su cuenta de Google. El Usuario custodia sus credenciales y responde de lo que se haga con ellas. Debe avisar al Proveedor de inmediato, por los medios de la sección 1.1, si sospecha que alguien más conoce sus credenciales o usó su Cuenta.

**5.2 Equipos y permisos.** La cuenta de un despacho es del despacho, que la administra por medio de su Administrador. El Administrador puede invitar a otros Usuarios a trabajar en ella y asignarles uno de estos permisos: administrador, valuador, revisor o consulta, y les retira el acceso cuando dejan de colaborar con el despacho. El despacho responde de las personas a las que autoriza el acceso a su cuenta. Además, el Reporte admite hasta tres firmas opcionales: la de quien realiza, la de quien supervisa y la de quien autoriza el Avalúo. Ningún Avalúo requiere la revisión de un segundo valuador para concluirse. Todos los integrantes de la cuenta de un despacho tienen acceso a la información de todos los Avalúos y de todos los clientes del despacho; los permisos solo determinan lo que cada integrante puede hacer con ella. El responsable de los datos personales de los clientes del despacho y de los demás terceros que se cargan en su cuenta es el despacho, como Valuador responsable, y no cada valuador que la usa; el despacho responde de esos datos conforme a la sección 7.2, y el Proveedor actúa como persona encargada. El despacho conserva los Avalúos y la información generados por su equipo. Cuando el Administrador retira a un integrante, este pierde el acceso a la cuenta del despacho.

**5.3 Seguridad.** La Plataforma está diseñada para usarse solo en computadora. El Proveedor no garantiza su funcionamiento en teléfonos, tabletas ni ningún otro tipo de dispositivo. Las medidas de seguridad que protegen los datos personales se describen en la sección 8 del Aviso de privacidad integral (NMX-COE-001-SCFI-2018, numeral 5.2.1.11).

## 6. USO ACEPTABLE Y PROHIBICIONES

El Usuario se obliga a usar la Plataforma solo para elaborar sus propios avalúos y de forma lícita. Está prohibido:

1. Usar la Cuenta de otra persona, prestar la propia o hacerse pasar por otra persona.
2. Presentar o hacer circular un Reporte de un Usuario No Acreditado como avalúo con validez oficial, o alterar la leyenda que lo identifica.
3. Extraer de forma masiva o automatizada información de portales inmobiliarios o de otras fuentes, o pegar en «Pegar anuncio» anuncios a los que el Usuario no tenga acceso legítimo. El Usuario debe respetar las condiciones de uso de cada portal y los derechos sobre las bases de datos, incluido el requisito de autorización para acceder a información privada de las personas contenida en ellas (LFDA arts. 107 y 109).
4. Capturar datos de terceros sin estar legitimado para ello.
5. Copiar, descompilar, aplicar ingeniería inversa o intentar obtener el código de la Plataforma, en los términos del capítulo de Licencia de uso del software de estos Términos (la Licencia de uso del software, sección 17.4), salvo en los casos que la ley permita expresamente.
6. Intentar acceder a Cuentas, avalúos o datos de otros Usuarios, o eludir los permisos asignados.
7. Introducir programas maliciosos o realizar actos que afecten el funcionamiento o la seguridad de la Plataforma.
8. Usar la Plataforma para fines ilícitos o contrarios a estos Términos.
9. Cualquier otro uso que razonablemente pueda considerarse indebido, contrario a la ley o ajeno al objeto de la Plataforma descrito en la sección 1.2.

Las causas y el procedimiento de suspensión están en la sección 14.1.

## 7. CONTENIDO DEL USUARIO Y DATOS DE TERCEROS

**7.1 Contenido del Usuario.** El Contenido del Usuario es del Usuario. El Usuario autoriza al Proveedor a almacenarlo, procesarlo y mostrarlo solo en la medida necesaria para prestarle el servicio, y esa autorización termina cuando el Contenido se suprime de la Plataforma. La Plataforma solo admite imágenes (fotografías o capturas, incluso de escrituras o de boletas del impuesto predial) y no documentos completos; el Usuario conserva fuera de la Plataforma los documentos de sus expedientes. El Usuario garantiza que el Contenido del Usuario es lícito, que tiene derecho a usarlo y que, cuando incluye datos personales de terceros, los obtuvo conforme a la ley y cuenta con el consentimiento que esta exige, incluido el consentimiento expreso para datos patrimoniales, salvo las excepciones de los artículos 9 y 36 (LFPDPPP art. 7).

**7.2 Papel del Proveedor frente a los datos de terceros.** Los avisos de privacidad solo informan a los titulares; las obligaciones del Valuador responsable sobre los datos de terceros son las de esta sección. Respecto de los datos personales de solicitantes, propietarios, anunciantes de comparables y demás terceros que el Usuario captura en sus Avalúos, el Valuador responsable es el responsable del tratamiento (LFPDPPP art. 2, fracción XIV) y el Proveedor actúa como persona encargada (art. 2, fracción XII), con estas obligaciones, que constituyen el encargo:

1. Tratar esos datos solo por cuenta del Valuador responsable y para prestarle el servicio, conforme a estos Términos, que son sus instrucciones; no usarlos para fines propios ni comunicarlos a terceros, salvo a los proveedores tecnológicos identificados en la sección 6.1 del Aviso de privacidad integral, cuando actúan por cuenta del Valuador responsable o del Proveedor conforme a ese aviso, o por mandato legal.
2. Respetar la regla de acceso siguiente. El Proveedor y quienes trabajan por su cuenta solo acceden a la información de las Cuentas y al Contenido del Usuario en la medida necesaria para dar soporte, para el mantenimiento y la seguridad de la Plataforma o para cumplir un mandato legal; es la misma regla de la sección 13.
3. Aplicar las medidas de seguridad que exige la ley (el Aviso de privacidad integral, sección 8) y exigir confidencialidad a quienes intervienen en el tratamiento (LFPDPPP arts. 18 y 20).
4. Informar al Valuador responsable de las vulneraciones de seguridad que conozca y que afecten esos datos, para que este, como responsable, informe a sus titulares (LFPDPPP art. 19).
5. Trasladar al Valuador responsable las solicitudes de derechos que reciba de esos titulares (el Aviso de privacidad integral, sección 7.3).
6. Suprimir los datos al vencer el plazo de guarda de la sección 14.3, después de que el Usuario haya podido descargar sus Reportes.

El Valuador responsable, por su parte, se obliga a: (a) informar a esos titulares con su propio aviso de privacidad, incluido lo que dispone el artículo 17 de la LFPDPPP cuando los datos no se obtienen directamente de ellos; (b) recabar su consentimiento cuando la ley lo exija, incluido el consentimiento expreso para datos patrimoniales (LFPDPPP art. 7), salvo las excepciones de los artículos 9 y 36, entre ellas la de los datos que se requieren para cumplir la relación jurídica entre el titular y el Valuador responsable, como ocurre con su cliente (art. 9, fracción IV); cuando el titular no es su cliente, el Valuador responsable declara, al aceptar estos Términos, que cuenta con ese consentimiento o con una excepción legal; (c) capturar solo los datos necesarios para el Avalúo y omitir o borrar los datos de contacto de los Anunciantes cuando no los necesite (LFPDPPP art. 12), y (d) atender las solicitudes de derechos de esos titulares. Estas obligaciones del Proveedor y del Valuador responsable se pactan en estos Términos, que son el instrumento del encargo.

## 8. PRECIO, PRUEBA GRATUITA Y PAGOS

El precio de cada Avalúo, los medios de pago, la vigencia de los Avalúos Disponibles, la facturación y las devoluciones se rigen exclusivamente por las Políticas comerciales, que forman parte de estos Términos. El precio se informa antes de pagar, con impuestos incluidos (LFPC arts. 7 Bis y 76 Bis, fracción V). El servicio se paga por Avalúo: no hay paquetes prepagados, membresía ni cobros recurrentes. El derecho de revocación (NMX-COE-001-SCFI-2018, numeral 5.2.1.4) se rige por la sección 6 de las Políticas comerciales. Las fallas, errores o interrupciones de la Plataforma no dan lugar a devolución, restitución, bonificación ni compensación alguna (sección 12.2). Al registrarse en la Plataforma, el Usuario recibe tres Avalúos Disponibles de prueba sin costo, que puede usar dentro del mes siguiente a la fecha de su registro, en los términos de las Políticas comerciales.

## 9. DISPONIBILIDAD Y SOPORTE

**9.1 Disponibilidad.** El Proveedor procura que la Plataforma esté disponible de forma continua, pero no se obliga a un nivel de servicio determinado. Puede interrumpirla para mantenimiento o actualizaciones, con aviso previo cuando sea posible, y puede sufrir interrupciones por fallas de terceros proveedores o causas ajenas a él. Las interrupciones no consumen Avalúos Disponibles del Usuario (NMX-COE-001-SCFI-2018, numeral 5.2.1.2). El Proveedor no responde de las interrupciones ni de sus consecuencias (sección 12.2).

**9.2 Soporte.** El Proveedor atiende dudas y fallas por correo electrónico y por WhatsApp, en los medios de la sección 1.1, todos los Días hábiles, y responde dentro de las doce horas naturales siguientes a la recepción de la solicitud. La solicitud recibida en un día que no es Día hábil se tiene por recibida al inicio del siguiente Día hábil.

## 10. REPORTE, FIRMA Y RESPONSABILIDAD PROFESIONAL

**10.1 El Reporte es del Usuario.** El Reporte es del Usuario que elabora el Avalúo y de quienes lo firman. La Plataforma no incluye el logotipo del Proveedor en el Reporte: el Usuario puede incluir el suyo y, si no lo carga, el Reporte sale sin logotipo. El Reporte imprime el nombre, la cédula profesional y la especialidad de quien lo firma. Cuando el Usuario concluye un Avalúo, la Plataforma genera su memoria de cálculo, con las fórmulas, factores y valores usados, que se consulta y descarga con el Reporte, y el Avalúo queda bloqueado para edición y solo puede consultarse. Si hace falta corregirlo, el Valuador que lo elaboró o el Administrador del despacho puede reabrirlo: debe indicar el motivo y aceptar un texto en el que asume la responsabilidad del cambio. La Plataforma crea entonces el Avalúo reabierto, como versión 2 con el mismo folio, registra quién lo reabrió, cuándo y por qué, y conserva sin cambios la versión concluida y su Reporte. Reabrir no consume un Avalúo Disponible (las Políticas comerciales, sección 4). El Usuario puede enviar el Reporte a su cliente por correo desde la Plataforma; ese envío lo decide y lo ordena el Usuario, como responsable de los datos personales que contiene el Reporte, y el Proveedor solo lo ejecuta técnicamente, como persona encargada (sección 7.2).

**10.2 Firma.** El Usuario imprime el Reporte, lo firma a mano y lo escanea. No hay firma electrónica. No se admite como firma del Reporte una imagen de firma insertada en el archivo; el régimen es impresión y firma autógrafa.

**10.3 Responsabilidad profesional del Usuario.** El Usuario es el único responsable de sus Avalúos: de los datos, factores, criterios y valores que captura, de las conclusiones del Reporte, de su firma y del uso que haga de él. Responde de ellos frente a sus clientes y frente a terceros. La conservación de sus Reportes por el plazo que le exijan sus obligaciones profesionales corre a su cargo. El Usuario se obliga a sacar en paz y a salvo al Proveedor de las reclamaciones de sus clientes o de terceros que deriven de los Avalúos y Reportes que el propio Usuario elabora, firma o usa, y a reembolsarle los gastos razonables de defensa de esas reclamaciones. Esta obligación no comprende las reclamaciones que deriven de un incumplimiento del Proveedor de estos Términos.

## 11. PROPIEDAD INTELECTUAL

El Proveedor es titular de los derechos patrimoniales sobre la Plataforma por obra por encargo (LFDA art. 83). El uso de la Plataforma confiere únicamente las facultades previstas en el capítulo de Licencia de uso del software de estos Términos, que se otorga por escrito mediante la aceptación electrónica de estos Términos (LFDA art. 30; CCom art. 93), y no transmite al Usuario derechos patrimoniales sobre el programa. Los Avalúos, Reportes y demás Contenido del Usuario son del Usuario; el Proveedor no adquiere derechos sobre ellos.

## 12. EXCLUSIÓN DE GARANTÍAS Y DE RESPONSABILIDAD

**12.1 La Plataforma no sustituye el juicio del valuador.** La Plataforma ejecuta los cálculos con los datos y criterios que el Usuario introduce. El Proveedor no garantiza que un Avalúo sea correcto, suficiente o aceptado por un cliente, institución o autoridad, ni un resultado determinado. Las comprobaciones automáticas de la Plataforma no validan el Avalúo (el Anexo de inteligencia artificial y uso de comparables, sección 4.4). La Plataforma compara el valor que adopta el Usuario con el rango que va del treinta por ciento por debajo del menor al treinta por ciento por encima del mayor entre el promedio y la mediana de sus Comparables. Si el valor adoptado queda fuera de ese rango, la Plataforma no permite concluir el Avalúo hasta que el Usuario lo ajuste o revise sus Comparables. Un valor dentro del rango no es por eso correcto; la comprobación no valida el Avalúo y el valor adoptado es decisión y responsabilidad del Usuario (sección 10.3).

**12.2 Exclusión de responsabilidad.** La Plataforma se ofrece tal como está y según esté disponible. El Proveedor no asume responsabilidad alguna, ni durante la prueba gratuita ni en el servicio pagado, por los daños o perjuicios que el Usuario o cualquier tercero sufran por el uso de la Plataforma o por la imposibilidad de usarla, incluidos los que deriven de fallas, errores, interrupciones o caídas, de la pérdida o alteración de información, y de los cálculos, resultados, valores o Reportes que se obtengan con ella. El Proveedor no paga indemnizaciones, penas, bonificaciones ni compensaciones de ningún tipo por esas causas, sea cual sea el monto que el Usuario haya pagado. El Avalúo, su dictamen y la opinión de valor son del Usuario, que responde de ellos (sección 10.3).

**12.3 Protección al consumidor.** La Ley Federal de Protección al Consumidor y la norma NMX-COE-001-SCFI-2018 se aplican a estos Términos cuando el Usuario tenga el carácter de consumidor conforme a esa ley.

## 13. CONFIDENCIALIDAD

El Proveedor trata como confidencial la información de las Cuentas y el Contenido del Usuario, y no la difunde ni la comunica a terceros ajenos al servicio sin autorización expresa del Usuario o requerimiento de autoridad competente (LFPC art. 76 Bis, fracción I). El Proveedor y quienes trabajan por su cuenta solo acceden a la información de las Cuentas y al Contenido del Usuario en la medida necesaria para dar soporte, para el mantenimiento y la seguridad de la Plataforma o para cumplir un mandato legal. Las personas que intervienen en el desarrollo, mantenimiento y operación de la Plataforma por cuenta del Proveedor están obligadas a guardar confidencialidad, aun después de terminar su relación con él (LFPDPPP art. 20).

## 14. SUSPENSIÓN, TERMINACIÓN Y BAJA

**14.1 Suspensión.** El Proveedor puede suspender una Cuenta:

1. Por inactividad: si el Usuario no genera ningún Avalúo durante tres meses, el Proveedor le avisa por correo para que descargue sus Reportes y puede inhabilitar temporalmente la Cuenta. El Usuario puede pedir la reactivación en cualquier momento por correo electrónico, a la dirección de la sección 1.1; el Proveedor reactiva la Cuenta en un plazo máximo de doce horas naturales y el Usuario conserva su saldo.
2. Por suplantación de identidad, es decir, cuando alguien usa la Cuenta haciéndose pasar por su titular o la Cuenta se creó con la identidad de otra persona.
3. Por préstamo de la Cuenta a otra persona, en contra de la sección 5.1.
4. Por uso ilícito de la Plataforma o incumplimiento grave de la sección 6.
5. Por cancelación o contracargo de un pago ya cobrado.

Salvo en casos urgentes de seguridad o de uso ilícito, el Proveedor avisará al Usuario antes de suspender la Cuenta, le dirá la causa y le dará cinco Días hábiles para aclarar; en los casos urgentes, el aviso se da al suspender y los cinco Días hábiles corren desde ese aviso. Si el Usuario aclara la causa, el Proveedor levanta la suspensión. La suspensión no extingue los Avalúos Disponibles pagados, que se respetan en los términos de las Políticas comerciales. La suspensión impide elaborar y concluir Avalúos, pero nunca impide al Usuario entrar a su Cuenta para consultar y descargar sus Avalúos concluidos mientras dure su guarda (sección 14.3), y no suprime ningún dato. La única excepción es temporal: mientras verifica la identidad del titular ante una posible suplantación, el Proveedor puede bloquear el acceso a la Cuenta; verificada la identidad, restablece de inmediato la consulta y la descarga. Ese bloqueo tampoco suprime ningún dato.

**14.2 Terminación y baja.** El Usuario puede dar de baja su Cuenta en cualquier momento, con el flujo de baja de la propia Plataforma o por correo electrónico a la dirección de la sección 1.1. El Proveedor puede terminar estos Términos respecto de un Usuario por incumplimiento grave, previa suspensión conforme a la sección 14.1. Si el Usuario da de baja su Cuenta, conserva como saldo a favor, sin vencimiento, los Avalúos Disponibles pagados que no haya usado, y puede reactivar su Cuenta cuando quiera para usarlos. Ese saldo no se devuelve en dinero. Los efectos de la baja sobre los datos personales se rigen por las secciones 7.3 y 8.3 del Aviso de privacidad integral.

**14.3 Acceso y guarda de los Avalúos.** El Usuario conserva el acceso a su Cuenta y a la consulta de sus Avalúos aunque deje de comprar. Si da de baja su Cuenta, deja de tener acceso a ella; sus Avalúos se conservan hasta que venza su plazo de guarda y vuelve a consultarlos si reactiva la Cuenta antes de ese vencimiento. Los datos se suprimen cuando dejan de ser necesarios (LFPDPPP art. 10). Cada Avalúo se conserva en la Plataforma durante su vigencia, que no excederá de doce meses desde su conclusión. Treinta días naturales antes del vencimiento, la Plataforma avisa al Usuario por correo para que descargue o respalde su Reporte. Vencido el plazo, el Avalúo se suprime de la Plataforma.

## 15. MODIFICACIONES Y NOTIFICACIONES

**15.1 Actualizaciones de la Plataforma.** El Proveedor puede actualizar la Plataforma de forma inmediata y avisa de las actualizaciones por correo a los Usuarios. Si una actualización reduce de forma sustancial las funciones esenciales de la Plataforma descritas en estos Términos, el Usuario puede dar de baja su Cuenta conforme a la sección 14.2, sin penalización.

**15.2 Cambios a los Términos.** El Proveedor puede modificar estos Términos por cambios legales o en el servicio. Avisará cada cambio por correo a la dirección registrada y en la Plataforma, con al menos treinta días naturales de anticipación, con la nueva versión y la fecha en que entra en vigor. Los cambios que no afectan los derechos ni las obligaciones del Usuario solo requieren ese aviso. Los cambios que sí los afectan solo se aplican al Usuario si los acepta expresamente, en la forma de la sección 3.1 (CCF art. 1803, fracción I), porque la ley del consumidor no permite al Proveedor modificar el contrato de forma unilateral (LFPC art. 90, fracción I); si el Usuario no los acepta, puede dar de baja su Cuenta conforme a la sección 14.2, sin penalización. Las versiones anteriores quedan disponibles en la Plataforma. Los nuevos servicios que el Proveedor llegue a ofrecer a personas distintas de los Usuarios se regirán por condiciones adicionales.

**15.3 Notificaciones.** Las notificaciones al Usuario se envían al correo registrado en su Cuenta o se publican en ella, y surten efectos al recibirse (NMX-COE-001-SCFI-2018, numeral 5.2.1.5). Las del Usuario al Proveedor se envían al correo de la sección 1.1. Las comunicaciones comerciales se rigen por el aviso de privacidad (el Aviso de privacidad integral, sección 3.2) y el Usuario puede negarse a recibirlas (LFPC art. 76 Bis, fracción VI).

## 16. QUEJAS, LEY APLICABLE Y JURISDICCIÓN

**16.1 Quejas y aclaraciones.** El Usuario puede presentar quejas y pedir aclaraciones por correo electrónico o por WhatsApp, a los medios de la sección 1.1. El Proveedor acusará recibo y dará respuesta en un plazo máximo de quince días naturales (NMX-COE-001-SCFI-2018, numeral 5.2.1.7; LFPC art. 76 Bis, fracción III). La atención se presta en los Días hábiles de la sección 9.2, pero el plazo de respuesta corre en días naturales. Lo anterior no limita el derecho del Usuario de acudir a la Procuraduría Federal del Consumidor.

**16.2 Ley aplicable y jurisdicción.** Estos Términos se rigen por las leyes federales de los Estados Unidos Mexicanos (NMX-COE-001-SCFI-2018, numeral 5.2.1.8). Para resolver cualquier controversia sobre la interpretación o el cumplimiento de estos Términos, las partes se someten expresamente a los tribunales competentes de Guadalajara, Jalisco, y renuncian a cualquier otro fuero que pudiera corresponderles por su domicilio presente o futuro (CCom arts. 1092 y 1093). Esta sumisión no afecta la competencia de la Procuraduría Federal del Consumidor en la vía administrativa ni los derechos que la ley reconoce al Usuario y que no pueden renunciarse (LFPC art. 90, fracción VI).

## VIGENCIA DE ESTOS TÉRMINOS

Fecha de última actualización: la de su publicación en la Plataforma. Versión: la que se indique al publicarse en la Plataforma.
$legal$, '450a587473df2b5cc961c1f99ea328fec404396963a3d2bfd616fe78b752c06a', false, true, 'migración 064'
WHERE NOT EXISTS (SELECT 1 FROM "devpware_documentos_legales" WHERE "SDocumento" = 'terminos');

-- Licencia de uso del software, versión 1 (borrador).
INSERT INTO "devpware_documentos_legales" ("SDocumento", "IVersion", "STitulo", "DFechaActualizacion", "TTexto", "SHashSha256", "BPublicable", "BRequiereAceptacion", "SRegistradoPor")
SELECT 'licencia', 1, 'Licencia de uso del software', DATE '2026-11-15', $legal$# Licencia de uso del software de la plataforma Valuaxis Soft

## 17. LICENCIA DE USO DEL SOFTWARE

**17.1 Otorgamiento y relación con los Términos.** Mientras su Cuenta esté vigente, el Proveedor otorga al Usuario una licencia de uso de la Plataforma (la «Licencia»), con estas características (LFDA art. 30):

1. Es no exclusiva e intransferible.
2. Solo puede revocarse en los casos de la sección 17.10.
3. Se limita a elaborar, concluir, consultar y descargar los propios Avalúos del Usuario.

La Licencia es personal: no permite sublicenciar, ceder ni prestar el acceso a otra persona. Los integrantes del equipo de un despacho usan la Plataforma con su propia Cuenta y con los permisos que les asigna el Administrador (sección 5.2). La Licencia no está limitada a un territorio. La Licencia se otorga como parte del servicio que el Usuario contrata. El precio de los Avalúos y las reglas de compra están solo en las Políticas comerciales. Este capítulo forma parte de los Términos. Se acepta con ellos, en un solo acto, al crear la Cuenta (sección 3.1), y esa aceptación electrónica es la forma escrita de la Licencia (sección 11). En lo que este capítulo no regule se aplican las demás secciones de los Términos.

**17.2 Modalidad de software como servicio.** El Usuario accede a la Plataforma en línea, desde el navegador de una computadora (secciones 1.2 y 5.3). No recibe una copia del programa ni lo instala en sus equipos, y no tiene acceso a su código fuente ni a su código objeto.

**17.3 Titularidad de la Plataforma y del formato base.** El Proveedor es el titular de los derechos patrimoniales sobre el programa de computación de la Plataforma, que se desarrolló por su encargo (LFDA art. 83). Nada de lo dispuesto en esta Licencia transmite al Usuario derechos patrimoniales sobre el programa de computación de la Plataforma. Ese programa se protege en los mismos términos que las obras literarias (LFDA art. 102). El formato base de avalúo comprende las hojas, la estructura, los textos y las fórmulas que la Plataforma reproduce. El Proveedor declara que el formato base es de su autoría o que cuenta con la autorización de quienes participaron en su elaboración para incorporarlo a la Plataforma y licenciar su uso. El Proveedor lo pone a disposición de los Usuarios dentro de la Plataforma, y ahí su uso se rige solo por estos Términos. Las metodologías de valuación que el formato base aplica no son objeto de esta Licencia.

**17.4 Restricciones.** El derecho patrimonial sobre un programa de computación comprende la facultad de autorizar o prohibir su reproducción, su modificación, su distribución, su decompilación y su comunicación pública (LFDA art. 106). En consecuencia, salvo autorización por escrito del Proveedor, el Usuario no puede:

1. Reproducir la Plataforma o cualquiera de sus partes, de forma permanente o provisional, por cualquier medio. Se exceptúan las reproducciones provisionales que se produzcan necesariamente al usar la Plataforma desde el navegador conforme a esta Licencia.
2. Traducir, adaptar o modificar la Plataforma, ni crear programas derivados de ella.
3. Distribuir, vender, alquilar o poner a disposición de terceros la Plataforma o una copia de ella.
4. Decompilar la Plataforma, aplicarle ingeniería inversa o desensamblarla, o intentar obtener su código fuente.
5. Extraer de forma masiva o automatizada el formato base, las pantallas o los contenidos de la Plataforma, ni replicarlos en otro programa.
6. Eludir las medidas técnicas de protección de la sección 17.5.

Estas restricciones no impiden los usos que la ley permita sin autorización del titular. Las demás prohibiciones de uso de la Plataforma están en la sección 6.

**17.5 Medidas técnicas de protección y registro de uso.** El Proveedor adopta las medidas técnicas que considera adecuadas para proteger el software y las Cuentas, según el estado de la Plataforma y el riesgo, y puede modificarlas. El registro de actividad contiene datos personales del Usuario y se protege conforme a la sección 8.1 del Aviso de privacidad integral. El registro de actividad contiene datos personales del Usuario. Se protege con las medidas de seguridad de la sección 8.1 del Aviso de privacidad integral (LFPDPPP art. 18). El Proveedor no realiza auditorías en las instalaciones del Usuario.

**17.6 Plantillas y Contenido del Usuario.** La Plataforma es editable. El Usuario puede agregar o quitar apartados, campos, tablas, imágenes y fórmulas, y puede guardar sus Avalúos como plantillas para reutilizarlos, con o sin los datos capturados, a su elección. Las plantillas y configuraciones que crea el Usuario son suyas y no se mezclan con las de otros Usuarios. El Proveedor conserva sus derechos sobre el software y el formato base de la sección 17.3, aunque el Usuario los use para crear sus plantillas. La protección de una compilación no se extiende a los datos y materiales en sí mismos (LFDA art. 107). Por eso, los datos que el Usuario captura en sus plantillas y Avalúos no pasan a ser del Proveedor. Los Avalúos, los Reportes y demás Contenido del Usuario son del Usuario (secciones 7.1, 10.1 y 11), y esta Licencia no da al Proveedor ningún derecho sobre ellos. En particular, no lo autoriza a usar el Contenido del Usuario para formar bases de datos ni para fines propios. Cualquier uso futuro de información disociada se rige por la Política de información disociada.

**17.7 Componentes y contenidos de terceros.** La Plataforma funciona con servicios y componentes de terceros, cada uno sujeto a sus propios términos y licencias:

1. Hostinger, para el alojamiento de la aplicación y de la base de datos;
2. Amazon Web Services, para el almacenamiento de archivos e imágenes y el envío de correos;
3. Anthropic, para las funciones que usan inteligencia artificial (sección 1.3, punto 5, y el Anexo de inteligencia artificial y uso de comparables, sección 1.1);
4. Stripe, como pasarela de pago;
5. Google Maps y OpenStreetMap, para ubicar el bien (sección 1.5).

La lista de terceros tecnológicos y el papel de cada uno están en la sección 6.1 del Aviso de privacidad integral. Las herramientas, librerías y servicios de terceros que usa la Plataforma no son objeto de esta Licencia y se rigen por sus propias licencias, cuyas atribuciones y avisos se publican en la página «Avisos de terceros» de la Plataforma. La regresión y los demás cálculos se ejecutan dentro de la Plataforma, sin servicios externos de cálculo. La Plataforma no trae precargadas tablas de vidas útiles (sección 1.3, punto 2). Tampoco trae precargados libros de costos paramétricos, normas ni leyes. El Usuario aporta sus fuentes y responde de que puede usarlas. Los mapas y las imágenes satelitales que se muestren en la Plataforma son de terceros y se rigen por los términos de su proveedor; el uso de Google Maps se rige además por la sección 1.5.

**17.8 Marca.** El nombre comercial «Valuaxis Soft» identifica la Plataforma. Esta Licencia no concede derecho exclusivo de marca ni autoriza al Usuario a usar signos del Proveedor fuera de una referencia veraz al servicio. El Reporte no lleva el logotipo del Proveedor (sección 10.1).

**17.9 Actualizaciones.** La Licencia se extiende a cada nueva versión de la Plataforma, y el Usuario no tiene derecho a seguir usando una versión anterior. Las actualizaciones, su aviso y sus límites se rigen por la sección 15.1. Si una actualización reduce de forma sustancial las funciones esenciales, el Usuario puede darse de baja conforme a la sección 14.2, con lo que prevén las Políticas comerciales para ese caso (las Políticas comerciales, sección 6.4).

**17.10 Terminación y efectos.** La Licencia termina en estos casos:

1. Cuando el Usuario da de baja su Cuenta (sección 14.2).
2. Cuando el Proveedor termina los Términos respecto del Usuario por incumplimiento grave, previa suspensión (secciones 14.1 y 14.2).
3. Cuando el Proveedor deja de prestar el servicio.

Si el Proveedor deja de prestar el servicio, lo avisará al Usuario por correo electrónico con al menos treinta días naturales de anticipación. Durante ese plazo el Usuario puede seguir consultando y descargando sus Avalúos concluidos. Los Avalúos Disponibles pagados que no haya usado se tratarán conforme a las Políticas comerciales. Mientras dure una suspensión, la facultad de elaborar y concluir Avalúos queda suspendida, con el alcance de la sección 14.1. Al terminar la Licencia, el Usuario deja de poder elaborar Avalúos en la Plataforma. Si la Licencia termina porque el Proveedor termina los Términos respecto del Usuario (punto 2), subsiste una licencia limitada a consultar y descargar los Avalúos concluidos hasta que venza su guarda (sección 14.3). Si termina por la baja del Usuario (punto 1), el Usuario deja de tener acceso a la consulta, pero sus Avalúos concluidos se conservan hasta que venza su guarda y vuelve a consultarlos si reactiva su Cuenta antes de ese vencimiento (sección 14.3). En caso de baja, los efectos sobre los Avalúos Disponibles no usados se rigen por la sección 14.2 y por las Políticas comerciales. Los efectos sobre los datos personales se rigen por las secciones 7.3 y 8.3 del Aviso de privacidad integral. Las secciones 17.3, 17.4, 17.6 y 17.8 siguen vigentes después de la terminación.
$legal$, 'b627a6b72ded8442f9b54fa13bfa01220acf810b00d73e23624fd6c873b8f091', false, true, 'migración 064'
WHERE NOT EXISTS (SELECT 1 FROM "devpware_documentos_legales" WHERE "SDocumento" = 'licencia');

-- Aviso de privacidad integral, versión 1 (borrador).
INSERT INTO "devpware_documentos_legales" ("SDocumento", "IVersion", "STitulo", "DFechaActualizacion", "TTexto", "SHashSha256", "BPublicable", "BRequiereAceptacion", "SRegistradoPor")
SELECT 'privacidad-integral', 1, 'Aviso de privacidad integral', DATE '2026-11-15', $legal$# Aviso de privacidad integral de la plataforma Valuaxis Soft

Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft, pone a disposición de las personas usuarias de la plataforma Valuaxis Soft y de las demás personas cuyos datos se tratan en ella este aviso de privacidad integral, para informarles qué datos personales trata, para qué, con quién los comparte y cómo pueden ejercer sus derechos, conforme a los artículos 14 y 15 de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (en adelante, la «Ley»).

**Definiciones.** Para efectos de este aviso se entiende por:

1. Proveedor: Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft. El nombre comercial identifica el servicio; la persona obligada frente a los titulares es siempre el Proveedor.
2. Plataforma: el software en línea Valuaxis Soft para la elaboración de avalúos que el Proveedor ofrece a sus Usuarios y sobre el cual es titular de los derechos patrimoniales por obra por encargo (LFDA art. 83).
3. Usuario: la persona que crea una cuenta en la Plataforma, sea valuador independiente, integrante del equipo de un despacho o persona sin cédula verificada.
4. Valuador responsable: el Usuario que elabora avalúos en su propia cuenta o, en la cuenta de un despacho, el despacho, y no cada valuador que la usa; es quien decide qué datos de terceros se capturan y para qué (los Términos y condiciones de uso, sección 5.2).
5. Terceros del avalúo: el solicitante, el propietario y cualquier otra persona cuyos datos el Valuador responsable captura en un avalúo.
6. Anunciante: la persona que publicó un anuncio de un bien que el Usuario utiliza como comparable.
7. Titular: la persona a quien corresponden los datos personales (Usuario, Tercero del avalúo o Anunciante).
8. Cuenta: el espacio personal del Usuario en la Plataforma, al que accede con sus credenciales.
9. Contenido del Usuario: los datos, textos, imágenes y demás información que el Usuario captura o sube a la Plataforma.
10. Avalúo, Sujeto y Comparable: tienen el significado que les dan los Términos y condiciones de uso (sección 2).

## 1. IDENTIDAD Y DOMICILIO DEL RESPONSABLE

El responsable del tratamiento de los datos personales de los Usuarios descritos en la sección 2.1 es Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft, conforme al artículo 15, fracción I, y al artículo 2, fracción XIV, de la Ley. Domicilio para oír y recibir notificaciones relacionadas con este aviso: ______. Medios de contacto en materia de datos personales: el correo electrónico para privacidad y derechos ARCO, ______, y el sitio web de la Plataforma, ______, donde se publica este aviso. Persona designada para dar trámite a las solicitudes de los Titulares (art. 29 de la Ley): el propio Proveedor, quien las atiende a través del correo indicado. Cuando, conforme a la sección 5, el Proveedor actúe como persona encargada, el responsable de esos datos es el Valuador responsable, y el Proveedor solo los trata por su cuenta.

## 2. DATOS PERSONALES QUE TRATAMOS

**2.1 Datos de los Usuarios.** El Proveedor trata, como responsable, las siguientes categorías de datos personales de los Usuarios, que obtiene directamente de ellos al registrarse, al usar la Plataforma y al pagar (art. 15, fracción II, de la Ley):

| Categoría | Datos | Origen |
|---|---|---|
| Identificación y contacto | Nombre, correo electrónico y teléfono. | Registro y perfil |
| Datos profesionales | Número de cédula profesional, especialidad y, en su caso, datos del despacho al que pertenece. | Registro y perfil |
| Datos de equipo | Correo, nombre y permiso (administrador, valuador, revisor o consulta) de las personas que el administrador de un despacho invita a su cuenta. | Invitación del administrador |
| Pago y facturación | Medio de pago elegido (tarjeta, transferencia o efectivo), referencia y fecha de cada pago, avalúos adquiridos y, cuando se solicite, datos de facturación. Los datos de la tarjeta se capturan en la página de pago de Stripe. | Compra |
| Registro de la aceptación | El formulario de aceptación, con los datos de contacto e identificación del Usuario, la versión de los documentos aceptados, la fecha y la hora, la dirección IP, el identificador de la Cuenta y la cookie de la sesión de registro, que se guarda en la base de datos propia del Proveedor (los Términos y condiciones de uso, sección 3.2). | Alta y aceptación de cambios |
| Uso y navegación | Registro de accesos y de uso de las funciones, incluido quién usó cada función de inteligencia artificial y cuánto consumió (sección 2.5), y datos técnicos del dispositivo y del navegador (sección 9.1). | Uso de la Plataforma |
| Foto de perfil | Fotografía opcional del Usuario. | Registro y perfil |
| Acreditación profesional | Folio, cédula, nombre según la SEP, liga de verificación (la liga se borra al resolver) y, si se obtiene la constancia, la huella (hash) de la CURP que contenga; la CURP no se guarda. La huella es un dato personal seudonimizado y se trata como dato personal. | Proceso de acreditación |
| Inicio con Google | Nombre y correo electrónico que Google comunica al iniciar sesión con una cuenta de Google, cuando el Usuario elige esa opción. | Autenticación |
| Registros de seguridad | Sesiones (IP, navegador y dispositivo), intentos de acceso con IP, y bitácora de auditoría (quién hizo qué y cuándo, con IP). | Uso y seguridad |
| Soporte | Mensajes y datos que el Usuario proporciona al pedir ayuda por correo o WhatsApp. | Canales de soporte |

El Proveedor no solicita identificación oficial ni documentos para el alta. Las imágenes que el Usuario sube a la Plataforma (fotografías o capturas, incluso de escrituras o de boletas del impuesto predial) forman parte del avalúo y se rigen por la sección 2.2.

**2.2 Datos que los Usuarios capturan sobre Terceros del avalúo.** Para elaborar sus avalúos, el Valuador responsable puede capturar en la Plataforma datos de identificación y contacto del solicitante y del propietario; ubicación, coordenadas, superficies, características y valor del bien valuado; datos del impuesto predial, de escrituras, notaría y notario, registro público, clave catastral y cuenta de agua; e imágenes del bien. Estos datos no los recaba el Proveedor directamente de sus titulares: los captura el Valuador responsable dentro de su cuenta. El papel del Proveedor respecto de ellos se describe en la sección 5. El Proveedor solo accede a la información de las Cuentas en la medida necesaria para dar soporte, para el mantenimiento y la seguridad de la Plataforma o para cumplir un mandato legal (sección 5). Los datos sobre el bien ligados a su propietario (por ejemplo, su ubicación exacta y su valor) son datos personales de carácter patrimonial.

**2.3 Datos de Anunciantes de comparables.** Los Comparables pueden incluir URL, portal, fechas, contacto del Anunciante o inmobiliaria, teléfono, precio, foto y captura del anuncio. Los datos de contacto del Anunciante (nombre y teléfono) son opcionales: el Usuario solo los captura cuando los necesita para verificar el Comparable; solo los ve quien edita el Avalúo, y no se imprimen en la memoria de cálculo salvo que el Usuario decida incluirlos con ese fin (art. 12 de la Ley). Cuando identifican a una persona, se tratan conforme al papel del Proveedor de la sección 5. Para el mapa y el croquis se usan OpenStreetMap y Google Maps (sección 6.1).

**2.4 Datos sensibles y datos de menores.** El Proveedor no solicita ni trata datos personales sensibles en los términos del artículo 2, fracción VI, de la Ley, y la Plataforma no está diseñada para recabarlos. Si llegara a requerirlos, recabaría previamente el consentimiento expreso y por escrito que exige el artículo 8 de la Ley. La Plataforma está dirigida a personas mayores de edad que la usan con fines profesionales; el Proveedor no recaba de forma intencional datos de menores de edad.

**2.5 Datos que se envían al proveedor de inteligencia artificial.** «Pegar anuncio» envía al proveedor de inteligencia artificial (Anthropic, sección 6.1) solo el texto del anuncio y la liga que el Usuario pega, y devuelve una propuesta de datos para un Comparable que el Usuario debe revisar y completar antes de usarla. El texto pegado puede incluir datos del Anunciante junto con los del Comparable. La Plataforma no entra por sí misma a portales de anuncios, no busca Comparables en internet y no extrae datos de avalúos históricos. Las funciones «Redactar borrador» y «Redactar resumen del apartado» están en pausa y hoy no envían datos. Si el Proveedor las reactiva, enviarán solo el texto del campo o del apartado que el Usuario elija, que puede contener datos del Sujeto ligados a su propietario, de carácter patrimonial (sección 2.2), y el Proveedor lo informará antes conforme a la sección 9.2. El proveedor de inteligencia artificial trata esos datos solo para prestar el servicio por cuenta del Proveedor; el Proveedor no lo autoriza a usarlos para fines propios ni para entrenar modelos.

## 3. FINALIDADES DEL TRATAMIENTO

**3.1 Finalidades necesarias para la relación con el Usuario.** El Proveedor trata los datos de la sección 2.1 para las siguientes finalidades, que son necesarias para dar el servicio contratado (art. 15, fracción III, de la Ley). Las finalidades 1 a 7 derivan de la relación jurídica entre el Usuario y el Proveedor, por lo que no requieren su consentimiento (art. 9, fracción IV). La finalidad 8 se apoya en el cumplimiento de disposiciones jurídicas y de mandatos de autoridad (art. 9, fracciones I y VII), en el ejercicio de los derechos que derivan de la relación con el Usuario (art. 9, fracción IV) y, cuando implique comunicar datos a una autoridad o en un proceso judicial, en el artículo 36, fracciones V y VI.

1. Crear, administrar y mantener la cuenta del Usuario y, en su caso, la de su equipo con los permisos asignados por el administrador.
2. Dar acceso a la Plataforma y a sus funciones, incluidas la consulta de avalúos anteriores y la impresión, en el reporte, de los datos profesionales que el Usuario captura.
3. Verificar la cédula profesional cuando el Usuario lo pida, para retirar del reporte la leyenda de Usuario no acreditado (los Términos y condiciones de uso, sección 4.2).
4. Cobrar los avalúos adquiridos y registrar los pagos y el saldo a favor; la facturación se rige por las Políticas comerciales.
5. Atender solicitudes de soporte por correo y WhatsApp.
6. Enviar comunicaciones de servicio: activación de la cuenta, avisos de actualizaciones de la Plataforma, de cambios a sus términos o a este aviso y del vencimiento de la guarda de avalúos, treinta días naturales antes de que venza.
7. Mantener la seguridad de la Plataforma, prevenir accesos no autorizados, suplantaciones o préstamo de cuentas, y conservar el registro de actividad.
8. Conservar el registro de la aceptación de los términos y de este aviso, y atender requerimientos de autoridad o la defensa de los derechos del Proveedor.

**3.2 Finalidades secundarias.** Además, siempre que el Usuario lo autorice marcando la casilla correspondiente, que nunca aparecerá premarcada, el Proveedor tratará su nombre y correo electrónico para: (a) enviarle información comercial sobre nuevas funciones y promociones de la Plataforma; (b) enviarle un boletín informativo, y (c) incluir su estado y municipio en estadísticas agregadas sobre el uso de la Plataforma por ubicación, que no lo identifican. Cada finalidad tiene su propia casilla. Negarse a estas finalidades, o retirar la autorización después, no afecta el acceso a la Plataforma ni el servicio contratado. El Usuario puede retirar la autorización en cualquier momento desde la configuración de su cuenta o con el mecanismo de la sección 7.4.

**3.3 Tratamientos que no se realizan.** Fuera de las estadísticas agregadas de la sección 3.2, inciso (c), el Proveedor no utiliza los datos personales para formar bases de datos con fines estadísticos o comerciales, no los usa para entrenar modelos de inteligencia artificial y no los vende ni los cede a terceros. Las funciones de inteligencia artificial y los datos que se envían a su proveedor se describen en la sección 2.5. Si en el futuro el Proveedor pretende tratar información derivada de los avalúos para fines distintos de los aquí previstos, incluida una base de información disociada, lo hará solo después de actualizar este aviso y de que el Valuador responsable, como responsable de esos datos, obtenga el consentimiento que la Ley exija (artículo 11 de la Ley). El régimen de esa base futura está en la Política de información disociada.

## 4. CONSENTIMIENTO

**4.1 Forma del consentimiento.** Al registrarse, el Usuario recibe el aviso simplificado con un enlace a este aviso integral. El tratamiento para las finalidades de la sección 3.1 se apoya en las bases que ahí se indican (art. 9 de la Ley) y, en lo demás, en el consentimiento del Usuario, que puede ser tácito cuando, puesto a su disposición el aviso, no manifiesta su oposición, excepto cuando la Ley exige consentimiento expreso, como para datos financieros o patrimoniales (art. 7 de la Ley), con las excepciones de los artículos 9 y 36. La aceptación del aviso de privacidad se recaba en el formulario de alta, por separado de la aceptación de los términos y condiciones (los Términos y condiciones de uso, sección 3.1; el Aviso de privacidad simplificado), y el Proveedor conserva el registro descrito en la sección 2.1.

**4.2 Datos financieros y patrimoniales.** Los datos de pago y facturación del Usuario se tratan porque son necesarios para cumplir la compra que el propio Usuario solicita. El artículo 7 de la Ley exige consentimiento expreso para datos financieros o patrimoniales, «salvo las excepciones a que se refieren los artículos 9 y 36», y el artículo 9, fracción IV, es una de ellas. No se solicita una casilla adicional para ellos. Los datos patrimoniales de los Terceros del avalúo (sección 2.2) los trata el Proveedor como persona encargada (sección 5). El consentimiento expreso que la Ley exige para ellos lo recaba el Valuador responsable, como responsable, salvo las excepciones de los artículos 9 y 36 (los Términos y condiciones de uso, sección 7.2).

**4.3 Casillas por finalidad.** Cada finalidad que requiere consentimiento tiene su propia casilla, separada de las demás y no premarcada. El Usuario puede consultar y cambiar en cualquier momento, desde su cuenta, las autorizaciones que otorgó.

## 5. PAPEL DEL PROVEEDOR SEGÚN EL TIPO DE DATO

El Proveedor trata los datos con un papel distinto según su origen:

| Tipo de dato | Quién decide sobre el tratamiento | Papel del Proveedor |
|---|---|---|
| Datos de los Usuarios (sección 2.1) | El Proveedor | Responsable (art. 2, fr. XIV) |
| Datos de Terceros del avalúo capturados por el Valuador responsable (sección 2.2) | El Valuador responsable | Persona encargada (art. 2, fr. XII): los trata solo por cuenta del Valuador responsable |
| Datos de Anunciantes contenidos en anuncios que aporta el Usuario (sección 2.3) | El Valuador responsable | Persona encargada |
| Base de información disociada | No existe hoy | No aplica |

Respecto de los datos de Terceros del avalúo y de Anunciantes: (a) el Valuador responsable es quien los obtiene; le corresponde informar a sus titulares con su propio aviso de privacidad, incluido lo que dispone el artículo 17 de la Ley cuando los datos no se obtienen directamente de ellos, y, cuando proceda, recabar su consentimiento, incluido el consentimiento expreso para datos patrimoniales, salvo las excepciones de los artículos 9 y 36 (art. 7 de la Ley); (b) el Proveedor solo los almacena y procesa para que la Plataforma funcione, según el instrumento del encargo; (c) en la cuenta de un despacho, el Valuador responsable es el despacho, y no cada valuador que la usa (los Términos y condiciones de uso, sección 5.2), y (d) las obligaciones del Proveedor como persona encargada y las del Valuador responsable se pactan en los Términos y condiciones de uso (sección 7.2), que son el instrumento del encargo. El Proveedor y quienes trabajan por su cuenta solo acceden a la información de las Cuentas y al Contenido del Usuario en la medida necesaria para dar soporte, para el mantenimiento y la seguridad de la Plataforma o para cumplir un mandato legal (los Términos y condiciones de uso, secciones 7.2 y 13).

## 6. ENCARGADOS, REMISIONES Y TRANSFERENCIAS

**6.1 Encargados y proveedores tecnológicos.** Para operar la Plataforma, el Proveedor se apoya en terceros tecnológicos. Respecto de los datos de los Usuarios y, cuando actúa como persona encargada del Valuador responsable, de los datos de las secciones 2.2, 2.3 y 2.5: las personas desarrolladoras, Hostinger, Amazon Web Services y Anthropic intervienen como personas encargadas (LFPDPPP art. 2 fr. XII). Stripe actúa como responsable por cuenta propia (sección 6.3). Google, por los servicios de mapas y de inicio de sesión, trata los datos que recibe conforme a sus propios términos y a la Política de Privacidad de Google; la Plataforma solo le envía la ubicación que se consulta en el mapa, sin el nombre del propietario ni otros datos que lo identifiquen, y, cuando el Usuario elige iniciar sesión con Google, los datos de ese inicio.

| Tercero | Función | Datos que recibe | País de tratamiento |
|---|---|---|---|
| Personas desarrolladoras de la Plataforma | Desarrollo, mantenimiento y soporte técnico, con el deber de confidencialidad del artículo 20 de la Ley | Los necesarios para mantener la Plataforma | México |
| Hostinger | Alojamiento de la aplicación y de la base de datos en un servidor privado virtual | Datos de la aplicación y de la base | Puede ser fuera de México |
| Amazon Web Services | Almacenamiento privado de archivos e imágenes y envío de correos de servicio y de los reportes que el Valuador responsable decide enviar | Archivos, imágenes, correo del destinatario y contenido del envío | Puede ser fuera de México |
| Anthropic | Inteligencia artificial de «Pegar anuncio» y, si se reactivan, de «Redactar borrador» y «Redactar resumen del apartado» (sección 2.5) | El texto y la liga de los anuncios que pega el Usuario y, en las funciones de redacción, el texto que el Usuario elija | Estados Unidos |
| Google (Google Maps) | Mapas para ubicar el bien | Ubicación consultada, sin datos que identifiquen al propietario | Fuera de México |
| OpenStreetMap | Mapa base del croquis que se guarda e imprime | Coordenadas del mapa consultado | Fuera de México |
| Google (inicio de sesión) | Autenticación, cuando el Usuario elige iniciar con una cuenta de Google | Datos del inicio de sesión | Fuera de México |
| WhatsApp | Atención de solicitudes de soporte | Número y mensajes del Usuario | Fuera de México |

**6.2 Tratamiento fuera de México.** Algunos de los terceros de la sección 6.1, entre ellos Hostinger, Amazon Web Services, Anthropic, Google y WhatsApp, pueden tratar los datos en servidores ubicados fuera de México, incluidos los Estados Unidos. Si el tercero actúa como persona encargada, esa comunicación puede calificar como remisión (art. 2, fracciones XII y XX, de la Ley); si actúa como responsable por cuenta propia, puede calificar como transferencia.

**6.3 Transferencias.** Los datos de la tarjeta y del pago que el Usuario captura al comprar con tarjeta los trata Stripe, la pasarela de pago, como responsable por cuenta propia. Esa transferencia no requiere el consentimiento del Usuario porque es precisa para el cumplimiento de la relación jurídica entre el Usuario y el Proveedor (art. 36, fracción VII, de la Ley), y el Proveedor comunica a Stripe este aviso y las finalidades del tratamiento (art. 35). Fuera de ese caso, el Proveedor no transfiere datos personales a terceros distintos de los proveedores de la sección 6.1: no los comunica a instituciones financieras, autoridades ni compradores de bases de datos, salvo en los supuestos del artículo 36 de la Ley que no requieren su consentimiento, como la procuración o administración de justicia. Si en el futuro pretende realizar transferencias que requieran el consentimiento del Titular, actualizará este aviso e incluirá la cláusula para aceptarlas o rechazarlas que prevé el artículo 35 de la Ley. El envío del reporte por correo desde la Plataforma al cliente del Valuador responsable lo decide y lo ordena el Valuador responsable, como responsable de los datos que contiene; el Proveedor solo ejecuta técnicamente el envío, como persona encargada (los Términos y condiciones de uso, sección 10.1).

## 7. DERECHOS ARCO, REVOCACIÓN DEL CONSENTIMIENTO Y LIMITACIÓN DEL USO

**7.1 Derechos ARCO.** El Titular puede acceder a sus datos personales, rectificarlos cuando sean inexactos o estén incompletos, cancelarlos u oponerse a su tratamiento (derechos ARCO), en los términos de los artículos 21 a 26 de la Ley. El ejercicio de un derecho no es requisito para ejercer otro (art. 21).

**7.2 Medio y requisitos de la solicitud.** La solicitud se envía al correo para privacidad y derechos ARCO de la sección 1 y debe contener y acompañar, conforme al artículo 28 de la Ley:

1. El nombre del Titular y su domicilio o cualquier otro medio para recibir notificaciones.
2. Los documentos que acrediten la identidad del Titular o, en su caso, la personalidad e identidad de su representante.
3. La descripción clara y precisa de los datos personales respecto de los que busca ejercer alguno de los derechos ARCO, salvo que se trate del derecho de acceso.
4. La descripción del derecho ARCO que pretende ejercer, o bien, lo que solicita.
5. Cualquier otro elemento o documento que facilite la localización de los datos personales.

En las solicitudes de rectificación, el Titular indica además las modificaciones que deban realizarse y aporta la documentación que sustente su petición (art. 30).

**7.3 Plazos, forma de respuesta y costo.** El Proveedor comunicará al Titular la determinación adoptada en un plazo máximo de veinte días hábiles contados desde la fecha en que recibió la solicitud y, si resulta procedente, la hará efectiva dentro de los quince días hábiles siguientes a la fecha en que comunique la respuesta. Ambos plazos podrán ampliarse una sola vez por un periodo igual cuando lo justifiquen las circunstancias del caso (art. 31). Estos plazos son los de la Ley y se cuentan en días hábiles (art. 2, fracción VIII). La entrega de datos en ejercicio del derecho de acceso procede previa acreditación de la identidad del Titular o de su representante. La respuesta se envía por el mismo medio por el que se recibió la solicitud. El acceso se cumple poniendo los datos a disposición del Titular o entregándolos en documento electrónico (art. 32). Si la solicitud no procede, total o parcialmente, el Proveedor informará el motivo en los casos del artículo 33 de la Ley. El ejercicio de los derechos ARCO es gratuito. Solo podrán cobrarse los costos de reproducción, copias o envío, y si el Titular proporciona el medio para reproducir los datos, se le entregarán sin costo (art. 34). Cuando la cancelación proceda, los datos se bloquearán durante el plazo de prescripción de las acciones derivadas de la relación jurídica y, transcurrido este, se suprimirán, y se avisará al Titular (art. 24). El Proveedor no estará obligado a cancelar los datos en los casos del artículo 25 de la Ley, en particular cuando sean necesarios para el cumplimiento del contrato con el Usuario o deban conservarse por disposición legal. Si un Tercero del avalúo o un Anunciante dirige su solicitud al Proveedor respecto de datos en los que este actúa como persona encargada, el Proveedor le indicará que no es el responsable de esos datos; tratándose de una solicitud de acceso, con eso se tiene por cumplida (art. 32, segundo párrafo). Además, sin revelar datos de la cuenta, trasladará la solicitud al Valuador responsable para que la atienda (los Términos y condiciones de uso, sección 7.2). La baja de la cuenta, que el Usuario puede pedir con el flujo de baja de la Plataforma o por correo (los Términos y condiciones de uso, sección 14.2), se tramita como solicitud de cancelación u oposición respecto de los datos de la sección 2.1, con los plazos de esta sección y las excepciones del artículo 25 de la Ley; entre ellas, los datos necesarios para respetar el saldo a favor que el Usuario conserva y para reactivar su Cuenta (art. 25, fracción I; los Términos y condiciones de uso, sección 14.2).

**7.4 Revocación del consentimiento.** El Titular puede revocar en cualquier momento el consentimiento que haya otorgado, sin que se atribuyan efectos retroactivos a la revocación (art. 7 de la Ley). La revocación se solicita por el mismo medio y con los mismos requisitos que una solicitud ARCO y se atiende en los mismos plazos. Las autorizaciones para finalidades secundarias pueden retirarse además, de inmediato, desmarcando la casilla correspondiente en la cuenta. Si la revocación se refiere a datos indispensables para el servicio, el Proveedor informará al Usuario que no podrá seguir prestándolo.

**7.5 Opciones para limitar el uso o divulgación.** Además de los derechos ARCO y de la revocación, el Titular puede limitar el uso o divulgación de sus datos (art. 15, fracción IV, de la Ley):

1. Desmarcando en su cuenta las casillas de finalidades secundarias.
2. Pidiendo, por el correo para privacidad y derechos ARCO de la sección 1, su inscripción en el listado de exclusión del Proveedor, con lo que dejará de recibir comunicaciones no necesarias para el servicio.
3. En el caso de los Anunciantes, pidiendo al Usuario que borre sus datos de contacto del comparable, o al Proveedor que traslade esa petición al Valuador responsable.

## 8. SEGURIDAD, VULNERACIONES Y CONSERVACIÓN

**8.1 Medidas de seguridad.** El Proveedor establece y mantiene medidas de seguridad administrativas, técnicas y físicas para proteger los datos personales contra daño, pérdida, alteración, destrucción o uso, acceso o tratamiento no autorizado, tomando en cuenta el riesgo, las posibles consecuencias para los Titulares y el desarrollo tecnológico (art. 18 de la Ley). Las personas que intervienen en el tratamiento por cuenta del Proveedor guardan confidencialidad respecto de los datos, aun después de terminar su relación con él (art. 20 de la Ley).

**8.2 Vulneraciones de seguridad.** Si ocurre una vulneración de seguridad que afecte de forma significativa los derechos patrimoniales o morales de los Titulares, el Proveedor les informará de forma inmediata, por correo electrónico o por otro medio idóneo, para que puedan tomar las medidas necesarias para la defensa de sus derechos (art. 19 de la Ley). Cuando la vulneración afecte datos que el Proveedor trata como persona encargada, informará al Valuador responsable para que este informe a sus titulares (los Términos y condiciones de uso, sección 7.2).

**8.3 Conservación, bloqueo y supresión.** Los datos se conservan solo mientras son necesarios para las finalidades de este aviso; después se bloquean y, concluido el plazo de bloqueo, se suprimen (arts. 10 y 24 de la Ley):

1. Datos de la cuenta: mientras la cuenta exista. El Usuario conserva el acceso a su cuenta y a la consulta de sus avalúos aunque deje de comprar. Al cancelarse la cuenta, los datos se bloquean durante el plazo de prescripción de las acciones derivadas de la relación con el Usuario, en los términos de la ley aplicable, y luego se suprimen (art. 24 de la Ley).
2. Datos de pago y registro de la aceptación: diez años, plazo mínimo de conservación de los mensajes de datos en que se consignan contratos que prevé el artículo 49 del Código de Comercio, sin perjuicio de otros plazos legales.
3. Avalúos y datos de Terceros del avalúo: cada avalúo, con los datos de Terceros del avalúo y de Anunciantes que contiene, se conserva en la Plataforma durante su vigencia, que no excederá de doce meses desde su conclusión. Treinta días naturales antes del vencimiento, la Plataforma avisa al Usuario por correo para que descargue o respalde su reporte. Vencido el plazo, el avalúo se suprime de la Plataforma (los Términos y condiciones de uso, sección 14.3). El resguardo del reporte que el Valuador responsable deba conservar por sus propias obligaciones profesionales corre a su cargo.

## 9. COOKIES, CAMBIOS AL AVISO Y AUTORIDAD

**9.1 Cookies y tecnologías similares.** La Plataforma utiliza solo cookies técnicas indispensables para iniciar y mantener la sesión del Usuario, incluida la sesión iniciada con una cuenta de Google. No utiliza cookies de analítica ni de publicidad. Si el Proveedor llega a incorporar herramientas de analítica o de publicidad, como píxeles de Facebook o de Google, antes actualizará este aviso y habilitará un medio para rechazarlas, y no las activará sin ese medio.

**9.2 Cambios a este aviso.** El Proveedor puede modificar este aviso por cambios legales, en sus servicios o en sus prácticas de privacidad. Comunicará cualquier cambio por correo electrónico a la dirección registrada de cada Usuario y mediante la publicación de la nueva versión en la Plataforma, con la fecha de actualización y con al menos treinta días naturales de anticipación a su entrada en vigor, salvo que el cambio derive de una obligación legal de aplicación inmediata (art. 15, fracción VI, de la Ley). Cuando el cambio implique nuevas finalidades que requieran consentimiento o nuevas transferencias, el Proveedor lo recabará antes de aplicarlo.

**9.3 Autoridad competente.** Si el Titular considera que su derecho a la protección de datos personales ha sido vulnerado, puede acudir ante la Secretaría Anticorrupción y Buen Gobierno, que conoce y resuelve los procedimientos de protección de derechos (arts. 2, fracción XV, 39, fracción VI, y 40 de la Ley).

## AVISO DE PRIVACIDAD SIMPLIFICADO

En el formulario de registro se presenta el aviso de privacidad simplificado, con la información de las fracciones I a IV del artículo 15 de la Ley y el enlace a este aviso integral, conforme al artículo 16, fracción II. Su texto está en el Aviso de privacidad simplificado.

## VIGENCIA DE ESTE AVISO

Fecha de última actualización: la de su publicación en la Plataforma. Versión: la que se indique al publicarse en la Plataforma.
$legal$, '2ce0481de0cdd30d354c42625845cdab6867085f4eeb770287da11e52ed9aa63', false, true, 'migración 064'
WHERE NOT EXISTS (SELECT 1 FROM "devpware_documentos_legales" WHERE "SDocumento" = 'privacidad-integral');

-- Aviso de privacidad simplificado, versión 1 (borrador).
INSERT INTO "devpware_documentos_legales" ("SDocumento", "IVersion", "STitulo", "DFechaActualizacion", "TTexto", "SHashSha256", "BPublicable", "BRequiereAceptacion", "SRegistradoPor")
SELECT 'privacidad-simplificado', 1, 'Aviso de privacidad simplificado', DATE '2026-11-15', $legal$# Parte I. Aviso de privacidad simplificado de la plataforma Valuaxis Soft

Este aviso se presenta en el formulario de registro, con el enlace al aviso de privacidad integral, y su aceptación se da por separado de la de los términos y condiciones (los Términos y condiciones de uso, sección 3.1).

1. Responsable. Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft (el «Proveedor»), con domicilio en ______, es responsable del tratamiento de los datos personales que usted proporciona al registrarse y al usar la plataforma Valuaxis Soft (la «Plataforma»), conforme al artículo 15, fracción I, y al artículo 2, fracción XIV, de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (la «Ley»). El nombre comercial identifica el servicio; la persona obligada frente a usted es siempre el Proveedor.

Contacto en materia de datos personales: el correo electrónico para privacidad y derechos ARCO, ______.

2. Datos personales que tratamos.

Tratamos los siguientes datos de usted como persona usuaria (art. 15, fracción II, de la Ley): su nombre, correo electrónico y teléfono, y una foto opcional; datos profesionales (cédula profesional y, en su caso, datos del despacho); datos de acreditación profesional (folio, cédula, nombre según la SEP y, si se obtiene la constancia, solo la huella (hash) de la CURP, que es un dato personal seudonimizado; la CURP no se guarda); datos de las personas que el administrador de un despacho invita a su cuenta; datos de pago y facturación; el registro de su aceptación de los términos y de este aviso, con la versión aceptada, la fecha y la hora, la dirección IP, el identificador de su cuenta y la cookie de la sesión de registro, que se guarda en la base de datos propia del Proveedor (los Términos y condiciones de uso, sección 3.2); datos de uso de la Plataforma; registros de seguridad (sesiones, intentos de acceso y bitácora, con IP); datos del inicio con Google, cuando elija esa opción; y los mensajes que nos envía al pedir soporte. El detalle está en el aviso integral, secciones 2.1 a 2.3. No solicitamos datos personales sensibles. La Plataforma está dirigida a personas mayores de edad que la usan con fines profesionales. Si usted usa «Pegar anuncio», el texto y la liga del anuncio que pega se envían al proveedor de inteligencia artificial (Anthropic, en los Estados Unidos) para proponer datos de un Comparable; los datos pueden ser incompletos y requieren revisión. La Plataforma no entra por sí misma a portales de anuncios. Los Comparables pueden incluir URL, portal, fechas y, solo cuando sirvan para verificar el Comparable, el contacto y el teléfono del Anunciante. Las funciones «Redactar borrador» y «Redactar resumen del apartado» están en pausa. Los avalúos que usted elabora pueden contener datos de terceros (el solicitante, el propietario y los anunciantes de comparables), incluidos datos patrimoniales del propietario. Respecto de esos datos, usted o, en la cuenta de un despacho, el despacho decide qué se captura y para qué, y es el responsable de ellos; el Proveedor solo los almacena y procesa por su cuenta para que la Plataforma funcione, como persona encargada (art. 2, fracción XII, de la Ley), según el instrumento del encargo. A usted le corresponde informar a esas personas con su propio aviso de privacidad y, cuando proceda, recabar su consentimiento, incluido el consentimiento expreso para datos patrimoniales, salvo las excepciones de los artículos 9 y 36 (art. 7 de la Ley), según los Términos y condiciones de uso (sección 7.2). El Proveedor y quienes trabajan por su cuenta solo acceden a la información de las Cuentas y al Contenido del Usuario en la medida necesaria para dar soporte, para el mantenimiento y la seguridad de la Plataforma o para cumplir un mandato legal (los Términos y condiciones de uso, secciones 7.2 y 13).

3. Para qué usamos sus datos. Finalidades necesarias para el servicio (art. 15, fracción III, de la Ley). Las finalidades 1 a 7 derivan de la relación jurídica entre usted y el Proveedor y no requieren su consentimiento (art. 9, fracción IV). La finalidad 8 se apoya en el cumplimiento de disposiciones jurídicas y de mandatos de autoridad (art. 9, fracciones I y VII), en el ejercicio de los derechos que derivan de la relación con usted (art. 9, fracción IV) y, cuando implique comunicar datos a una autoridad o en un proceso judicial, en el artículo 36, fracciones V y VI.
1. Crear, administrar y mantener su cuenta y, en su caso, la de su equipo.
2. Darle acceso a la Plataforma y a sus funciones.
3. Verificar su cédula profesional cuando usted lo pida.
4. Cobrar los avalúos que adquiera y registrar sus pagos y saldo a favor; la facturación se rige por las Políticas comerciales.
5. Atender sus solicitudes de soporte.
6. Enviarle comunicaciones de servicio.
7. Mantener la seguridad de la Plataforma y prevenir accesos no autorizados, suplantaciones o préstamo de cuentas.
8. Conservar el registro de su aceptación y atender requerimientos de autoridad o la defensa de los derechos del Proveedor.

Finalidades secundarias. Solo si usted lo autoriza marcando la casilla correspondiente, que nunca aparece premarcada, usaremos su nombre y correo para: (a) enviarle información comercial sobre nuevas funciones y promociones de la Plataforma; (b) enviarle un boletín informativo, y (c) incluir su estado y municipio en estadísticas agregadas sobre el uso de la Plataforma por ubicación, que no lo identifican. Cada finalidad tiene su propia casilla. Si no las marca, o retira después su autorización, conserva el acceso a la Plataforma y al servicio contratado. Datos de pago. Sus datos de pago y facturación se tratan porque son necesarios para cumplir la compra que usted solicita, que es una de las excepciones al consentimiento expreso que prevé el artículo 7 (art. 9, fracción IV, de la Ley); por ello no le pediremos una casilla adicional. Fuera de las estadísticas agregadas del inciso (c), no usamos sus datos para formar bases de datos con fines estadísticos o comerciales, no los usamos para entrenar modelos de inteligencia artificial y no los vendemos ni los cedemos a terceros. Si en el futuro se pretende usar información derivada de los avalúos para otros fines, incluida una base de información disociada, se actualizará este aviso antes (la Política de información disociada).

4. Transferencias.

Los datos de la tarjeta y del pago que usted captura al comprar con tarjeta los trata Stripe, la pasarela de pago, como responsable por cuenta propia. Esa transferencia no requiere su consentimiento porque es precisa para el cumplimiento de la relación jurídica entre usted y el Proveedor (art. 36, fracción VII, de la Ley). Fuera de ese caso, no transferimos sus datos a instituciones financieras, autoridades ni compradores de bases de datos, salvo en los supuestos del artículo 36 de la Ley que no requieren su consentimiento. Si en el futuro pretendemos hacer transferencias que requieran su consentimiento, actualizaremos este aviso y le pediremos que las acepte o las rechace (art. 35 de la Ley). El envío del reporte a sus clientes desde la Plataforma lo decide y lo ordena usted; el Proveedor solo lo ejecuta técnicamente (los Términos y condiciones de uso, sección 10.1). Para operar la Plataforma intervienen Hostinger (alojamiento de la aplicación y de la base de datos), Amazon Web Services (archivos, imágenes y correo), Anthropic (inteligencia artificial), Stripe (pagos), Google Maps y OpenStreetMap (mapas), Google (inicio de sesión opcional) y WhatsApp (soporte); algunos tratan los datos fuera de México. El papel de cada tercero y el detalle de remisiones y transferencias están en el aviso integral (secciones 2.5 y 6.1).

5. Cómo negarse, revocar su consentimiento o limitar el uso de sus datos. Usted puede limitar el uso o la divulgación de sus datos (art. 15, fracción IV, de la Ley):
1. Desmarcando en su cuenta las casillas de finalidades secundarias.
2. Pidiendo, por el correo para privacidad y derechos ARCO, su inscripción en nuestro listado de exclusión, con lo que dejará de recibir comunicaciones no necesarias para el servicio.

Puede revocar en cualquier momento el consentimiento que haya otorgado, sin efectos retroactivos (art. 7 de la Ley). La revocación se solicita por el mismo medio y con los mismos requisitos que una solicitud de acceso, rectificación, cancelación u oposición (derechos ARCO), que se describen en el aviso integral. Si la revocación se refiere a datos indispensables para el servicio, le informaremos que no podremos seguir prestándolo.

6. Aviso de privacidad integral. Puede consultar el aviso de privacidad integral, que incluye la lista de proveedores, el procedimiento para ejercer sus derechos ARCO, los plazos de conservación y la forma en que le comunicaremos cambios, en el sitio web de la Plataforma, ______. Este aviso simplificado se presenta conforme al artículo 16, fracción II, de la Ley.

Fecha de última actualización: la de su publicación en la Plataforma. Versión: la misma del aviso integral, que se indique al publicarse en la Plataforma.

## PARTE II. TEXTOS DE LAS CASILLAS DEL FORMULARIO DE REGISTRO

Cada casilla aparece por separado y sin marcar. La casilla 1 se presenta junto al aviso simplificado y separada de la casilla de aceptación de los términos y condiciones (los Términos y condiciones de uso, sección 3.1). Las casillas 2, 3 y 4 pueden consultarse y cambiarse después en la sección de privacidad de la cuenta (el Aviso de privacidad integral, sección 4.3). No hay casilla para datos de pago (sección 3, «Datos de pago»).

1. Aviso de privacidad (obligatoria para registrarse): «He leído el aviso de privacidad simplificado y el aviso de privacidad integral de Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft.»
2. Información comercial, opcional: «Acepto recibir información comercial sobre nuevas funciones y promociones de la plataforma Valuaxis Soft por parte de Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft.»
3. Boletín, opcional: «Acepto recibir el boletín informativo de Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft.»
4. Estadística por ubicación, opcional: «Acepto que mi estado y municipio se incluyan en estadísticas agregadas sobre el uso de la plataforma Valuaxis Soft, que no me identifican.»
$legal$, '9b7fd9984285c836f7bbf44bf59a07f990a841054f5cf16ee491acadaf8b296f', false, true, 'migración 064'
WHERE NOT EXISTS (SELECT 1 FROM "devpware_documentos_legales" WHERE "SDocumento" = 'privacidad-simplificado');

-- Políticas comerciales, versión 1 (borrador).
INSERT INTO "devpware_documentos_legales" ("SDocumento", "IVersion", "STitulo", "DFechaActualizacion", "TTexto", "SHashSha256", "BPublicable", "BRequiereAceptacion", "SRegistradoPor")
SELECT 'politicas-comerciales', 1, 'Políticas comerciales', DATE '2026-11-15', $legal$# Políticas comerciales de la plataforma Valuaxis Soft

## POLÍTICAS COMERCIALES DE LA PLATAFORMA VALUAXIS

Estas políticas comerciales (las «Políticas») fijan el precio, la prueba gratuita, el consumo, los medios de pago, la facturación y las devoluciones del servicio que Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft (el «Proveedor»), presta mediante la plataforma Valuaxis. Su domicilio y sus medios de contacto son los de la sección 1.1 de los Términos y condiciones de uso.

Las Políticas forman parte del contrato que integran los Términos y condiciones de uso, incluido su capítulo de Licencia de uso del software, y el Anexo de inteligencia artificial y uso de comparables. Las palabras con mayúscula inicial tienen el significado que les da la sección 2 de los Términos y condiciones de uso. La Ley Federal de Protección al Consumidor y la norma NMX-COE-001-SCFI-2018 se aplican a estas Políticas cuando el Usuario tenga el carácter de consumidor conforme a esa ley (los Términos y condiciones de uso, sección 12.3).

## 1. MODELO DE COBRO Y PRECIO

**1.1 Modelo de cobro.** El servicio se cobra por Avalúo: cada Avalúo Disponible permite elaborar y concluir un Avalúo. El Usuario obtiene Avalúos Disponibles por compra (sección 3.1) o por la prueba gratuita (sección 2). No hay membresía, suscripción ni cobros automáticos recurrentes.

No se cobra por separado el uso de las funciones de inteligencia artificial (el Anexo de inteligencia artificial y uso de comparables).

**1.2 Precio.** El precio de cada Avalúo comprado de forma individual es de 170 pesos mexicanos (MXN), con el impuesto al valor agregado incluido. Este es el único documento que fija el precio; los demás remiten a esta sección.

Antes de pagar, la Plataforma muestra de forma notoria y visible el monto total a pagar, que incluye impuestos, comisiones y cualquier otro cargo que se requiera cubrir (LFPC art. 7 Bis). El Usuario conoce antes de comprar los términos, costos y formas de pago (LFPC art. 76 Bis, fracción V). El Proveedor respeta el precio y las condiciones ofrecidos al Usuario (LFPC art. 7).

## 2. PRUEBA GRATUITA

Al registrarse en la Plataforma, el Usuario recibe tres Avalúos Disponibles de prueba sin costo, que puede usar dentro del mes siguiente a la fecha de su registro. Los Avalúos Disponibles de prueba que no se usen en ese mes vencen y no generan saldo a favor ni devolución.

## 3. COMPRA Y VIGENCIA

**3.1 Compra de Avalúos Disponibles.** El Usuario compra Avalúos Disponibles por unidad, al precio de la sección 1.2. No hay paquetes prepagados.

**3.2 Vigencia y saldo a favor.** Los Avalúos Disponibles pagados que el Usuario no ha usado no vencen: se conservan sin límite de tiempo como saldo a favor del Usuario. Solo vencen los Avalúos Disponibles de prueba (sección 2).

La suspensión de la Cuenta no extingue el saldo a favor ni impide consultar y descargar los Avalúos concluidos, y el Usuario puede pedir la reactivación de una Cuenta suspendida por inactividad (los Términos y condiciones de uso, sección 14.1).

Si el Usuario da de baja su Cuenta, con el flujo de baja de la Plataforma o por correo electrónico (los Términos y condiciones de uso, sección 14.2), conserva como saldo a favor, sin vencimiento, los Avalúos Disponibles pagados que no haya usado, y puede reactivar su Cuenta cuando quiera para usarlos. Ese saldo no se devuelve en dinero.

**3.3 Acceso sin compra.** El Usuario conserva el acceso a su Cuenta y a la consulta de sus Avalúos anteriores aunque deje de comprar. La guarda de los Avalúos en la Plataforma se rige por la sección 14.3 de los Términos y condiciones de uso.

## 4. MOMENTO DEL CONSUMO

Un Avalúo Disponible se consume cuando el Usuario oprime el botón «Crear avalúo» en la Plataforma. Concluir, cancelar o reabrir un Avalúo ya creado no consume otro Avalúo Disponible. Los Avalúos Disponibles de prueba se consumen antes que los pagados.

La reapertura de un Avalúo concluido y el Avalúo reabierto se regulan en la sección 10.1 de los Términos y condiciones de uso.

## 5. MEDIOS DE PAGO Y FACTURACIÓN

**5.1 Medios de pago.** El Usuario puede pagar con tarjeta, por transferencia o con depósito en efectivo. El pago con tarjeta se procesa mediante Stripe, la pasarela de pago, que trata los datos de la tarjeta como responsable por cuenta propia (el Aviso de privacidad integral, sección 6.3) y se rige por sus propios términos (la Licencia de uso del software, sección 17.7). La página de pago identifica al Proveedor.

Para pagar por transferencia o con depósito en efectivo, el Usuario usa estos datos: banco ______; cuenta CLABE ______; titular ______. Los Avalúos Disponibles pagados por esos medios se abonan a su saldo dentro de ______ siguientes a que se confirme el pago.

Los datos de pago se tratan conforme al aviso de privacidad integral (el Aviso de privacidad integral, finalidad 4 de la sección 3.1). No se pide una casilla adicional de consentimiento para ellos (el Aviso de privacidad integral, sección 4.2).

**5.2 Facturación.** Si el Usuario requiere un comprobante fiscal digital (CFDI) de una compra, lo solicita al correo de atención de la sección 1.1 de los Términos y condiciones de uso, con sus datos fiscales. Su emisión se rige por las disposiciones fiscales aplicables.

Si se emite comprobante por una compra que después se devuelve, el mecanismo para obtener o corregir el comprobante se informa junto con el de devolución (NMX-COE-001-SCFI-2018, numeral 5.2.1.6).

## 6. REVOCACIÓN Y FALLAS

**6.1 Cuándo procede.** El Usuario puede revocar su compra, sin responsabilidad ni justificación alguna, dentro de los cinco días hábiles contados a partir de ella, respecto de los Avalúos Disponibles pagados que no haya usado. La revocación da lugar a la devolución de la cantidad pagada por ellos, con la misma forma de pago con la que se hizo la compra o con otra que el Usuario acepte (NMX-COE-001-SCFI-2018, numeral 5.2.1.4). Ese plazo es el de la norma y se cuenta en días hábiles.

Fuera de la revocación y del caso de la sección 6.5, los Avalúos Disponibles pagados que no se usan no se devuelven en dinero: se conservan como saldo a favor (sección 3.2).

**6.2 Reporte de fallas.** El Usuario puede reportar las fallas de la Plataforma por los medios de soporte de la sección 9.2 de los Términos y condiciones de uso, con el Avalúo afectado, la fecha y una descripción o captura de pantalla. El Proveedor revisa el reporte y, cuando sea posible, corrige la falla.

**6.3 Sin devolución ni compensación por fallas.** Las fallas, errores, interrupciones o caídas de la Plataforma, la pérdida de información y los resultados que se obtengan con ella no dan lugar a devolución, restitución de Avalúos Disponibles, bonificación, indemnización ni compensación alguna (los Términos y condiciones de uso, sección 12.2).

**6.4 Baja por reducción sustancial de funciones.** Si una actualización de la Plataforma reduce de forma sustancial sus funciones esenciales, el Usuario puede dar de baja su Cuenta sin penalización (los Términos y condiciones de uso, sección 15.1, y la Licencia de uso del software, sección 17.9). No hay un régimen especial para ese caso: los Avalúos Disponibles pagados que no ha usado se conservan como saldo a favor conforme a la sección 3.2.

**6.5 Cese del servicio.** Si el Proveedor deja de prestar el servicio, lo avisa al Usuario por correo electrónico con al menos treinta días naturales de anticipación, y durante ese plazo el Usuario puede seguir consultando y descargando sus Avalúos concluidos (la Licencia de uso del software, sección 17.10). En ese caso, y solo en ese, el Proveedor devuelve al Usuario la cantidad pagada por los Avalúos Disponibles pagados que no haya usado, con la misma forma de pago con la que se hizo la compra o con otra que el Usuario acepte. En la baja de la Cuenta y en los demás casos rige la sección 3.2.

## 7. CAMBIOS DE PRECIO Y COBROS RECURRENTES

**7.1 Cambios de precio.** El Proveedor puede cambiar el precio de los Avalúos. Avisará el cambio en la Plataforma y por correo con al menos un mes de anticipación. El cambio no afecta los Avalúos Disponibles ya pagados, que se respetan conforme a la sección 3.2 (LFPC art. 7).

**7.2 Cobros recurrentes.** Hoy no hay suscripción, membresía ni cobros automáticos recurrentes, ni cobro por separado de las funciones de inteligencia artificial. Si el Proveedor llega a ofrecerlos, antes de activarlos actualizará estas Políticas para informar de forma clara su periodicidad, monto y fecha de cobro, recabar el consentimiento expreso del Usuario, avisar las renovaciones con al menos cinco días naturales de anticipación y permitir cancelar la suscripción de inmediato y sin penalización (LFPC art. 76 Bis, fracciones VIII y IX).

Para dejar de usar el servicio actual basta con dar de baja la Cuenta (los Términos y condiciones de uso, sección 14.2).

## 8. QUEJAS Y JURISDICCIÓN

Las quejas y aclaraciones sobre cobros, saldos y devoluciones se presentan por los medios de la sección 16.1 de los Términos y condiciones de uso, y el Proveedor responde en un plazo máximo de quince días naturales. La ley aplicable y la jurisdicción son las de la sección 16.2 de los Términos y condiciones de uso, sin perjuicio de la competencia de la Procuraduría Federal del Consumidor.

## VIGENCIA DE ESTAS POLÍTICAS

Fecha de última actualización: la de su publicación en la Plataforma.

Versión: la que se indique al publicarse en la Plataforma.
$legal$, 'a3b08d6e2091e7ddb95566c39c3e596c21435075613ba4bf929d7f1eaa8631f3', false, true, 'migración 064'
WHERE NOT EXISTS (SELECT 1 FROM "devpware_documentos_legales" WHERE "SDocumento" = 'politicas-comerciales');

-- Anexo de inteligencia artificial y uso de comparables, versión 1 (borrador).
INSERT INTO "devpware_documentos_legales" ("SDocumento", "IVersion", "STitulo", "DFechaActualizacion", "TTexto", "SHashSha256", "BPublicable", "BRequiereAceptacion", "SRegistradoPor")
SELECT 'anexo-ia', 1, 'Anexo de inteligencia artificial y uso de comparables', DATE '2026-11-15', $legal$# Anexo de inteligencia artificial y uso de comparables de la plataforma Valuaxis Soft

Este anexo (el «Anexo») explica qué hace la inteligencia artificial en la plataforma Valuaxis Soft, qué datos se envían a su proveedor, cómo se usan los Comparables y qué revisa y decide el Usuario. Lo emite Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft (el «Proveedor»). Su domicilio y sus medios de contacto son los de la sección 1.1 de los Términos y condiciones de uso. El Anexo forma parte del contrato que integran los Términos y condiciones de uso, incluido su capítulo de Licencia de uso del software, y las Políticas comerciales, y se acepta junto con los Términos (preámbulo de los Términos y condiciones de uso). Las palabras con mayúscula inicial tienen el significado que les dan los Términos y condiciones de uso (preámbulo, sección 1.1 y sección 2 de los Términos y condiciones de uso), incluidos «Anunciante», «Titular» y «Terceros del avalúo».

## 1. QUÉ FUNCIONES USAN INTELIGENCIA ARTIFICIAL Y CUÁLES NO

**1.1 Funciones con inteligencia artificial.** «Pegar anuncio» envía al proveedor de inteligencia artificial el texto del anuncio y la liga que el Usuario pega, y devuelve una propuesta de datos para un Comparable. El Usuario debe revisar y completar los datos antes de usarlos. La Plataforma no entra por sí misma a portales de anuncios ni extrae datos de avalúos históricos. Las funciones «Redactar borrador» y «Redactar resumen del apartado» están en pausa. Si el Proveedor las reactiva, lo avisará conforme a la sección 15.1 de los Términos y condiciones de uso y operarán con las reglas de este Anexo: solo actúan cuando el Usuario las pide, sobre el texto del campo o del apartado que él elige, y su resultado es un borrador que el Usuario revisa y hace suyo. Los datos extraídos y los textos de redacción son propuestas sujetas a revisión humana; no sustituyen la decisión profesional del Usuario.

**1.2 Lo que la Plataforma no hace con inteligencia artificial.**

1. No busca Comparables por sí misma en portales inmobiliarios ni en otras fuentes.
2. No propone factores ni valores: el Usuario los captura con su propio criterio (los Términos y condiciones de uso, sección 1.3).
3. No redacta por sí misma secciones del Reporte: las funciones de redacción solo actúan cuando el Usuario las pide, sobre el texto que él capturó, y su resultado es un borrador que el Usuario revisa y hace suyo.
4. No cobra por separado el uso de la inteligencia artificial (las Políticas comerciales, sección 1.1).

Si el Proveedor activa una nueva función de inteligencia artificial, antes actualizará este Anexo para describirla, junto con los datos que use y su proveedor. Las funciones previstas para una etapa posterior, como la extracción automatizada de anuncios, una base propia de Comparables o las sugerencias de factores, no forman parte del servicio actual; si se incorporan, se describirán antes en este Anexo y en el Aviso de privacidad integral, y respetarán los términos de uso de cada portal.

**1.3 Avalúos de maquinaria y equipo.** Este Anexo se aplica igual a los Avalúos de inmuebles y a los de maquinaria y equipo, que forman parte del servicio actual (los Términos y condiciones de uso, sección 1.2).

## 2. PROVEEDOR DE INTELIGENCIA ARTIFICIAL Y DATOS QUE SE LE ENVÍAN

**2.1 Proveedor.** El proveedor de inteligencia artificial es Anthropic, que presta el servicio desde los Estados Unidos con sus modelos Claude. Trata los datos solo para prestar el servicio por cuenta del Proveedor, como persona encargada, y el Proveedor no lo autoriza a usarlos para fines propios ni para entrenar modelos (el Aviso de privacidad integral, secciones 2.5, 6.1 y 6.2).

**2.2 Datos que se envían.** El texto pegado puede contener datos de contacto del Anunciante. Si se reactivan las funciones de redacción, enviarán el texto del campo o del apartado que el Usuario elija, incluidas sus tablas. Para que el tratamiento sea el necesario, adecuado y relevante (LFPDPPP art. 12), el Usuario solo debe pegar en «Pegar anuncio» el texto de anuncios, sin añadir datos del solicitante, del propietario ni de otras personas, y, antes de pedir una redacción, debe retirar del campo o del apartado los datos de terceros que no sean necesarios para el Avalúo.

Respecto de los datos de los Anunciantes y de los Terceros del avalúo, el Valuador responsable es el responsable del tratamiento y el Proveedor actúa como persona encargada (los Términos y condiciones de uso, sección 7.2, y el Aviso de privacidad integral, sección 5). El envío al proveedor de inteligencia artificial se hace por cuenta del Valuador responsable, y Anthropic interviene como persona encargada del Proveedor (el Aviso de privacidad integral, sección 6.1; los Términos y condiciones de uso, sección 7.2, punto 1).

**2.3 Entrenamiento de modelos.** El Proveedor no usa los datos de los Usuarios, de sus Avalúos ni de los Anunciantes para entrenar modelos de inteligencia artificial (el Aviso de privacidad integral, sección 3.3).

## 3. COMPARABLES: FUENTES, IMÁGENES Y TRAZABILIDAD

**3.1 Fuentes.** Los Comparables los aporta el Usuario, a mano o con «Pegar anuncio», a partir de las fuentes que él elige. El Proveedor no garantiza que la información de esas fuentes sea exacta, completa o actual. El Usuario debe respetar las condiciones de uso de cada portal y los derechos sobre las bases de datos, y no puede extraer información de forma masiva o automatizada (los Términos y condiciones de uso, sección 6, punto 3; LFDA arts. 107 y 109).

**3.2 Fotografías y textos.** Cuando el Usuario sube a un Comparable fotografías o textos tomados de un anuncio, declara que tiene derecho a usarlos en su Avalúo y en su Reporte, y responde de ello (la Licencia de uso del software, sección 17.7). El Proveedor no adquiere derechos sobre ese material. Se recomienda al Usuario usar fotografías propias o enlazar el anuncio, y evitar imágenes en las que aparezcan personas identificables. Los Comparables que el Usuario copia de otro de sus Avalúos conservan sus imágenes.

**3.3 Referencia web y datos del Anunciante.** El Usuario puede anotar en cada Comparable la referencia web del anuncio, para acreditar de dónde tomó la información. Los datos de contacto del Anunciante (nombre y teléfono) son opcionales: el Usuario solo los captura cuando los necesita para verificar el Comparable; solo los ve quien edita el Avalúo, y no se imprimen en la memoria de cálculo salvo que el Usuario decida incluirlos con ese fin. Lo que se guarde se conserva mientras se conserve el Avalúo, es decir, durante su vigencia, que no excederá de doce meses desde su conclusión (los Términos y condiciones de uso, sección 14.3).

**3.4 Mapas y croquis.** Los mapas del Sujeto y de los Comparables se muestran con Google Maps y OpenStreetMap, y conservan la atribución de su fuente. La Plataforma no guarda imágenes de Google Maps: el croquis que se guarda en el Avalúo y se imprime en el Reporte usa el mapa de OpenStreetMap. El uso de Google Maps se rige por la sección 1.5 de los Términos y condiciones de uso.

## 4. REVISIÓN HUMANA Y RESPONSABILIDAD DEL USUARIO

**4.1 Revisión obligatoria.** Todo dato que propone «Pegar anuncio» y todo texto que redactan «Redactar borrador» y «Redactar resumen del apartado» es una propuesta. El Usuario debe revisarlo, corregirlo y confirmarlo antes de usarlo en un Avalúo, y hace suyo todo texto generado que incorpore. Las funciones pueden leer mal un anuncio, omitir datos, tomar datos desactualizados o erróneos del propio anuncio o redactar un texto inexacto.

**4.2 Responsabilidad profesional.** El Usuario decide qué Comparables usa, con qué factores y qué valor adopta, y firma y responde de su Avalúo conforme a las normas de su actividad profesional (los Términos y condiciones de uso, sección 10.3; CCF art. 2615). Ni la inteligencia artificial ni la Plataforma firman, validan ni avalan un Avalúo.

**4.3 Requisitos de los Comparables.** La Plataforma no verifica que los Comparables cumplan los requisitos periciales o metodológicos que exijan las normas, instituciones o clientes del Usuario; esa verificación le corresponde al Usuario, como parte de su responsabilidad profesional (sección 4.2).

**4.4 Validaciones automáticas.** La Plataforma hace algunas comprobaciones automáticas para evitar errores de captura. Esas comprobaciones no sustituyen la revisión del Usuario ni validan el Avalúo (los Términos y condiciones de uso, sección 12.1). La Plataforma compara el valor que adopta el Usuario con el rango que va del treinta por ciento por debajo del menor al treinta por ciento por encima del mayor entre el promedio y la mediana de sus Comparables. Si el valor adoptado queda fuera de ese rango, la Plataforma no permite concluir el Avalúo hasta que el Usuario lo ajuste o revise sus Comparables. Un valor dentro del rango no es por eso correcto; la comprobación no valida el Avalúo y el valor adoptado es decisión y responsabilidad del Usuario.

**4.5 Regresión y memoria de cálculo.** La regresión se calcula dentro de la Plataforma con los Comparables que el Usuario elige, sin servicios externos de cálculo ni inteligencia artificial. Al concluir el Avalúo, la Plataforma genera la memoria de cálculo, con las fórmulas, factores y valores usados, que el Usuario consulta y descarga con el Reporte y que se conserva mientras se conserve el Avalúo. El resultado de la regresión no se presenta como garantía de exactitud, confiabilidad superior ni aceptación del Avalúo.

La regresión y la memoria describen cálculos y su trazabilidad, no una decisión automática que valide el Avalúo.

## 5. LIMITACIONES, USUARIOS NO ACREDITADOS Y USOS PROHIBIDOS

**5.1 Limitaciones.** La inteligencia artificial puede equivocarse. El Proveedor no garantiza que los datos y textos que proponen las funciones de la sección 1.1 sean exactos ni que las fuentes de los Comparables estén actualizadas. El Proveedor no responde de los datos, textos o resultados que proponga la inteligencia artificial ni de su uso (los Términos y condiciones de uso, sección 12.2).

**5.2 Usuarios No Acreditados.** El Usuario No Acreditado puede usar las funciones de la sección 1.1 y concluir Avalúos, pero cada Reporte que genere lleva la leyenda «Este reporte no tiene validez oficial como avalúo; no puede considerarse opinión de valor ni estimación de valor.» El Usuario No Acreditado no puede quitar ni ocultar la leyenda.

**5.3 Usos prohibidos.** Además de lo previsto en la sección 6 de los Términos y condiciones de uso, está prohibido:

1. Usar en un Reporte datos o textos propuestos por las funciones de la sección 1.1 sin haberlos revisado; el Usuario revisa y hace suyo todo texto generado.
2. Presentar un Reporte como elaborado o firmado por un valuador distinto de quien lo elaboró, o usar la firma de otra persona.
3. Generar Avalúos o Comparables ficticios, o alterar datos de un anuncio para obtener un valor determinado.
4. Pegar en «Pegar anuncio» textos que no sean anuncios o que contengan datos de personas distintas del Anunciante.

## 6. TRANSPARENCIA EN EL REPORTE

El Reporte no incluye por defecto una leyenda sobre el uso de la Plataforma o de la inteligencia artificial. El Usuario puede informar a su cliente que elaboró el Avalúo con la Plataforma y que usó las funciones de la sección 1.1.

## VIGENCIA DE ESTE ANEXO

Fecha de última actualización: la de su publicación en la Plataforma. Versión: la que se indique al publicarse en la Plataforma.
$legal$, 'adf042c4a99a33e3aeb88cd80c815bd1e3bf332a4a9c065fa123a2bee56de565', false, true, 'migración 064'
WHERE NOT EXISTS (SELECT 1 FROM "devpware_documentos_legales" WHERE "SDocumento" = 'anexo-ia');

-- Política de información disociada, versión 1 (borrador).
INSERT INTO "devpware_documentos_legales" ("SDocumento", "IVersion", "STitulo", "DFechaActualizacion", "TTexto", "SHashSha256", "BPublicable", "BRequiereAceptacion", "SRegistradoPor")
SELECT 'informacion-disociada', 1, 'Política de información disociada', DATE '2026-11-15', $legal$# Política de información disociada de la plataforma Valuaxis Soft

Esta política (la «Política») la emite Álvaro Gutiérrez Navarro, persona física, con nombre comercial Valuaxis Soft (el «Proveedor»). Su domicilio y sus medios de contacto son los de la sección 1.1 de los Términos y condiciones de uso.

Las palabras con mayúscula inicial, incluidas «Titular», «Anunciante», «Terceros del avalúo», «Valuador responsable», «Comparable», «Avalúo», «Cuenta», «Contenido del Usuario» y «Plataforma», tienen el significado que les dan los Términos y condiciones de uso.

## 1. OBJETO Y ALCANCE

Esta Política informa a los Usuarios de dos cosas: el estado actual del tratamiento de la información derivada de los Avalúos, y las reglas que el Proveedor deberá cumplir si en el futuro decide crear una base de información disociada a partir de esos Avalúos.

Se publica en la Plataforma. No forma parte del acto de aceptación de los Términos y condiciones de uso, de las Políticas comerciales ni del Anexo de inteligencia artificial y uso de comparables (la Matriz de implementación, sección 0). No sustituye al Aviso de privacidad integral ni al Aviso de privacidad simplificado.

## 2. DEFINICIONES

Además de las definiciones de los Términos y condiciones de uso, en esta Política se entiende por:

1. Dato personal: cualquier información concerniente a una persona identificada o identificable. Se considera identificable cuando su identidad pueda determinarse directa o indirectamente a través de cualquier información (LFPDPPP art. 2, fracción V).
2. Disociación: el procedimiento mediante el cual los datos personales no pueden asociarse a la persona titular ni permitir, por su estructura, contenido o grado de desagregación, su identificación (LFPDPPP art. 2, fracción IX).
3. Información disociada: la que resulta de un procedimiento de disociación. Si, por su estructura, contenido o grado de desagregación, esa información aún permite identificar a una persona, o el riesgo de reidentificación es razonable, no se considera disociada y se trata como dato personal (LFPDPPP art. 2, fracciones V y IX).
4. Comparable: el bien similar al Sujeto que el Usuario usa como referencia para sus cálculos (los Términos y condiciones de uso, sección 2).

## 3. FUNDAMENTO

Esta Política se rige por la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, con su reforma publicada en el Diario Oficial de la Federación el 14 de noviembre de 2025, y por las demás normas que resulten aplicables.

La Ley define la disociación en el artículo 2, fracción IX. Los datos personales que se someten a un procedimiento previo de disociación pueden tratarse sin el consentimiento de su titular (LFPDPPP art. 9, fracción III). Eso no autoriza a tratar como disociada una información que aún permita identificar a alguien, ni a usar datos de Terceros del avalúo o de Anunciantes para una finalidad distinta de las previstas en el aviso, sin lo que exige la sección 5.

El tratamiento de datos personales se limita a las finalidades del aviso de privacidad; una finalidad distinta requiere obtener de nuevo el consentimiento del Titular (LFPDPPP art. 11) y debe ser necesaria, adecuada y relevante para esas finalidades (LFPDPPP art. 12).

## 4. ESTADO ACTUAL: NO EXISTE BASE NI USO SECUNDARIO DE LOS AVALÚOS

1. El Proveedor no tiene una base de información, disociada o no, formada con los Avalúos de los Usuarios, y no usa la información de esos Avalúos con fines estadísticos, de análisis de mercado ni comerciales (el Aviso de privacidad integral, sección 3.3).
2. El Proveedor no vende, no licencia y no da a terceros acceso a la información de los Avalúos.
3. El Proveedor no usa los datos de los Usuarios, de sus Avalúos ni de los Anunciantes para entrenar modelos de inteligencia artificial (el Aviso de privacidad integral, sección 3.3; el Anexo de inteligencia artificial y uso de comparables, sección 2.3).
4. El Proveedor no entra a ver la información de las Cuentas ni el Contenido del Usuario, salvo por instrucción o solicitud de soporte del Usuario, para atender una falla técnica, para el mantenimiento y la seguridad de la Plataforma o por mandato legal (los Términos y condiciones de uso, secciones 7.2 y 13).
5. Buscar y copiar un Comparable capturado en otro Avalúo de la misma Cuenta, incluida la cuenta de un despacho, es una función del Usuario sobre su propia información; no forma una base del Proveedor (los Términos y condiciones de uso, sección 5.2; la Matriz de implementación, sección 1.5).

La Licencia de uso del software no autoriza al Proveedor a usar el Contenido del Usuario para formar bases de datos ni para fines propios. Cualquier uso futuro de información disociada se rige por esta Política (la Licencia de uso del software, sección 17.6).

Las estadísticas agregadas por ubicación (estado y municipio del Usuario) que el Aviso de privacidad integral, sección 3.2, inciso (c), prevé solo si el Usuario las autoriza, no son una base de información disociada formada con Avalúos y se rigen por ese aviso, no por esta Política.

## 5. CONDICIONES PREVIAS PARA CREAR UNA BASE Y MODO DE DISOCIACIÓN

El Proveedor solo podrá crear una base de información derivada de los Avalúos si antes cumple todas estas condiciones:

1. Define por escrito las finalidades de la base y la lista de campos que entrarían en ella, limitada a los necesarios, adecuados y relevantes para esas finalidades (LFPDPPP art. 12).
2. Somete los datos a un procedimiento de disociación antes de que entren a la base, con un método documentado. Esta Política no describe un método concreto ni afirma que hoy se aplique alguno, porque la base no existe.
3. Evalúa por escrito el riesgo de reidentificación de la sección 7 y aplica controles antes de activar la base.
4. Actualiza el Aviso de privacidad integral y el Aviso de privacidad simplificado. Respecto de los datos de los Terceros del avalúo y de los Anunciantes, el Proveedor actúa como persona encargada y no los usa para fines propios (los Términos y condiciones de uso, sección 7.2, punto 1; el Aviso de privacidad integral, sección 5); solo podrá usarlos en la base después de que el Valuador responsable, como responsable de esos datos, obtenga el consentimiento que la Ley exija, porque se trataría de una finalidad distinta de las previstas (LFPDPPP art. 11; el Aviso de privacidad integral, sección 3.3).
5. Informa a los Usuarios, antes de que su información entre a la base, qué información se usaría y para qué, si pueden excluir sus Avalúos y si habrá alguna retribución, y obtiene su aceptación expresa de los nuevos términos.

Los datos que se someten a un procedimiento previo de disociación pueden tratarse sin el consentimiento de su titular (LFPDPPP art. 9, fracción III). Si la información conserva un riesgo razonable de identificar a una persona, no se considera disociada: se trata como dato personal, con las reglas de esta sección y de la sección 8, punto 3 (LFPDPPP arts. 2, fracciones V y IX, 11 y 12). El riesgo residual que se considera razonable se fija en la evaluación por escrito del punto 3, antes de crear la base.

## 6. USOS DE UNA BASE FUTURA

Hoy no hay usos de una base de información disociada, porque no existe (sección 4).

Si se crea, las finalidades se definirán por escrito conforme a la sección 5, punto 1, y se informarán en los avisos de privacidad y en los Términos y condiciones de uso actualizados, antes de que la información de un Usuario entre a la base. El Proveedor no usará esa base para una finalidad que no haya informado, y no la usará para entrenar modelos de inteligencia artificial salvo que, además de cumplir la sección 5, actualice el Aviso de privacidad integral y el Anexo de inteligencia artificial y uso de comparables, que hoy lo prohíben (sección 4, punto 3).

## 7. RIESGO DE REIDENTIFICACIÓN Y PROHIBICIONES

**7.1 Riesgo.** La disociación reduce el riesgo de identificar a una persona, pero no lo elimina por completo. Este riesgo es mayor en zonas con pocos inmuebles, con bienes poco comunes o cuando se combinan varios datos exactos. Por eso el Proveedor no afirma que la información disociada sea anónima de forma irreversible, y la información que conserve un riesgo razonable de identificación se trata como dato personal (sección 5).

Ejemplo ilustrativo, sin datos reales. En una zona pequeña, la combinación de un código postal, una superficie exacta y la fecha de una oferta podría bastar para saber de qué inmueble se trata y, con ello, quién es su propietario. Las fotografías de fachada y los números visibles en ellas plantean el mismo riesgo.

**7.2 Prohibición de reidentificación y de extracción masiva.** Si se crea la base, estará prohibido a los Usuarios y a cualquier tercero que acceda a ella:

1. Intentar identificar, por cualquier medio, a las personas o los bienes a los que se refiere la información disociada, o combinarla con otras fuentes para ese fin.
2. Extraer de forma masiva o automatizada la información de esa base.

Hacerlo es un uso contrario a los Términos y condiciones de uso (sección 6, puntos 8 y 9) y da lugar a la suspensión de la Cuenta conforme a la sección 14.1, punto 4, de esos Términos, sin perjuicio de la responsabilidad que corresponda conforme a la ley.

Sigue además prohibido extraer de forma masiva o automatizada información de portales inmobiliarios o de otras fuentes ajenas a la Plataforma, en los términos de la sección 6, punto 3, de los Términos y condiciones de uso.

**7.3 Comparables y evidencia pericial.** Un Comparable útil para sostener un avalúo puede necesitar datos que la disociación suprime. Qué datos debe conservar un Comparable para sostenerse en un peritaje lo decide el Usuario, como parte de su responsabilidad profesional (los Términos y condiciones de uso, sección 10.3; el Anexo de inteligencia artificial y uso de comparables, sección 4.3). La Plataforma no verifica que los Comparables cumplan esos requisitos.

## 8. TITULARIDAD Y ACCESO DE TERCEROS

Hoy no está permitido el acceso de terceros a ninguna base de información derivada de los Avalúos, porque no existe (sección 4). Si se crea, antes de ofrecerla a terceros el Proveedor deberá:

1. Precisar sobre qué tiene derechos y con qué licencias: la protección como compilación de una base de datos no se extiende a los datos y materiales en sí mismos (LFDA art. 107), y los Avalúos y demás Contenido del Usuario son del Usuario (la Licencia de uso del software, sección 17.6).
2. Fijar las condiciones de acceso, copia y uso para quien la consulte.
3. Si la información todavía permite identificar a alguien, tratar su comunicación como transferencia: comunicar al receptor el aviso de privacidad y las finalidades consentidas (LFPDPPP art. 35) y obtener el consentimiento del Titular, salvo los supuestos del artículo 36 de esa Ley.

## 9. RELACIÓN CON EL AVISO DE PRIVACIDAD

El Aviso de privacidad integral y el Aviso de privacidad simplificado rigen el tratamiento de los datos personales. Esta Política no los sustituye ni los limita.

El Aviso de privacidad integral, sección 5, deja constancia de que la base de información disociada no existe hoy. Si en el futuro el Proveedor pretende tratar información derivada de los Avalúos para fines distintos de los previstos en ese aviso, lo hará solo después de actualizarlo y de que el Valuador responsable, como responsable de los datos de Terceros del avalúo y de Anunciantes, obtenga el consentimiento que la Ley exija (el Aviso de privacidad integral, sección 3.3; esta Política, sección 5, punto 4).

Los derechos de acceso, rectificación, cancelación y oposición, la revocación del consentimiento y la limitación del uso se ejercen conforme a la sección 7 de ese aviso, respecto de los datos personales. No aplican a la información que, una vez disociada conforme a la sección 2, ya no sea dato personal.

## 10. EXCLUSIÓN VOLUNTARIA Y RETRIBUCIÓN

Hoy no hay exclusión voluntaria ni retribución porque no existe la base. Las Políticas comerciales no prevén descuentos ni pagos por aportar información. Si se crea la base, el Proveedor informará al Usuario si puede excluir sus Avalúos y si habrá retribución, conforme a la sección 5, punto 5.

## 11. CAMBIOS A ESTA POLÍTICA

El Proveedor puede modificar esta Política por cambios legales, en el servicio o en sus prácticas. Comunicará cualquier cambio por correo electrónico a la dirección registrada de cada Usuario y mediante la publicación del texto actualizado en la Plataforma, con la fecha de actualización y con al menos treinta días naturales de anticipación a su entrada en vigor, salvo que el cambio derive de una obligación legal de aplicación inmediata.

Si el cambio implica crear la base o variar las finalidades, los campos, las condiciones de acceso o los derechos de los Usuarios respecto de esa base, el Proveedor cumplirá además la sección 5, incluida la aceptación expresa de los nuevos términos (los Términos y condiciones de uso, sección 15.2).

## 12. CONTACTO

Las comunicaciones sobre esta Política se envían a los medios de la sección 1.1 de los Términos y condiciones de uso:

1. Domicilio: ______.
2. Correo electrónico de atención: ______.
3. Teléfono y WhatsApp de atención: ______.
4. Sitio web: ______.

Las solicitudes relativas a datos personales se atienden por los medios de la sección 1 del Aviso de privacidad integral.

## VIGENCIA DE ESTA POLÍTICA

Fecha de última actualización: la de su publicación en la Plataforma.
$legal$, 'c9ab3a5c86d55046006277a39a23a113b1cb244d10ca95e742e4ee2e7adf3739', false, false, 'migración 064'
WHERE NOT EXISTS (SELECT 1 FROM "devpware_documentos_legales" WHERE "SDocumento" = 'informacion-disociada');
