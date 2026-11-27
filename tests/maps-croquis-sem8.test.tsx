/**
 * The croquis observations of the appraiser's videos 8.5 and 8.7 (25 nov
 * 2026): avenues far from the pin that could not be painted, the free
 * lines' street names, the frame that must be what the screen shows, the
 * 16:9 image that fills the pair's frame, the macro croquis without the
 * highlighted streets, the generator that stays open for another croquis,
 * the satellite view that is only a reference on screen, the image opened
 * enlarged and the croquis that is really replaced. Made-up data only.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CroquisDoneNotice, CroquisFramesSection, ScreenOnlyMapNotice, generationFrame } from "../src/features/maps/components/croquis-generator-parts";
import { FreeLinesPanel } from "../src/features/maps/components/free-lines-panel";
import { DEFAULT_CROQUIS_SETTINGS, croquisSettingsSchema, readCroquisSettings, streetLabelBox, streetLabelsOverlaySvg } from "../src/features/maps/croquis";
import {
  documentCroquis,
  findCroquisById,
  placeGeneratedCroquis,
  withInsertedCroquis,
  type GeneratedCroquis,
} from "../src/features/maps/croquis-document";
import { croquisStreets } from "../src/features/maps/croquis-streets";
import { readFreeLines, withLineName, type FreeLine } from "../src/features/maps/free-lines";
import { DEFAULT_HIGHLIGHT_STYLES, touchableRank, type StreetHighlights } from "../src/features/maps/highlights";
import { MAP_TYPES, isScreenOnlyMapType } from "../src/features/maps/map-styles";
import { composeCroquisImage, renderCroquisImage, resolveCroquisStreets, type CroquisSources } from "../src/features/maps/server/croquis-image.service";
import { getStreetsInView, type ViewStreetsSource } from "../src/features/maps/server/streets.service";
import { northArrowBox } from "../src/features/maps/north-arrow-symbols";
import { STATIC_MAP_SCALE, STATIC_MAP_SIZE, imagePixel, pointAtPixel } from "../src/features/maps/static-map";
import type { StreetWay } from "../src/features/maps/streets";
import {
  OSM_ATTRIBUTION,
  boxContains,
  mergedStreetWays,
  viewStreetHighways,
  viewStreetMaxRank,
  viewStreetsBox,
  type ViewBounds,
} from "../src/features/maps/streets-osm";
import type { LatLon } from "../src/features/maps/types";
import { ImageEditorItem } from "../src/features/valuations/components/editor/image-editor";
import { ImageThumbnail } from "../src/features/valuations/components/editor/image-lightbox";
import type { AppSection } from "../src/features/valuations/model";
import { createInitialSections } from "../src/features/valuations/sections";
import { normalizeEditorSections } from "../src/features/valuations/components/workspace/model/section-numbering";
import { PAIRED_IMAGE_FRAME_RATIO } from "../src/features/valuations/services/image-framing";

/** A made-up subject in a made-up colonia of Zapopan. */
const SUBJECT: LatLon = [20.618, -103.4749];
const METER = 1 / 111_195;
const east = (meters: number) => (meters * METER) / Math.cos((SUBJECT[0] * Math.PI) / 180);
const at = (north: number, eastMeters: number): LatLon => [SUBJECT[0] + north * METER, SUBJECT[1] + east(eastMeters)];

const FRONT: StreetWay = { id: 1, n: "Avenida Ficticia del Reno", r: 4, g: [at(-20, -400), at(-20, 400)] };
/** The avenue next to the subject, tertiary in OpenStreetMap, as Prolongación Mariano Otero there. */
const NEAR_AVENUE: StreetWay = { id: 2, n: "Prolongación Avenida Inventada", r: 3, g: [at(300, -900), at(300, 900)] };
/** Its pieces beyond the 1 km the generator loaded around the pin. */
const FAR_PIECE: StreetWay = { id: 3, n: "Prolongacion Avenida Inventada", r: 2, g: [at(300, 900), at(1200, 2600)] };
/** An avenue 4.7 km away, as López Mateos from the subject of the video. */
const FAR_AVENUE: StreetWay = { id: 4, n: "Lateral de Avenida Lejana Sur", r: 3, g: [at(-3000, 4700), at(3000, 4700)] };

const highlights = (streets: StreetHighlights["streets"]): StreetHighlights => ({ front: FRONT.n, streets, styles: DEFAULT_HIGHLIGHT_STYLES, names: true });

test("video 8.5, 4:01: the streets of the map's view load with the classes that read at its zoom, so an avenue 4.7 km away can be painted", async () => {
  // Every street from zoom 16, the avenues down to tertiary from 13 (a tertiary avenue is an avenue), the main roads further out.
  assert.equal(viewStreetMaxRank(16), 4);
  assert.equal(viewStreetMaxRank(15), 3);
  assert.equal(viewStreetMaxRank(13), 3);
  assert.equal(viewStreetMaxRank(12), 2);
  assert.ok(viewStreetHighways(15).includes("tertiary") && viewStreetHighways(15).includes("primary_link") && !viewStreetHighways(15).includes("residential"));
  assert.ok(viewStreetHighways(17).includes("residential"));
  // On the map, a tertiary avenue can be touched at the macro zoom (until then only rank 1–2 up to zoom 16).
  assert.equal(touchableRank(15), 4);
  assert.ok(NEAR_AVENUE.r <= touchableRank(14));
  assert.ok(FAR_AVENUE.r > touchableRank(12));

  // The box asked for: the view grown by half a side, snapped to the grid, holding the view.
  const view: ViewBounds = [at(-2500, -3000), at(2500, 5000)];
  const box = viewStreetsBox(view);
  assert.ok(boxContains(box, view));
  assert.ok(box[0][0] < view[0][0] && box[1][1] > view[1][1]);
  assert.equal(Math.round(box[0][0] * 100) / 100, box[0][0], "snapped to 0.01°");
  assert.equal(boxContains(viewStreetsBox([at(-100, -100), at(100, 100)]), view), false);

  // From our copy, with the classes of the zoom; a second ask of the same box is the cache.
  const asked: { highways: readonly string[] }[] = [];
  const namedAsked: string[][] = [];
  const source: ViewStreetsSource = {
    inView: async (_bounds, highways) => {
      asked.push({ highways });
      return [NEAR_AVENUE, FAR_AVENUE].filter((way) => way.r <= 3);
    },
    named: async (_bounds, keys) => {
      namedAsked.push([...keys]);
      return [FAR_PIECE];
    },
    loaded: async () => true,
    around: async () => {
      throw new Error("our copy answered");
    },
  };
  const first = await getStreetsInView(box, 14, [], source);
  assert.deepEqual(first.ways.map((way) => way.n), [NEAR_AVENUE.n, FAR_AVENUE.n]);
  await getStreetsInView(box, 14, [], source);
  assert.equal(asked.length, 1);
  assert.ok(asked[0].highways.includes("tertiary") && !asked[0].highways.includes("residential"));
  assert.deepEqual(namedAsked, [], "nothing highlighted, nothing more asked");
  // The highlighted streets come whole in the view, whatever their class, so the map shows them as the croquis prints them.
  const withHighlighted = await getStreetsInView(box, 12, [NEAR_AVENUE.n], source);
  assert.deepEqual(namedAsked, [["prolongacion avenida inventada"]]);
  assert.ok(withHighlighted.ways.some((way) => way.id === FAR_PIECE.id && way.n === NEAR_AVENUE.n));
  // A copy never loaded: the streets around the view's center, through the fallback.
  const fallback = await getStreetsInView(viewStreetsBox([at(-10, -10), at(10, 10)]), 14, [], {
    inView: async () => [],
    named: async () => [],
    loaded: async () => false,
    around: async (_point, radius) => ({ ways: [FRONT], radius, attribution: OSM_ATTRIBUTION }),
  });
  assert.deepEqual(fallback.ways.map((way) => way.n), [FRONT.n]);

  // The view's streets join the ones around the pin, each piece once, one spelling per street.
  const merged = mergedStreetWays([FRONT, NEAR_AVENUE], [NEAR_AVENUE, FAR_PIECE, FAR_AVENUE]);
  assert.deepEqual(merged.map((way) => way.id), [1, 2, 3, 4]);
  assert.equal(merged[2].n, NEAR_AVENUE.n, "the variant without accents takes the accented spelling");
});

test("videos 8.5, 10:18 and 8.7, 0:39: the macro croquis draws every highlighted street, whole in its frame, not only the rank 1–2 avenues", async () => {
  const painted = highlights([{ name: NEAR_AVENUE.n, category: "principal" }, { name: FAR_AVENUE.n, category: "secundaria" }]);
  // The tertiary avenue next to the subject now draws on the macro croquis (it was left out).
  const macro = croquisStreets("macro", SUBJECT, 15, painted, [FRONT, NEAR_AVENUE]);
  assert.deepEqual(macro.paths.map((path) => path.color), [DEFAULT_HIGHLIGHT_STYLES.principal.color, DEFAULT_HIGHLIGHT_STYLES.front.color]);
  assert.ok(macro.labels.some((label) => label.name === NEAR_AVENUE.n));

  // The server adds every piece of the highlighted streets crossing the frame, beyond the streets around the pin.
  const asked: string[][] = [];
  const streets = await resolveCroquisStreets(
    { kind: "macro", center: at(1000, 2500), zoom: 14, subject: SUBJECT, streets: painted, pins: [], northArrow: { style: "flecha", corner: "top-right" } },
    async () => ({ ways: [FRONT, NEAR_AVENUE], radius: 1000, attribution: OSM_ATTRIBUTION }),
    async (_bounds, names) => {
      asked.push([...names]);
      return [FAR_PIECE, FAR_AVENUE];
    },
  );
  assert.deepEqual(asked, [[FRONT.n, NEAR_AVENUE.n, FAR_AVENUE.n]]);
  const blue = streets.paths.filter((path) => path.color === DEFAULT_HIGHLIGHT_STYLES.principal.color);
  assert.equal(blue.length, 2, "the near piece and the far one, one street under one spelling");
  assert.ok(streets.paths.some((path) => path.color === DEFAULT_HIGHLIGHT_STYLES.secundaria.color), "the avenue 4.7 km away");
});

test("video 8.5, 4:30: a free line takes the name of its street, in its color, and moves and turns like a street's name", async () => {
  const line: FreeLine = { id: "trazo-1", color: "#2f8a4f", weight: 5, points: [at(-150, -200), at(-150, 100), at(-100, 120)] };
  // Typed as it comes: the spaces stay while typing; a blank name takes it away.
  const named = withLineName([line], line.id, "Calle Inventada ");
  assert.equal(named[0].name, "Calle Inventada ");
  assert.equal(withLineName(named, line.id, "   ")[0].name, undefined);
  // Stored and read back with the settings.
  const settings = readCroquisSettings({ ...DEFAULT_CROQUIS_SETTINGS, lines: named });
  assert.equal(settings.lines[0].name, "Calle Inventada");
  assert.ok(croquisSettingsSchema.safeParse({ ...DEFAULT_CROQUIS_SETTINGS, lines: [{ ...line, name: "x".repeat(121) }] }).success === false);
  assert.equal(readFreeLines([{ ...line, name: "Otra" }])[0].name, "Otra");

  // Its label: on the line, along it, in the line's color, even with «Mostrar nombres» off (that one is the highlighted streets').
  const own = croquisStreets("micro", SUBJECT, 17, { ...highlights([]), names: false }, [FRONT], SUBJECT, { lines: settings.lines });
  assert.equal(own.labels.length, 1);
  const [label] = own.labels;
  assert.equal(label.name, "Calle Inventada");
  assert.equal(label.color, line.color);
  assert.equal(label.angle, 0, "along its long east–west stretch");
  assert.ok(Math.abs(label.point[0] - line.points[0][0]) < 1e-9, "on the line");

  // The croquis prints it with the streets' names, each clear of the others and of the pin, or where the appraiser put it and turned it.
  const micro = croquisStreets("micro", SUBJECT, 17, highlights([]), [FRONT], SUBJECT, { lines: settings.lines });
  assert.deepEqual(micro.labels.map((item) => item.name).sort(), [FRONT.n, "Calle Inventada"].sort());
  const placed = { name: "Calle Inventada", point: at(-160, -50), angle: 35 };
  const turned = croquisStreets("micro", SUBJECT, 17, highlights([]), [FRONT], SUBJECT, { lines: settings.lines, placements: [placed] });
  assert.deepEqual(turned.labels.find((item) => item.name === placed.name), { ...label, point: placed.point, angle: 35 });
  // A line through the subject: its name goes beside the pin, not over it (the first sample of the video covered the pin).
  const through: FreeLine = { ...line, points: [at(0, -150), at(0, 150)], name: "Calle Que Cruza" };
  const [crossing] = croquisStreets("micro", SUBJECT, 17, { ...highlights([]), names: false }, [], SUBJECT, { lines: [through] }).labels;
  const box = streetLabelBox(SUBJECT, 17, crossing);
  const pin = imagePixel(SUBJECT, 17, SUBJECT);
  assert.ok(Math.abs(box.x - pin.x) > box.width / 2 || Math.abs(box.y - pin.y) > box.height / 2, "the name keeps off the pin");
  // Nor under the north arrow in its corner (the first sample cut «Lateral de López Mateos Sur» under it).
  const topRight: FreeLine = { ...through, points: [pointAtPixel(SUBJECT, 17, 450, 35), pointAtPixel(SUBJECT, 17, 640, 35)] };
  const arrow = northArrowBox("top-right");
  const placedAt = (corner?: "top-right") => streetLabelBox(SUBJECT, 17, croquisStreets("micro", SUBJECT, 17, { ...highlights([]), names: false }, [], SUBJECT, { lines: [topRight], corner }).labels[0]);
  const underArrow = (label: ReturnType<typeof placedAt>) => label.x + label.width / 2 > arrow.x && label.x - label.width / 2 < arrow.x + arrow.width && label.y + label.height / 2 > arrow.y && label.y - label.height / 2 < arrow.y + arrow.height;
  assert.ok(underArrow(placedAt()), "without the corner, the middle of the line is under the arrow");
  assert.equal(underArrow(placedAt("top-right")), false);
  // With nothing highlighted the image still carries the line's name, without asking for any street.
  const alone = await resolveCroquisStreets(
    { kind: "micro", center: SUBJECT, zoom: 17, subject: SUBJECT, streets: { ...highlights([]), front: null }, pins: [], northArrow: { style: "flecha", corner: "top-right" }, lines: settings.lines },
    async () => {
      throw new Error("nothing highlighted: no streets asked");
    },
  );
  assert.deepEqual(alone.labels.map((item) => item.name), ["Calle Inventada"]);
  assert.match(streetLabelsOverlaySvg(SUBJECT, 17, alone.labels), /stroke="#2f8a4f"[^>]*\/><text[^>]*>Calle Inventada</);

  // The panel: the selected line's name box, and the name in the list.
  const html = renderToStaticMarkup(
    <FreeLinesPanel
      lines={settings.lines}
      draft={null}
      nextStyle={{ color: "#d35400", weight: 5 }}
      selectedId={line.id}
      onStart={() => {}}
      onUndoPoint={() => {}}
      onFinish={() => {}}
      onCancel={() => {}}
      onSelect={() => {}}
      onNextStyleChange={() => {}}
      onLineStyleChange={() => {}}
      onLineNameChange={() => {}}
      onRemove={() => {}}
      disabled={false}
    />,
  );
  assert.match(html, /Nombre de la calle/);
  assert.match(html, /data-free-line-name="trazo-1"[^>]*value="Calle Inventada"|value="Calle Inventada"[^>]*data-free-line-name="trazo-1"/);
  assert.match(html, /«Calle Inventada»/);
});

test("video 8.5, 11:34: the croquis image is 16:9, the frame of a macro and micro pair, so it fills it without white bands", async () => {
  assert.equal(STATIC_MAP_SIZE.width / STATIC_MAP_SIZE.height, PAIRED_IMAGE_FRAME_RATIO);
  const sources: CroquisSources = { baseWays: async () => [], streetsAround: async () => ({ ways: [FRONT], radius: 1000, attribution: OSM_ATTRIBUTION }) };
  const { jpeg } = await renderCroquisImage(
    { kind: "micro", center: SUBJECT, zoom: 17, subject: SUBJECT, northArrow: { style: "flecha", corner: "top-right" }, pins: [], streets: highlights([]) },
    sources,
  );
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(jpeg).metadata();
  assert.equal(metadata.width! / metadata.height!, 16 / 9);
  assert.equal(metadata.height, STATIC_MAP_SIZE.height * STATIC_MAP_SCALE);
});

const NO_OP = () => {};

test("video 8.5, 7:00 and 11:03: one control per croquis, «Encuadrar en el mapa», saying what it does; the box over the map is the image", () => {
  const rows = [
    { kind: "macro" as const, zoom: 14, outside: [] },
    { kind: "micro" as const, zoom: 17, outside: [] },
  ];
  const html = renderToStaticMarkup(
    <CroquisFramesSection rows={rows} active="macro" placed mapReady comparables={0} canEdit alikeZoom={null} onFrameOnMap={NO_OP} onFitComparables={NO_OP} />,
  );
  assert.doesNotMatch(html, /Tomar del mapa|Ver encuadre/, "the two buttons that confused him are gone");
  assert.match(html, /El recuadro punteado del mapa es la imagen de macrolocalización: lo que queda dentro es exactamente lo que sale en el croquis/);
  // The croquis the map frames says so; the other one has the button that takes the map to it.
  assert.match(html, /data-croquis-frame="macro"[\s\S]*En el mapa: muévelo para encuadrarlo[\s\S]*data-croquis-frame="micro"[\s\S]*Encuadrar en el mapa/);
  assert.equal((html.match(/Encuadrar en el mapa<\/button>/g) ?? []).length, 1);
  // Not placed yet: nothing to frame.
  assert.match(renderToStaticMarkup(<CroquisFramesSection rows={rows} active="micro" placed={false} mapReady comparables={0} canEdit alikeZoom={null} onFrameOnMap={NO_OP} onFitComparables={NO_OP} />), /Ubica el inmueble para encuadrar los croquis/);
  // «Generar» takes what the screen shows for the croquis the map frames, the stored frame for the other.
  const onScreen = { offset: [0.004, -0.002] as LatLon, zoom: 13 };
  const stored = { offset: [0, 0] as LatLon, zoom: 15 };
  assert.deepEqual(generationFrame("macro", "macro", onScreen, stored), onScreen);
  assert.deepEqual(generationFrame("micro", "macro", onScreen, stored), stored);
  assert.deepEqual(generationFrame("macro", "macro", null, stored), stored, "while the map is still moving where the generator sent it");
});

test("video 8.7, 0:00: the satellite view says it is only on screen, and the generator says the croquis is the street map", () => {
  assert.deepEqual(MAP_TYPES.map((type) => type.title), ["Mapa de calles", "Satélite (solo en pantalla)", "Satélite con nombres (solo en pantalla)"]);
  assert.equal(isScreenOnlyMapType("roadmap"), false);
  assert.ok(isScreenOnlyMapType("satellite") && isScreenOnlyMapType("hybrid"));
  assert.equal(renderToStaticMarkup(<ScreenOnlyMapNotice mapType="roadmap" />), "");
  const notice = renderToStaticMarkup(<ScreenOnlyMapNotice mapType="satellite" />);
  assert.match(notice, /role="status"/);
  assert.match(notice, /solo se ve aquí/);
  assert.match(notice, /mapa de calles de OpenStreetMap/);
});

const sections = (): AppSection[] => normalizeEditorSections(createInitialSections());
const generated = (tag: string, ...kinds: GeneratedCroquis["kind"][]): GeneratedCroquis[] =>
  kinds.map((kind) => ({ kind, src: `/api/archivos/imagen?key=uploads/${tag}-${kind}.jpg`, marker: { kind, frame: { offset: [0, 0], zoom: kind === "macro" ? 14 : 17 } } }));

test("video 8.7, 0:00: generating again from a croquis really replaces its picture, and only it", () => {
  const start = sections();
  const block = start.find((section) => section.id === "terreno")!.blocks[0];
  const first = withInsertedCroquis(start, { sectionId: "terreno", blockId: block.id }, generated("old", "macro", "micro"));
  const [macroId, microId] = first.imageIds;
  const placed = placeGeneratedCroquis(first.sections, { mode: "image", imageId: macroId }, generated("new", "macro"));
  assert.ok(placed.sections);
  const macro = findCroquisById(placed.sections, macroId)!;
  assert.equal(macro.image.src, "/api/archivos/imagen?key=uploads/new-macro.jpg", "the new picture");
  assert.deepEqual(macro.image.croquis.frame, { offset: [0, 0], zoom: 14 }, "with the frame it was generated with");
  assert.equal(findCroquisById(placed.sections, microId)!.image.src, "/api/archivos/imagen?key=uploads/old-micro.jpg", "the other one untouched");
  assert.equal(documentCroquis(placed.sections).length, 2, "replaced, not added");
  assert.deepEqual(placed.at, { sectionId: "terreno", blockId: block.id });
  // A croquis no longer in the document: nothing placed, the generator says so.
  assert.deepEqual(placeGeneratedCroquis(first.sections, { mode: "image", imageId: "gone" }, generated("new", "macro")), { sections: null, missing: ["macro"], at: null });
});

test("video 8.5, 8:34: after generating, «Generar otro croquis» adds the next one beside the last, without marking the streets again", () => {
  const start = sections();
  const block = start.find((section) => section.id === "terreno")!.blocks[0];
  const first = placeGeneratedCroquis(start, { mode: "insert", at: { sectionId: "terreno", blockId: block.id }, captures: ["macro"] }, generated("a", "macro"));
  assert.ok(first.sections && first.at);
  // The next opening is «Agregar» where the last one went: a new image, the first one stays.
  const second = placeGeneratedCroquis(first.sections, { mode: "insert", at: first.at, captures: ["macro"] }, generated("b", "macro"));
  assert.deepEqual(documentCroquis(second.sections!).map((entry) => entry.image.src), ["/api/archivos/imagen?key=uploads/a-macro.jpg", "/api/archivos/imagen?key=uploads/b-macro.jpg"]);
  // From the section's own access, it tells where the croquis went too.
  const viaSection = placeGeneratedCroquis(start, { mode: "section", captures: ["macro"] }, generated("c", "macro"));
  assert.ok(viaSection.sections && viaSection.at);
  assert.equal(findCroquisById(viaSection.sections, documentCroquis(viaSection.sections)[0].image.id)?.blockId, viaSection.at.blockId);
  // The generator stays open after «Generar» and says what went where, with «Generar otro croquis» and «Cerrar el generador».
  const done = renderToStaticMarkup(<CroquisDoneNotice message="Macrolocalización: colocado en Terreno." onAnother={NO_OP} onClose={NO_OP} />);
  assert.match(done, /Macrolocalización: colocado en Terreno\. El generador sigue abierto con tus calles, trazos y encuadres/);
  assert.match(done, /Generar otro croquis/);
  assert.match(done, /Cerrar el generador/);
  assert.doesNotMatch(renderToStaticMarkup(<CroquisDoneNotice message="Listo." onClose={NO_OP} />), /Generar otro croquis/);
});

test("video 8.5, 12:05: a click on an image of the editor opens it enlarged, without going to the preview", () => {
  const html = renderToStaticMarkup(<ImageThumbnail src="/api/archivos/imagen?key=uploads/croquis.jpg" title="Croquis de macrolocalización" className="size-16" />);
  assert.match(html, /<button[^>]*data-image-zoom/);
  assert.match(html, /aria-label="Ver en grande: Croquis de macrolocalización"/);
  assert.match(html, /src="\/api\/archivos\/imagen\?key=uploads\/croquis.jpg"/);
  // Every image of a block or subbloque shows its thumbnail that way.
  const item = renderToStaticMarkup(
    <ImageEditorItem image={{ id: "img-1", title: "Croquis de microlocalización", src: "/api/archivos/imagen?key=uploads/micro.jpg", enabled: true }} onRemove={NO_OP} onUpdate={NO_OP} readOnly={false} />,
  );
  assert.match(item, /<button[^>]*aria-label="Ver en grande: Croquis de microlocalización"[^>]*>[\s\S]*?<img[^>]*src="\/api\/archivos\/imagen\?key=uploads\/micro.jpg"/);
});

test("PR #171: a name never hides another, even on a crowded macro croquis: each name's band is drawn whole, over every line", async () => {
  // As in the first macro sample: the front street crossing near the pin, and a free line too short for its long name right beside it.
  const zoom = 13;
  const px = (x: number, y: number) => pointAtPixel(SUBJECT, zoom, x, y);
  const pin = imagePixel(SUBJECT, zoom, SUBJECT);
  const front: StreetWay = { id: 10, n: "Circuito del León Poniente", r: 4, g: [px(pin.x + 20, 40), px(pin.x + 24, 340)] };
  const avenue: StreetWay = { id: 11, n: "Prolongación Avenida Inventada", r: 3, g: [px(40, pin.y + 40), px(600, pin.y - 60)] };
  const line: FreeLine = { id: "t", color: "#2f8a4f", weight: 5, points: [px(pin.x - 12, pin.y + 4), px(pin.x + 14, pin.y + 4)], name: "Calle del Trazo Inventada" };
  const painted: StreetHighlights = { front: front.n, streets: [{ name: avenue.n, category: "principal" }], styles: DEFAULT_HIGHLIGHT_STYLES, names: true };
  const streets = croquisStreets("macro", SUBJECT, zoom, painted, [front, avenue], SUBJECT, { lines: [line], corner: "top-right" });
  assert.equal(streets.labels.length, 3);
  // No two bands share a pixel (their turned boxes do not touch).
  const boxes = streets.labels.map((label) => {
    const box = streetLabelBox(SUBJECT, zoom, label);
    const radians = (box.angle * Math.PI) / 180;
    return {
      name: label.name,
      x: box.x,
      y: box.y,
      halfX: Math.abs((box.width / 2) * Math.cos(radians)) + Math.abs((box.height / 2) * Math.sin(radians)),
      halfY: Math.abs((box.width / 2) * Math.sin(radians)) + Math.abs((box.height / 2) * Math.cos(radians)),
    };
  });
  for (const a of boxes) for (const b of boxes) if (a !== b) assert.ok(Math.abs(a.x - b.x) >= a.halfX + b.halfX || Math.abs(a.y - b.y) >= a.halfY + b.halfY, `${a.name} / ${b.name}`);

  // Pixels: along each name's text, the image with every name is the image with that name alone (same base, streets and lines under it).
  const sharp = (await import("sharp")).default;
  const base = await sharp({ create: { width: STATIC_MAP_SIZE.width * 2, height: STATIC_MAP_SIZE.height * 2, channels: 3, background: "#f2efe9" } }).png().toBuffer();
  const input = { center: SUBJECT, zoom, northArrow: { style: "flecha" as const, corner: "top-right" as const }, pins: [], lines: [line], subject: SUBJECT };
  const raw = async (jpeg: Buffer) => sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const all = await raw(await composeCroquisImage(base, input, streets));
  for (const label of streets.labels) {
    const alone = await raw(await composeCroquisImage(base, input, { ...streets, labels: [label] }));
    const box = streetLabelBox(SUBJECT, zoom, label);
    const radians = (box.angle * Math.PI) / 180;
    let differing = 0;
    let samples = 0;
    for (let t = -0.45; t <= 0.45; t += 0.01) {
      const x = Math.round((box.x + Math.cos(radians) * t * box.width) * 2);
      const y = Math.round((box.y + Math.sin(radians) * t * box.width) * 2);
      const offset = (y * all.info.width + x) * all.info.channels;
      samples += 1;
      if ([0, 1, 2].some((channel) => Math.abs(all.data[offset + channel] - alone.data[offset + channel]) > 24)) differing += 1;
    }
    assert.equal(differing, 0, `«${label.name}»: ${differing} of ${samples} points of its text drawn over`);
  }
});
