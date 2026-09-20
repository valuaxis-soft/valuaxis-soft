import { PDFDocument, rgb, StandardFonts, PageSizes, type PDFPage, type PDFFont, type RGB } from "pdf-lib";

export type PdfSection = {
  label: string;
  title: string;
  blocks: PdfBlock[];
};

export type PdfBlock = {
  label: string;
  title: string;
  concepts: PdfConcept[];
  tables: PdfTable[];
  images: PdfImage[];
  subBlocks: PdfApartado[];
};

export type PdfApartado = {
  label: string;
  title: string;
  concepts: PdfConcept[];
};

export type PdfConcept = {
  label: string;
  value: string;
};

export type PdfTable = {
  title: string;
  columns: string[];
  rows: string[][];
};

export type PdfImage = {
  title: string;
  url: string;
};

export type PdfValuation = {
  folio: string;
  client: string;
  location: string;
  postalCode: string;
  valuationKind: string;
  propertyKind: string;
  sections: PdfSection[];
};

const MARGIN = 50;
const PAGE_WIDTH = PageSizes.Letter[0];
const PAGE_HEIGHT = PageSizes.Letter[1];
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT_SIZE_TITLE = 18;
const FONT_SIZE_SECTION = 14;
const FONT_SIZE_BLOCK = 12;
const FONT_SIZE_NORMAL = 10;
const FONT_SIZE_SMALL = 8;
const LINE_HEIGHT = 14;

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  options?: { color?: RGB; maxWidth?: number },
) {
  const color = options?.color || rgb(0, 0, 0);
  const maxWidth = options?.maxWidth || CONTENT_WIDTH;

  if (text.length * size * 0.35 > maxWidth) {
    const words = text.split(" ");
    let line = "";
    let currentY = y;
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (testLine.length * size * 0.35 > maxWidth) {
        page.drawText(line, { x, y: currentY, size, font, color });
        currentY -= size * 1.4;
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, { x, y: currentY, size, font, color });
    }
    return currentY - size * 0.4;
  }

  page.drawText(text, { x, y, size, font, color });
  return y - size * 0.4;
}

export async function generateValuationPdf(data: PdfValuation): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function checkPage() {
    if (y < MARGIN + 60) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawSeparator() {
    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 8;
  }

  drawText(page, `AVALUO ${data.valuationKind.toUpperCase()}`, MARGIN, y, fontBold, FONT_SIZE_TITLE);
  y -= FONT_SIZE_TITLE * 1.8;

  page.drawText(`Folio: ${data.folio}`, { x: MARGIN, y, size: FONT_SIZE_NORMAL, font });
  y -= LINE_HEIGHT;
  page.drawText(`Cliente: ${data.client}`, { x: MARGIN, y, size: FONT_SIZE_NORMAL, font });
  y -= LINE_HEIGHT;
  page.drawText(`Ubicacion: ${data.location}`, { x: MARGIN, y, size: FONT_SIZE_NORMAL, font });
  y -= LINE_HEIGHT;
  page.drawText(`CP: ${data.postalCode}`, { x: MARGIN, y, size: FONT_SIZE_NORMAL, font });
  y -= LINE_HEIGHT;
  page.drawText(`Tipo: ${data.propertyKind}`, { x: MARGIN, y, size: FONT_SIZE_NORMAL, font });
  y -= FONT_SIZE_NORMAL * 2;

  drawSeparator();

  for (const section of data.sections) {
    if (!section.blocks.length) continue;
    checkPage();

    drawText(page, `${section.label}. ${section.title}`, MARGIN, y, fontBold, FONT_SIZE_SECTION);
    y -= FONT_SIZE_SECTION * 1.6;

    for (const block of section.blocks) {
      checkPage();

      drawText(page, `${block.label} ${block.title}`, MARGIN, y, fontBold, FONT_SIZE_BLOCK);
      y -= FONT_SIZE_BLOCK * 1.5;

      for (const concept of block.concepts) {
        checkPage();
        const text = `${concept.label}: ${concept.value}`;
        y = drawText(page, text, MARGIN + 10, y, font, FONT_SIZE_NORMAL);
      }

      for (const table of block.tables) {
        checkPage();
        drawText(page, table.title, MARGIN + 10, y, fontBold, FONT_SIZE_NORMAL);
        y -= FONT_SIZE_NORMAL * 1.4;

        const colWidth = (CONTENT_WIDTH - 20) / Math.max(table.columns.length, 1);

        let tableY = y;
        for (const col of table.columns) {
          const idx = table.columns.indexOf(col);
          page.drawText(col, {
            x: MARGIN + 10 + idx * colWidth + 2,
            y: tableY,
            size: FONT_SIZE_SMALL,
            font: fontBold,
          });
        }
        tableY -= LINE_HEIGHT;

        for (const row of table.rows) {
          checkPage();
          for (let ci = 0; ci < row.length; ci++) {
            page.drawText(row[ci], {
              x: MARGIN + 10 + ci * colWidth + 2,
              y: tableY,
              size: FONT_SIZE_SMALL,
              font,
              maxWidth: colWidth - 4,
            });
          }
          tableY -= LINE_HEIGHT;
        }
        y = tableY - 4;
      }

      for (const subBlock of block.subBlocks) {
        checkPage();
        drawText(
          page,
          `${block.label}.${subBlock.label} ${subBlock.title}`,
          MARGIN + 10,
          y,
          fontBold,
          FONT_SIZE_NORMAL,
        );
        y -= FONT_SIZE_NORMAL * 1.4;

        for (const concept of subBlock.concepts) {
          checkPage();
          const text = `${concept.label}: ${concept.value}`;
          y = drawText(page, text, MARGIN + 20, y, font, FONT_SIZE_NORMAL);
        }
      }

      y -= 4;
    }

    drawSeparator();
  }

  return await doc.save();
}
