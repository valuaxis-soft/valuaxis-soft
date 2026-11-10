import Image from "next/image";

const pins = [
  { ref: "C-1", x: 118, y: 92 },
  { ref: "C-2", x: 352, y: 70 },
  { ref: "C-3", x: 96, y: 262 },
  { ref: "C-4", x: 372, y: 236 },
];

/** An invented neighborhood with the subject and four comparables, like the croquis the product draws. */
export function MapMockup() {
  return (
    <div
      role="img"
      aria-label="Maqueta de un mapa con el inmueble sujeto al centro y cuatro comparables numerados alrededor."
      className="relative overflow-hidden rounded-2xl bg-card shadow-lift ring-1 ring-border"
    >
      <svg viewBox="0 0 480 340" className="block h-auto w-full" aria-hidden="true">
        <rect width="480" height="340" fill="oklch(0.955 0.012 110)" />
        {/* Blocks */}
        <g fill="oklch(0.925 0.01 85)">
          <rect x="20" y="20" width="120" height="100" rx="4" />
          <rect x="170" y="20" width="140" height="100" rx="4" />
          <rect x="340" y="20" width="120" height="100" rx="4" />
          <rect x="20" y="150" width="120" height="70" rx="4" />
          <rect x="340" y="150" width="120" height="70" rx="4" />
          <rect x="20" y="250" width="120" height="70" rx="4" />
          <rect x="170" y="250" width="140" height="70" rx="4" />
          <rect x="340" y="250" width="120" height="70" rx="4" />
        </g>
        {/* Park around the subject */}
        <rect x="170" y="150" width="140" height="70" rx="4" fill="oklch(0.88 0.06 150)" />
        {/* Main avenue */}
        <path d="M0 305 C120 300 200 330 480 140" stroke="oklch(0.86 0.07 80)" strokeWidth="10" fill="none" />
        <path d="M0 305 C120 300 200 330 480 140" stroke="white" strokeWidth="1.2" strokeDasharray="6 6" fill="none" />
        {/* Radius around the subject */}
        <circle cx="240" cy="178" r="118" fill="oklch(0.649 0.11 165 / 0.07)" stroke="oklch(0.649 0.11 165 / 0.6)" strokeDasharray="4 5" />
        {pins.map((pin) => (
          <g key={pin.ref} transform={`translate(${pin.x} ${pin.y})`}>
            <path d="M0 0c-9-12-14-18-14-25a14 14 0 1 1 28 0c0 7-5 13-14 25Z" fill="#014069" stroke="white" strokeWidth="2" />
            <text y="-21" textAnchor="middle" fontSize="9" fontWeight="700" fill="white">
              {pin.ref}
            </text>
          </g>
        ))}
        {/* North */}
        <g transform="translate(448 300)">
          <circle r="15" fill="white" stroke="oklch(0.85 0.01 85)" />
          <path d="M0-10 6 7 0 3-6 7Z" fill="#0c1a29" />
        </g>
        {/* Scale bar */}
        <g transform="translate(20 330)" fontSize="9" fill="#0c1a29">
          <rect y="-6" width="60" height="4" fill="#0c1a29" />
          <rect x="30" y="-6" width="30" height="4" fill="white" stroke="#0c1a29" strokeWidth="0.8" />
        </g>
      </svg>

      {/* Subject pin, with a soft pulse */}
      <span className="absolute top-[52.5%] left-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <span className="vx-pulse relative flex size-5 rounded-full text-success">
          <span className="relative z-10 size-5 rounded-full border-[3px] border-white bg-success shadow-soft" />
        </span>
      </span>

      <div className="absolute top-3 left-3 rounded-lg bg-card/95 px-3 py-2 text-xs shadow-soft ring-1 ring-border">
        <p className="font-semibold">Inmueble sujeto</p>
        <p className="text-muted-foreground">4 comparables en 600 m</p>
      </div>

      <div className="absolute right-3 bottom-3 hidden w-48 overflow-hidden rounded-lg bg-card/95 text-xs shadow-lift ring-1 ring-border sm:block">
        <Image
          src="/marketing/comparable-c2.webp"
          alt=""
          width={400}
          height={200}
          sizes="192px"
          className="aspect-[2/1] w-full object-cover"
        />
        <div className="p-3">
          <p className="flex items-center justify-between font-semibold">
            C-2 · Casa
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">Vigente</span>
          </p>
          <p className="mt-1 text-muted-foreground tabular-nums">$3,980,000 · 168.00 m²</p>
          <p className="text-muted-foreground">Fuente: portal inmobiliario</p>
        </div>
      </div>
    </div>
  );
}
