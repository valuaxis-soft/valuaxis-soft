import { cn } from "@/lib/utils";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * A figure whose digits roll up to their value, like a counter. Each digit is a
 * 0–9 strip moved with `transform` only, so the count never changes layout.
 * The final value is what renders without JavaScript or with reduced motion;
 * the strips roll from 0 only once `LandingMotion` arms the page and an
 * ancestor turns on (`data-inview` or `data-on`). Screen readers get the value
 * once, from the hidden copy.
 */
export function Odometer({ value, className, delay = 0 }: { value: string; className?: string; delay?: number }) {
  let digitIndex = 0;
  return (
    <span className={cn("vx-odo", className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">
        {Array.from(value).map((char, index) => {
          if (!/\d/.test(char)) return <span key={index}>{char}</span>;
          const order = digitIndex++;
          return (
            <span
              key={index}
              className="vx-odo-digit"
              style={{ ["--vx-digit" as string]: Number(char), ["--vx-order" as string]: order, ["--vx-delay" as string]: `${delay}ms` }}
            >
              <span className="invisible">{char}</span>
              <span className="vx-odo-strip">
                {DIGITS.map((digit) => (
                  <span key={digit}>{digit}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
