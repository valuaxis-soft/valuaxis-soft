import type { ImageCaption, ImageContent } from "@/features/valuations/model";
import { resolveImageWidthPercent } from "@/features/valuations/services/document-image-layout";
import { isQuarterTurn, printedImageCaptions } from "@/features/valuations/services/image-captions";
import { imageFramingScale, imageFramingStyle, LONE_IMAGE_MAX_HEIGHT_PX } from "@/features/valuations/services/image-framing";
import { cn } from "@/lib/utils";
import { useEffect, useState, type CSSProperties } from "react";
import { useLayoutInvalidation } from "./document-preview-page";

const EMPTY_VALUE = "No se proporcionó";

const CAPTION_ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** The frame of every printed image: a firm line, as in the appraiser's format. */
const FRAME_CLASS = "relative overflow-hidden border-2 border-slate-500 bg-white";

/**
 * An image of the document, inside its frame. `sideBySide` is for images that
 * share a row (photo annexes, location sketches): each sits in a frame of the
 * same landscape shape, whatever the proportions of its file, so the pair
 * stays level and compact. A lone image (a plan) keeps its own shape, at most
 * as tall as a page leaves room for, centered under its title.
 *
 * Its framing, the same as the cover image's, fills the frame or shows the
 * image whole, zoomed and moved. Its caption lines print above or below it,
 * in their order. A turned image ("Girar") takes on the page the place its
 * turned shape needs.
 */
export function DocumentImage({
  image,
  sideBySide = false,
  captionSlots,
}: {
  image: ImageContent;
  sideBySide?: boolean;
  /**
   * Caption lines the images of its row print above and below at most: one
   * with fewer keeps their room empty, so the frames of a pair stay level
   * when only one of them has a caption.
   */
  captionSlots?: { top: number; bottom: number };
}) {
  const widthPercent = resolveImageWidthPercent(image);
  const widthStyle = {
    width: `${widthPercent}%`,
    maxWidth: "100%",
  } satisfies CSSProperties;

  const above = printedImageCaptions(image, "top");
  const below = printedImageCaptions(image, "bottom");
  const rotation = image.rotation ?? 0;
  const framingStyle = imageFramingStyle(image.framing);
  // The file's own proportions, known once it loads: they shape a lone frame, and a quarter turn swaps them.
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const layoutInvalidation = useLayoutInvalidation();
  const handleImageLoad = layoutInvalidation?.requestPagination;
  // The frame takes the file's shape once known: the pages are measured again.
  useEffect(() => {
    if (naturalSize) handleImageLoad?.();
  }, [naturalSize, handleImageLoad]);

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

  const recordSize = (element: HTMLImageElement) => {
    const { naturalWidth, naturalHeight } = element;
    if (naturalWidth && naturalHeight && (naturalSize?.width !== naturalWidth || naturalSize?.height !== naturalHeight)) {
      setNaturalSize({ width: naturalWidth, height: naturalHeight });
    }
  };

  const imageElement = (className: string, style?: CSSProperties) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      style={style}
      src={image.src}
      alt={image.title || "Imagen del avalúo"}
      data-image-rotation={rotation || undefined}
      // An image the browser had loaded before hydration fires no load event: read its size here too.
      ref={(element) => { if (element?.complete) recordSize(element); }}
      onLoad={(event) => {
        recordSize(event.currentTarget);
        handleImageLoad?.();
      }}
      onError={() => { handleImageError?.(); }}
    />
  );

  return (
    <figure className={cn("mx-auto break-inside-avoid-page")} style={widthStyle} data-image-frame={sideBySide ? "pair" : "lone"}>
      {Array.from({ length: Math.max(0, (captionSlots?.top ?? 0) - above.length) }, (_, index) => <CaptionRoom key={`room-top-${index}`} />)}
      {above.map((caption) => <ImageCaptionLine caption={caption} key={caption.id} />)}
      {!isRenderableImageSource(image.src) ? (
        <div className="flex h-24 items-center justify-center border border-dashed border-slate-300 text-[9px] italic text-slate-400">
          {EMPTY_VALUE}
        </div>
      ) : sideBySide ? (
        <div className={cn("mx-auto aspect-video w-full", FRAME_CLASS)}>
          {rotation === 0
            ? imageElement("block h-full w-full", framingStyle)
            : imageElement("absolute top-1/2 left-1/2", turnedInFrameStyle(rotation, image))}
        </div>
      ) : isQuarterTurn(rotation) && naturalSize ? (
        // On its side: the frame takes the turned shape and the image turns inside it.
        <div className={cn("mx-auto", FRAME_CLASS)} style={loneFrameStyle(naturalSize.height, naturalSize.width)}>
          {imageElement("absolute top-1/2 left-1/2 block h-auto max-w-none", {
            width: `${(naturalSize.width / naturalSize.height) * 100}%`,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)${zoomTransform(image)}`,
          })}
        </div>
      ) : (
        <div className={cn("mx-auto", FRAME_CLASS)} style={naturalSize ? loneFrameStyle(naturalSize.width, naturalSize.height) : undefined}>
          {imageElement(
            naturalSize ? "block h-full w-full" : "block h-auto w-full object-contain",
            !naturalSize
              // Until its shape is known it is never taller than a page leaves room for either.
              ? { maxHeight: LONE_IMAGE_MAX_HEIGHT_PX, ...(rotation ? { transform: `rotate(${rotation}deg)` } : {}) }
              : rotation === 0
              ? framingStyle
              : { ...framingStyle, transform: `rotate(${rotation}deg)${framingStyle.transform ? ` ${framingStyle.transform}` : ""}` },
          )}
        </div>
      )}
      {below.map((caption) => <ImageCaptionLine caption={caption} key={caption.id} below />)}
      {Array.from({ length: Math.max(0, (captionSlots?.bottom ?? 0) - below.length) }, (_, index) => <CaptionRoom key={`room-bottom-${index}`} below />)}
    </figure>
  );
}

/**
 * The frame of a lone image: its own shape, as wide as its place allows but
 * never taller than a page leaves room for.
 */
function loneFrameStyle(width: number, height: number): CSSProperties {
  return {
    width: `min(100%, ${Math.round((LONE_IMAGE_MAX_HEIGHT_PX * width) / height)}px)`,
    aspectRatio: `${width} / ${height}`,
  };
}

/** The room of a caption line the image does not have: as tall as one, empty. */
function CaptionRoom({ below = false }: { below?: boolean }) {
  return <div aria-hidden="true" className={cn(below ? "mt-1" : "mb-1", "invisible text-[9px] font-semibold")} data-caption-room="">&nbsp;</div>;
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
 * the frame once turned. Its framing applies too.
 */
function turnedInFrameStyle(rotation: number, image: Pick<ImageContent, "framing">): CSSProperties {
  const quarter = rotation === 90 || rotation === 270;
  const { objectFit, objectPosition } = imageFramingStyle(image.framing);
  return {
    width: quarter ? "56.25%" : "100%",
    height: quarter ? "177.78%" : "100%",
    maxWidth: "none",
    objectFit,
    objectPosition,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)${zoomTransform(image)}`,
  };
}

/** The zoom of the image's framing, to add after a turn; nothing at its own size. */
function zoomTransform(image: Pick<ImageContent, "framing">) {
  const scale = imageFramingScale(image.framing);
  return scale === 1 ? "" : ` scale(${scale})`;
}

/**
 * Whether a src can be loaded as is. Datos generales images arrive with their
 * id until the stored image list replaces it with a URL; requesting the id
 * would hit a page route and 404.
 */
function isRenderableImageSource(src: string) {
  return /^(data:|blob:|\/)/.test(src) || src.includes("://");
}
