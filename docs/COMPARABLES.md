# Comparables

Estado real al 23 de septiembre de 2026: **el módulo no está implementado.**

- No hay forma de crear comparables desde la aplicación.
- El workspace solo muestra, en modo lectura, los comparables que ya estén ligados al avalúo en la base de datos (`ComparableAvaluo`).
- El esquema tiene el modelo completo (`Propiedad`, `DireccionPropiedad`, `PublicacionPropiedad`, `ComparableAvaluo`, factores, ajustes, búsquedas geográficas con PostGIS), pero el código solo lee `ComparableAvaluo` con sus relaciones.

El módulo se construye en Fase 1: captura con fotografías y contacto, carga por archivo, extracción de fuentes acordadas y homologación. La metodología está en [fase0/metodologia/02-mercado-homologacion.md](fase0/metodologia/02-mercado-homologacion.md).
