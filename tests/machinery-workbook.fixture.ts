/**
 * The example of the firm's book «FORMATO AVALUO PT-MEH MAQ EQ»: what its
 * sheets «IV. ENF. COSTOS» and «V. ENF. MERCADO» capture. With it the book
 * gives a physical value of 933,000 and a market value of 980,000.
 */
import {
  DEFAULT_MACHINERY_COST,
  DEFAULT_MACHINERY_MARKET,
  EMPTY_MACHINERY_ITEM,
  emptyAttachment,
  emptyOffer,
  type MachineryCostDto,
  type MachineryMarketDto,
  type MachineryOfferDto,
} from "../src/features/valuations/calculation/machinery-types";

export const workbookCost: MachineryCostDto = {
  ...DEFAULT_MACHINERY_COST,
  item: {
    ...EMPTY_MACHINERY_ITEM,
    name: "Retroexcavadora hidráulica", brand: "Caterpillar", model: "416E", year: "2012",
    serial: "IGRIEK598GRED9494", engineNumber: "KEDJOI99FWWQDG6559", plate: "JJD598F",
    other: "Ninguno", hours: "8,498 horas", physicalState: "Activo", deficiencies: "Ninguna",
    attachmentsNote: "No se consideran", notes: "Golpe en carrocería sobre cabina",
    quotationKind: "Nuevo Igual", supplier: "Caterpillar México", contact: "34 559 9900", originCountry: "Estados Unidos",
    quotationDate: "15/Diciembre/26", quotedPrice: 65000, exchangeRate: 17.65, otherFactor: 1,
    customs: 0.01, freight: 0.02, insurance: 0.01, engineering: 0.03, installation: 0.02, otherExpenses: 0,
    expensesNotes: "El equipo llega desarmado.",
    maintenanceKind: "Cada 6 meses", age: 14, usefulLife: 30, rating: 8, conservation: 0.975, maintenance: 0.95, technological: 1, economic: 1,
  },
  attachments: [
    {
      ...emptyAttachment(0), description: "Cucharón de 1 m3", brand: "Caterpillar", supplier: "Caterpillar", source: "www.catmaq.c",
      quotationKind: "Nuevo Igual", quotedPrice: 117000, fees: 0.05, engineering: 0.03, installation: 0.01, age: 10, usefulLife: 20, conservation: 0.95,
    },
    {
      ...emptyAttachment(1), description: "Martillo Hidráulico de 12 HP", brand: "Caterpillar", supplier: "Maq. Hdez.", source: "www.maqhdz.c",
      quotationKind: "Usado Igual", quotedPrice: 185000, age: 5, usefulLife: 20, conservation: 0.95,
    },
  ],
};

const offer = (index: number, row: Partial<MachineryOfferDto>): MachineryOfferDto =>
  ({ ...emptyOffer(index), description: "Retroexcavadora", brand: "Caterpillar", ...row });

export const workbookMarket: MachineryMarketDto = {
  ...DEFAULT_MACHINERY_MARKET,
  offerLevel: "MUY_ALTA",
  usefulLife: 30,
  offers: [
    offer(0, { model: "420F", year: "2018", hours: "5480", attachments: "Cucharón frontal y retro estándar", date: "15/12/2026", price: 1680000, contact: "Juan Martínez", company: "Maquinaria de Occidente", phone: "347 587 7750", location: "Guadalajara, Jalisco.", fees: 0.03, installation: 0.04, age: 8, rating: 8, conservation: 0.9, maintenance: 0.95 }),
    offer(1, { model: "420F", year: "2019", hours: "4960", attachments: "Cucharón frontal y brazo extendible", date: "16/12/2026", price: 1890000, contact: "Carlos Hernández", company: "Equipos Industriales", location: "León, Guanajuato.", fees: 0.03, installation: 0.05, age: 7, rating: 9, conservation: 0.5, technological: 0.95 }),
    offer(2, { model: "420F2", year: "2017", hours: "6320", attachments: "Cucharón frontal y rotomartillo", date: "17/12/2026", price: 1520000, contact: "Ricardo López", company: "QRO Machinery", location: "Querétaro, Querétaro.", fees: 0.02, installation: 0.02, age: 9, rating: 10, conservation: 0.8, maintenance: 0.95 }),
    offer(3, { model: "420E", year: "2016", hours: "7850", attachments: "Cucharón frontal y retro estándar", date: "18/12/2026", price: 1310000, contact: "Alejandro García", company: "Norte Equipos", location: "Monterrey, Nuevo León.", fees: 0.01, installation: 0.02, age: 10, rating: 7, conservation: 0.85, technological: 0.9 }),
    offer(4, { model: "420F", year: "2020", hours: "3740", attachments: "Cucharón frontal y retro estándar", date: "19/12/2026", price: 2050000, contact: "Miguel Ramírez", company: "Comercializa Cat", location: "Zapopan, Jalisco", fees: 0.03, installation: 0.02, age: 6, rating: 8, conservation: 0.8, technological: 0.8 }),
  ],
};
