# Documentos legales, aceptaciones y consentimientos

Los documentos del abogado (We Law, 15 nov 2026) y lo que la plataforma hace con ellos, según la «Matriz de implementación» (que no se publica). La investigación fundatoria y la matriz **no** están en el repositorio.

## Documentos

| Clave | Documento | Se acepta |
|---|---|---|
| `terminos` | Términos y condiciones de uso | Casilla T |
| `licencia` | Licencia de uso del software (capítulo 17 de los Términos) | Casilla T, en el mismo acto |
| `politicas-comerciales` | Políticas comerciales | Casilla T |
| `anexo-ia` | Anexo de inteligencia artificial y uso de comparables | Casilla T |
| `privacidad-simplificado` | Aviso de privacidad simplificado (Parte I y textos de las casillas, Parte II) | Casilla 1, mostrado completo en el registro |
| `privacidad-integral` | Aviso de privacidad integral | Casilla 1, por enlace desde el simplificado |
| `informacion-disociada` | Política de información disociada | No se acepta; solo se publica |

- **Fuente:** `docs/legal/<clave>.md`, el texto literal del PDF (sin portada, encabezados, pies ni números de página) en markdown, con un encabezado `---` (documento, título, versión, fecha). Tres tablas del aviso integral se pasaron a tablas de markdown. Una prueba revisa que el texto de cada archivo sea, palabra por palabra, el que siembra la migración 064.
- **Almacén:** `devpware_documentos_legales` (migración 064). Cada versión es una fila con el texto íntegro y su SHA-256; **nunca se cambia ni se borra** (CCom art. 49; Términos 15.2): una corrección es otra versión. `BPublicable` distingue la versión liberada por el abogado de un borrador. `BRequiereAceptacion` dice si quien aceptó una versión anterior debe aceptar esta (Términos 15.2: solo los cambios que afectan sus derechos u obligaciones).
- **Borradores:** la migración 064 siembra la versión 1 de cada documento **sin publicar**. Todavía tienen espacios en blanco («______»): domicilio, correos, teléfono y WhatsApp, sitio web, banco, CLABE, titular y plazo de abono. En pantalla se ven marcados.
- **Versión vigente:** la publicada más reciente. Mientras un documento nunca se ha publicado (regla 1 de la matriz: nada se publica hasta que el abogado lo libere, salvo los avisos de privacidad, que deben estar disponibles desde que se recaban datos):
  - **Avisos de privacidad** (`privacidad-simplificado`, `privacidad-integral`): su borrador más reciente se muestra **marcado como borrador** (aviso arriba del texto, «borrador» junto a cada enlace, `noindex`). El simplificado aparece completo en el registro.
  - **Todos los demás** (`terminos`, `licencia`, `politicas-comerciales`, `anexo-ia`, `informacion-disociada`): su página dice **«Se publicará próximamente»**, sin nada del texto, tanto en `/legal/<clave>` como en `/legal/<clave>/v/<n>`. Los enlaces del pie y los cuatro de la casilla T abren esa página hasta que se publiquen (`canShowDraftPublicly`, `legal-documents.ts`).
  - En cuanto un documento tiene una versión publicada, sus borradores ya no se muestran.

### Páginas

- `/legal/<clave>`: la versión vigente, con su número, su fecha de actualización, la huella SHA-256 y la lista de versiones publicadas.
- `/legal/<clave>/v/<n>`: la versión publicada `n` (las anteriores siguen disponibles). Un borrador solo mientras el documento no tiene ninguna publicada, y solo de los avisos de privacidad; los demás dicen «Se publicará próximamente».
- `/legal/avisos-de-terceros`: atribuciones y licencias (`src/features/legal/third-party-notices.ts`).
- El pie de la página pública, de los documentos y de las pantallas de acceso enlaza Términos, Aviso de privacidad, Políticas comerciales, Anexo de IA, Información disociada y Avisos de terceros (`legal-links.ts`).

## Registro (matriz 1.1 y 2)

«Crear cuenta» pide nombre, apellidos, correo, teléfono, cédula profesional (si la tiene), especialidad, organización y contraseña. Debajo, el **aviso simplificado, Parte I, completo** (el borrador marcado, mientras no se publique) (en un recuadro con desplazamiento, con su versión y el enlace al integral), y las casillas, todas **sin marcar** al cargar y cada una por separado:

1. «Declaro que soy mayor de edad.» (Términos 4.1; texto de pantalla, versión 1).
2. **Casilla 1**: el texto literal de la Parte II, casilla 1, de la versión mostrada, con enlace al aviso integral.
3. **Casilla T**: «He leído y acepto los Términos y condiciones de uso, que incluyen la Licencia de uso del software, las Políticas comerciales y el Anexo de inteligencia artificial y uso de comparables.», con los cuatro enlaces. **La matriz deja su redacción a We Law**: es un texto provisional (texto de pantalla, versión 1) hasta que lo manden.
4. **Casillas 2, 3 y 4** (opcionales, en un recuadro aparte): los textos literales de la Parte II.

«Crear cuenta» y «Continuar con Google» se activan solo con la edad, la casilla 1 y la casilla T; pulsar uno es el acto de aceptación. Mientras un documento de la casilla T no está publicado, su enlace abre «Se publicará próximamente» y la aceptación se registra con esa versión como borrador (`publicable: false`). Si una versión cambió mientras se llenaba el formulario, se rechaza y se pide revisar la nueva. Con Google, las casillas y el perfil viajan con la solicitud OAuth (`devpware_solicitudes_oauth.JRegistro`) y se registran al crearse la cuenta. Entrar con Google desde «Iniciar sesión» sin cuenta previa no registra aceptación: esa cuenta pasa por `/aceptar-documentos` en cuanto la aceptación sea obligatoria.

El registro siempre pide las casillas 1 y T, haya o no documentos publicados: no bloquea a nadie y deja la constancia. Lo que cambia con la publicación es solo si las cuentas que no aceptaron las versiones publicadas quedan detenidas (abajo).

El teléfono se guarda en `devpware_usuarios.STelefono` (sin verificar) y la cédula y la especialidad en `devpware_usuarios.JPerfilProfesional` (migración 064).

## Bitácora (matriz 3.2 y 2.1)

`devpware_bitacora_consentimientos`, un renglón por aceptación o cambio de casilla:

| Campo | Contenido |
|---|---|
| `SEvento` | `ALTA`, `ACEPTACION_USUARIO_PREVIO`, `NUEVA_ACEPTACION` o `CAMBIO_CASILLAS` |
| `IdUsuario`, `SCorreo` | La cuenta y su correo en ese momento |
| `SMetodo` | `LOCAL` (correo y contraseña), `GOOGLE` o `CUENTA` (con sesión) |
| `JDocumentos` | Cada documento con su versión, si estaba publicado o era borrador, su SHA-256 y su id; más `textos-de-pantalla` (casilla T y edad) |
| `JCasillas` | Todas las casillas, marcadas y no: `privacidad`, `terminos`, `mayorDeEdad`, `comercial`, `boletin`, `estadistica` |
| `JFormulario` | En el alta: nombre, apellidos, correo, teléfono, cédula, especialidad y organización (nunca la contraseña) |
| `DFechaEvento`, `SZonaHoraria` | Reloj de la base de datos, con su zona horaria |
| `SDireccionIP`, `SAgenteUsuario` | IP y navegador del acto |
| `SCookieSesionHash` | SHA-256 de la cookie de la sesión de registro (`valuaxis_registro`, 1 h, solo en `/registro`) o, con sesión, de `valuaxis_session` (la misma huella que `devpware_sesiones.STokenHash`) |

- **Solo se agrega.** El código no actualiza ni borra renglones de la bitácora ni de las versiones; una prueba lo revisa. No tiene llave foránea a la cuenta, para que ninguna baja la arrastre.
- **Conservación: diez años** (CCom art. 49; aviso integral 8.3, punto 2). Ningún proceso la depura; si algún día se depura, solo lo que pase de diez años.
- **Sello NOM-151:** apagado (matriz 3.2, regla 4).
- Una aceptación con borradores (`publicable: false`) **no** cuenta como aceptación de una versión publicada.

## Cuentas previas y cambios (matriz 1.2 y 3.1)

Con `LEGAL_ACCEPTANCE_REQUIRED=true`, `requireSession` revisa en cada página privada si la cuenta debe algo: por cada documento de la casilla 1 y de la casilla T, la versión publicada más reciente que pide aceptación. Si no la aceptó (ni una posterior), la página lleva a `/aceptar-documentos`: el aviso simplificado completo, la lista de lo que cambió, la casilla 1, la casilla T y, si nunca la declaró, la edad. No llega a ninguna otra página interna sin aceptar; siempre puede cerrar sesión. Las casillas 2 a 4 no se piden ahí: se quedan como estaban. Aceptar registra `ACEPTACION_USUARIO_PREVIO` (primera vez) o `NUEVA_ACEPTACION`.

Con la variable apagada (por omisión) nadie queda detenido, aunque haya documentos publicados.

Las rutas de API no revisan la aceptación (solo las páginas): una cuenta detenida no tiene pantallas para usarlas.

## «Mi cuenta» → «Privacidad» (matriz 1.10)

- Casillas 2, 3 y 4 con sus textos literales: marcarlas o desmarcarlas aplica en ese momento y deja un renglón `CAMBIO_CASILLAS` con todas las casillas. Hoy la plataforma no envía información comercial ni boletín ni arma estadísticas; cuando lo haga, debe leer `getOptionalConsents` en el momento del envío.
- Cada aceptación y cambio con su fecha (hora del centro de México) y las versiones, cada una con su enlace.
- Derechos ARCO: el correo sale del aviso integral vigente (sección 1); mientras tenga el espacio en blanco dice «se publicará con el aviso de privacidad».
- Cookies: `valuaxis_session` (8 h desde la última actividad, hasta 7 días), `valuaxis_oauth` (10 min, solo al entrar con Google) y `valuaxis_registro` (1 h, solo al crear la cuenta). No hay analítica ni publicidad; si se agregan píxeles, antes se actualiza el aviso y se pone un banner para rechazarlos (matriz 1.10).

## Publicar (lo hace una persona)

Ver [OPERACION.md](OPERACION.md) §19. En resumen:

1. Pablo (We Law) libera la versión publicable de cada documento y Álvaro llena los espacios en blanco.
2. Se copia el texto al archivo de cada documento (el de `docs/legal/` es el modelo) y se revisa en `pnpm legal:publish <clave> <archivo>` (simulación).
3. `pnpm legal:publish <clave> <archivo> --apply`. El script rechaza un texto con «______». Primero los dos avisos de privacidad (se publican desde que se recaban datos), los demás cuando la plataforma ya hace lo que describen (regla 1 de la matriz).
4. Con los seis documentos de la aceptación publicados, `LEGAL_ACCEPTANCE_REQUIRED=true` y recrear la app: cada cuenta previa los acepta en su siguiente acceso.
5. Un cambio posterior: nueva versión con `pnpm legal:publish`; con `--sin-nueva-aceptacion` si no toca derechos ni obligaciones. Los avisos por correo de los cambios (Términos 15.2, aviso integral 9.2) todavía no son automáticos: se mandan a mano.
