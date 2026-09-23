import type { ImageContent } from "@/features/valuations/model";
import { resolveImageWidthPercent } from "@/features/valuations/services/document-image-layout";
import { cn } from "@/lib/utils";
import { type CSSProperties } from "react";
import { useLayoutInvalidation } from "./document-preview-page";

const EMPTY_VALUE = "No se proporcionó";

export function DocumentImage({ image }: { image: ImageContent }) {
  const widthPercent = resolveImageWidthPercent(image);
  const widthStyle = {
    width: `${widthPercent}%`,
    maxWidth: "100%",
  } satisfies CSSProperties;

  const captionEnabled = image.captionEnabled ?? false;
  const captionText = image.captionText?.trim() ?? "";
  const captionPosition = image.captionPosition ?? "bottom";
  const captionAlign = image.captionAlign ?? "center";

  const captionAlignClass = captionAlign === "left"
    ? "text-left"
    : captionAlign === "right"
      ? "text-right"
      : "text-center";

  const caption = captionEnabled && captionText ? captionText : null;

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

  return (
    <figure className={cn("mx-auto break-inside-avoid-page")} style={widthStyle}>
      {captionPosition === "top" && caption ? (
        <figcaption className={cn("mb-1 text-[9px] font-semibold text-slate-600", captionAlignClass)}>
          {caption}
        </figcaption>
      ) : null}
      {isRenderableImageSource(image.src) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="mx-auto block h-auto w-full object-contain"
          src={image.src}
          alt={image.title || "Imagen del avalúo"}
          onLoad={() => { handleImageLoad?.(); }}
          onError={() => { handleImageError?.(); }}
        />
      ) : (
        <div className="flex h-24 items-center justify-center border border-dashed border-slate-300 text-[9px] italic text-slate-400">
          {EMPTY_VALUE}
        </div>
      )}
      {captionPosition === "bottom" && caption ? (
        <figcaption className={cn("mt-1 text-[9px] font-semibold text-slate-600", captionAlignClass)}>
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * Whether a src can be loaded as is. Datos generales images arrive with their
 * id until the stored image list replaces it with a URL; requesting the id
 * would hit a page route and 404.
 */
function isRenderableImageSource(src: string) {
  return /^(data:|blob:|\/)/.test(src) || src.includes("://");
}
