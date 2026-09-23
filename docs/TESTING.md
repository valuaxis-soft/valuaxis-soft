# Testing

Sistema agregado:

```bash
pnpm test
```

Usa `node:test` via `tsx --test` sin dependencias nuevas.

Pruebas actuales:

- registro central de secciones;
- normalizacion de claves;
- checksum de storage;
- validacion de MIME;
- validacion de tamano.
- politicas de permisos;
- limites de uso;
- proveedor de mapas de desarrollo.
- proveedor Amazon SES con cliente mockeado;
- seleccion de proveedor de email;
- validacion de variables faltantes para SES.
- proveedor Google OAuth con mocks:
  - scopes minimos;
  - callback exacto;
  - variables faltantes;
  - URL sin client secret;
  - intercambio de `code` en servidor.

Pendiente:

- pruebas de integracion OAuth con repositorios mockeados;
- pruebas de autorizacion multi-organizacion;
- pruebas de guardado de secciones;
- pruebas de comparables/snapshots;
- pruebas de exportacion PDF con permisos/pagos.

## Prueba manual Google OAuth

Escenarios esperados:

1. Usuario nuevo con Google.
2. Usuario existente con correo manual que luego entra con Google.
3. Segundo login con la misma cuenta Google.
4. Usuario cancela consentimiento.
5. State invalido.
6. Usuario bloqueado.
7. Usuario con varias organizaciones.
8. Logout despues de Google.
9. Login manual despues de vincular Google.
10. Recuperacion de contrasena despues de vincular Google.
