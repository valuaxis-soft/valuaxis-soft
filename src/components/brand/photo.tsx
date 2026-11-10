import { getImageProps, type ImageProps } from "next/image";

/**
 * A `next/image` photo rendered on the server: same optimizer, srcset, sizes
 * and lazy loading, but as a plain `<img>`, so marketing pages ship no client
 * JavaScript for their pictures. Photos are decorative here (`alt=""`).
 */
export function Photo(props: Omit<ImageProps, "alt"> & { alt?: string }) {
  const { props: imgProps } = getImageProps({ alt: "", ...props });
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- getImageProps already carries the optimized src, srcset and alt.
  return <img {...imgProps} />;
}
