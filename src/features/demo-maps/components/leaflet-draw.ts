import L from "leaflet";

import { STREET_DATA, type DemoComparable, type LatLon, type StreetWay } from "../geo";
import { escapeHtml, type BasePalette, SUBJECT_COLOR } from "../map-content";
import type { HighlightStyle } from "../static-map";

export const latLng = (p: LatLon): L.LatLngTuple => [p[0], p[1]];
const path = (points: readonly LatLon[]) => points.map(latLng);

/** Panes keep the drawn base under the highlights, whatever is redrawn first. */
export function createPanes(map: L.Map) {
  map.createPane("demo-base").style.zIndex = "350";
  map.createPane("demo-highlights").style.zIndex = "420";
  // Invisible wide lines over everything drawn, so a thin street is easy to touch.
  map.createPane("demo-hit").style.zIndex = "430";
}

const LABEL_CLASS = "bg-transparent! border-0! shadow-none! p-0! before:hidden! whitespace-nowrap text-[11px] font-semibold";

/** The street map drawn from streets.json: parks, casings, roads and the names of main roads. */
export function drawBase(
  map: L.Map,
  options: { palette: BasePalette; labels?: boolean; onStreet?: (name: string) => void },
) {
  const { palette, labels = true, onStreet } = options;
  const group = L.layerGroup().addTo(map);
  const pane = "demo-base";
  for (const park of STREET_DATA.p) {
    L.polygon(path(park.g), { pane, stroke: false, fillColor: palette.park, fillOpacity: 1, interactive: false }).addTo(group);
  }
  const ranks = [4, 3, 2, 1];
  const byRank = (rank: number) => STREET_DATA.w.filter((way) => way.r === rank);
  for (const rank of ranks) {
    const big = rank <= 2;
    for (const way of byRank(rank)) {
      L.polyline(path(way.g), { pane, color: big ? palette.avenueCase : palette.roadCase, weight: big ? 9 : rank === 3 ? 6 : 4.5, interactive: false, lineCap: "round" }).addTo(group);
    }
  }
  for (const rank of ranks) {
    const big = rank <= 2;
    for (const way of byRank(rank)) {
      L.polyline(path(way.g), { pane, color: big ? palette.avenue : palette.road, weight: big ? 6.5 : rank === 3 ? 4 : 2.8, lineCap: "round", interactive: false }).addTo(group);
      if (onStreet && way.n) {
        L.polyline(path(way.g), { pane: "demo-hit", color: "#000", opacity: 0, weight: 16, lineCap: "round", className: "outline-none" })
          .bindTooltip(escapeHtml(way.n), { sticky: true })
          .on("click", () => onStreet(way.n))
          .addTo(group);
      }
    }
  }
  if (labels) {
    const done = new Set<string>();
    STREET_DATA.w
      .filter((way) => way.n && way.r <= 2 && way.g.length > 3)
      .sort((a, b) => b.g.length - a.g.length)
      .forEach((way) => {
        if (done.has(way.n)) return;
        done.add(way.n);
        const mid = latLng(way.g[Math.floor(way.g.length / 2)]);
        const shadow = `0 0 3px ${palette.ground}, 0 0 3px ${palette.ground}`;
        L.tooltip({ permanent: true, direction: "center", className: LABEL_CLASS, interactive: false })
          .setLatLng(mid)
          .setContent(`<span style="color:${palette.label};text-shadow:${shadow}">${escapeHtml(way.n)}</span>`)
          .addTo(group);
      });
  }
  return group;
}

export function drawHighlights(group: L.LayerGroup, items: readonly { way: StreetWay; style: HighlightStyle }[]) {
  group.clearLayers();
  for (const { way, style } of items) {
    L.polyline(path(way.g), { pane: "demo-highlights", color: style.color, weight: style.weight, opacity: 0.9, lineCap: "round", interactive: false }).addTo(group);
  }
}

export function subjectIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:${SUBJECT_COLOR};transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

/** Filled pin for a current offer, hollow for an expired one. */
export function comparableIcon(comparable: DemoComparable, color: string) {
  const fill = comparable.current ? color : "#fff";
  const border = comparable.current ? "#fff" : color;
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${fill};border:3px solid ${border};box-shadow:0 1px 3px rgba(0,0,0,.45)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export function valuationIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:3px;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export const CARD_TOOLTIP_CLASS = "p-0! rounded-lg! overflow-hidden border-border! shadow-lg!";
