import type { ImageCaption, ImageContent } from "@/features/valuations/model";
import { resolveImageWidthPercent } from "@/features/valuations/services/document-image-layout";
import { isQuarterTurn, printedImageCaptions } from "@/features/valuations/services/image-captions";
import { cn } from "@/lib/utils";
import { useState, type CSSProperties } from "react";
import { useLayoutInvalidation } from "./document-preview-page";

const EMPTY_VALUE = "No se proporcionó";

const CAPTION_ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" } as const;

/**
 * An image of the document. `sideBySide` is for images that share a row
 * (location sketches): each sits in a thin frame of the same shape, whatever
 * the proportions of its file, so the pair stays level and compact.
 *
 * Its caption lines print above or below it, in their order. A turned image
 * ("Girar") takes on the page the place its turned shape needs.
 */
export function DocumentImage({ image, sideBySide = false }: { image: ImageContent; sideBySide?: boolean }) {
  const widthPercent = resolveImageWidthPercent(image);
  const widthStyle = {
    width: `${widthPercent}%`,
    maxWidth: "100%",
  } satisfies CSSProperties;

  const above = printedImageCaptions(image, "top");
  const below = printedImageCaptions(image, "bottom");
  const rotation = image.rotation ?? 0;
  // The file's own proportions, known once it loads: a quarter turn swaps them on the page.
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const layoutInvalidation = useLayoutInvalidation();
  const handleImageLoad = layoutInvalidation?.requestPagination;

  const handleImageError = process.env.NODE_ENV === "development"
    ? () => {
        console.warn("[VALUOS-IMAGE-ERROR]", {
          imageId: image.id,
          filename: image.title,
          srcType: image.src.startsWith("data:") ? "data:"
            : image.src.startsWith("blob:") ? "blob:"
            : image.src.includes("X-Amz-Signature") ? "signed-url"
            : image.src.includes("://") ? "absolute-url"
            : "relative-or-key",
          srcPreview: image.src.length > 120 ? image.src.slice(0, 60) + "…" + image.src.slice(-50) : image.src,
        });
      }
    : undefined;

  const imageElement = (className: string, style?: CSSProperties) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      style={style}
      src={image.src}
      alt={image.title || "Imagen del avalúo"}
      data-image-rotation={rotation || undefined}
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (naturalWidth && naturalHeight && (naturalSize?.width !== naturalWidth || naturalSize?.height !== naturalHeight)) {
          setNaturalSize({ width: naturalWidth, height: naturalHeight });
        }
        handleImageLoad?.();
      }}
      onError={() => { handleImageError?.(); }}
    />
  );

  return (
    <figure className={cn("mx-auto break-inside-avoid-page")} style={widthStyle}>
      {above.map((caption) => <ImageCaptionLine caption={caption} key={caption.id} />)}
      {!isRenderableImageSource(image.src) ? (
        <div className="flex h-24 items-center justify-center border border-dashed border-slate-300 text-[9px] italic text-slate-400">
          {EMPTY_VALUE}
        </div>
      ) : sideBySide && rotation === 0 ? (
        imageElement("mx-auto block aspect-[16/9] w-full border border-slate-400 bg-white object-contain")
      ) : sideBySide ? (
        <div className="relative mx-auto aspect-[16/9] w-full overflow-hidden border border-slate-400 bg-white">
          {imageElement("absolute top-1/2 left-1/2 object-contain", turnedInFrameStyle(rotation))}
        </div>
      ) : rotation === 0 ? (
        imageElement("mx-auto block h-auto w-full object-contain")
      ) : isQuarterTurn(rotation) && naturalSize ? (
        // On its side: the box takes the turned shape and the image turns inside it.
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: `${naturalSize.height} / ${naturalSize.width}` }}>
          {imageElement("absolute top-1/2 left-1/2 block h-auto max-w-none", {
            width: `${(naturalSize.width / naturalSize.height) * 100}%`,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          })}
        </div>
      ) : (
        imageElement("mx-auto block h-auto w-full object-contain", { transform: `rotate(${rotation}deg)` })
      )}
      {below.map((caption) => <ImageCaptionLine caption={caption} key={caption.id} below />)}
    </figure>
  );
}

function ImageCaptionLine({ caption, below = false }: { caption: ImageCaption; below?: boolean }) {
  return (
    <figcaption className={cn(below ? "mt-1" : "mb-1", "text-[9px] font-semibold text-slate-600", CAPTION_ALIGN_CLASS[caption.align])}>
      {caption.text.trim()}
    </figcaption>
  );
}

/**
 * A turned image inside the 16:9 frame of a pair: before turning, a quarter
 * turn is as wide as the frame is high and as high as it is wide, so it fits
 * the frame once turned.
 */
function turnedInFrameStyle(rotation: number): CSSProperties {
  const quarter = rotation === 90 || rotation === 270;
  return {
    width: quarter ? "56.25%" : "100%",
    height: quarter ? "177.78%" : "100%",
    maxWidth: "none",
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
  };
}

/**
 * Whether a src can be loaded as is. Datos generales images arrive with their
 * id until the stored image list replaces it with a URL; requesting the id
 * would hit a page route and 404.
 */
function isRenderableImageSource(src: string) {
  return /^(data:|blob:|\/)/.test(src) || src.includes("://");
}
