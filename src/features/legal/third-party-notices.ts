/**
 * «Avisos de terceros» (/legal/avisos-de-terceros): the attributions and
 * licenses of the components and services the platform uses (Terms 1.5;
 * License 17.7). The page lists exactly this; the full license inventory is
 * completed here.
 */

export type ThirdPartyNotice = {
  name: string;
  /** What the platform uses it for. */
  use: string;
  /** The attribution or license as it must read. */
  notice: string;
  url: string;
};

export const THIRD_PARTY_NOTICES: readonly ThirdPartyNotice[] = [
  {
    name: "OpenStreetMap",
    use: "Mapa base del croquis y calles cercanas al inmueble.",
    notice: "© colaboradores de OpenStreetMap. Datos disponibles bajo la Open Database License (ODbL).",
    url: "https://www.openstreetmap.org/copyright",
  },
  {
    name: "Google Maps",
    use: "Mapas para ubicar el bien, geocodificación e imágenes de mapa.",
    notice:
      "Su uso está sujeto a los Términos de Servicio Adicionales de Google Maps/Google Earth y a la Política de Privacidad de Google.",
    url: "https://maps.google.com/help/terms_maps/",
  },
  {
    name: "PostGIS",
    use: "Consultas geográficas en la base de datos.",
    notice: "PostGIS se distribuye bajo la GNU General Public License, versión 2 o posterior.",
    url: "https://postgis.net/",
  },
  {
    name: "libvips",
    use: "Procesamiento de imágenes en el servidor (a través de sharp).",
    notice: "libvips se distribuye bajo la GNU Lesser General Public License, versión 2.1 o posterior.",
    url: "https://www.libvips.org/",
  },
  {
    name: "caniuse-lite",
    use: "Datos de compatibilidad de navegadores usados al compilar la aplicación.",
    notice: "Datos de Can I use, de Alexis Deveria, bajo la licencia Creative Commons Attribution 4.0 (CC BY 4.0).",
    url: "https://caniuse.com/",
  },
];
