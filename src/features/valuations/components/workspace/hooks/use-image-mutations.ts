import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api-client";
import type { ImageContent, PrincipalCoverImage } from "@/features/valuations/model";
import {
  COMPANY_HEADER_BLOCK_ID,
  ensureCompanyHeaderFields,
} from "@/features/valuations/services/caratula-company-header";
import { resolveContentLayout } from "@/features/valuations/services/content-layout";
import { newId } from "../model/content-factories";
import {
  imageContentFromDocumentHeaderImage,
  mergeDatosImages,
  mergeDocumentHeaderImage,
} from "../model/initial-hydration";
import { textEditGroupKey } from "../model/editor-history";
import { ensureBlockContentIntegrity, getDocumentHeaderImage } from "../model/section-content";
import type { EditorState } from "./use-editor-state";

const DOCUMENT_HEADER_IMAGE_ACCEPT = new Set(["image/png", "image/jpeg", "image/webp"]);
const DOCUMENT_HEADER_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const DOCUMENT_HEADER_IMAGE_FORMAT_ERROR = "Formato no compatible. Usa PNG, JPG, JPEG o WebP.";

function isSupportedDocumentHeaderImage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return DOCUMENT_HEADER_IMAGE_ACCEPT.has(file.type) &&
    DOCUMENT_HEADER_IMAGE_EXTENSIONS.has(extension);
}

/**
 * Images: principal cover image, document header image, Datos generales images
 * (stored per valuation) and generic block/apartado images.
 */
export function useImageMutations({
  canEdit,
  sections,
  setSections,
  snapshotRef,
  updateSectionBlocks,
  updateSections,
  valuationId,
}: Pick<EditorState, "sections" | "setSections" | "snapshotRef" | "updateSectionBlocks" | "updateSections"> & {
  canEdit: boolean;
  valuationId: string | null;
}) {
  const [principalCoverImage, setPrincipalCoverImage] = useState<PrincipalCoverImage | null>(null);
  const [uploadingDocumentHeaderImage, setUploadingDocumentHeaderImage] = useState(false);
  const [uploadingCoverImage, setUploadingCoverImage] = useState(false);
  const documentHeaderImage = getDocumentHeaderImage(sections);

  useEffect(() => {
    let active = true;
    if (!valuationId) {
      return;
    }
    api.valuations.coverImage
      .get(valuationId)
      .then((image) => {
        if (active) setPrincipalCoverImage(image);
      })
      .catch(() => {
        if (active) setPrincipalCoverImage(null);
      });
    return () => {
      active = false;
    };
  }, [valuationId]);

  useEffect(() => {
    let active = true;
    if (!valuationId) return;
    api.valuations.documentHeaderImage
      .get(valuationId)
      .then((image) => {
        if (active) setSections((current) => mergeDocumentHeaderImage(current, image));
      })
      .catch(() => {
        // La estructura editable permanece aunque no se pueda renovar la URL temporal.
      });
    return () => {
      active = false;
    };
  }, [setSections, valuationId]);

  useEffect(() => {
    let active = true;
    if (!valuationId) return;
    api.valuations.datosImages
      .list(valuationId)
      .then((images) => {
        if (active) setSections((current) => mergeDatosImages(current, images));
      })
      .catch(() => {
        // Los nodos existentes siguen disponibles aunque no se pueda renovar la URL temporal.
      });
    return () => {
      active = false;
    };
  }, [setSections, valuationId]);

  const handlePrincipalCoverImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !valuationId || !canEdit) return;
    setUploadingCoverImage(true);
    try {
      const image = await api.valuations.coverImage.upload(valuationId, file);
      setPrincipalCoverImage(image);
      toast.success("Imagen principal actualizada.");
    } catch {
      toast.error("No se pudo subir la imagen. Verifica el archivo.");
    } finally {
      setUploadingCoverImage(false);
    }
  };

  const updateDocumentHeaderImage = (image: ImageContent | null) => {
    updateSections((current) =>
      ensureCompanyHeaderFields(current).map((section) => {
        if (section.id !== "caratula") return section;
        return {
          ...section,
          blocks: section.blocks.map((block) =>
            block.id === COMPANY_HEADER_BLOCK_ID
              ? { ...block, images: image ? [image] : [] }
              : block,
          ),
        };
      }),
    );
  };

  const handleDocumentHeaderImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canEdit) return;

    if (!isSupportedDocumentHeaderImage(file)) {
      toast.error(DOCUMENT_HEADER_IMAGE_FORMAT_ERROR);
      return;
    }

    if (!valuationId) {
      toast.error("Guarda el avalúo antes de agregar imagen al encabezado.");
      return;
    }

    setUploadingDocumentHeaderImage(true);
    try {
      const uploaded = await api.valuations.documentHeaderImage.upload(valuationId, file);
      updateDocumentHeaderImage(imageContentFromDocumentHeaderImage(uploaded));
      toast.success("Imagen del encabezado actualizada.");
    } catch {
      toast.error("No se pudo subir la imagen del encabezado.");
    } finally {
      setUploadingDocumentHeaderImage(false);
    }
  };

  const removeDocumentHeaderImage = async () => {
    const previous = documentHeaderImage;
    updateDocumentHeaderImage(null);
    if (!valuationId || !previous) return;

    try {
      await api.valuations.documentHeaderImage.delete(valuationId);
    } catch {
      updateDocumentHeaderImage(previous);
      toast.error("No se pudo eliminar la imagen del encabezado.");
    }
  };

  const addImage = async (
    sectionId: string,
    blockId: string,
    event: ChangeEvent<HTMLInputElement>,
    apartadoId?: string,
    replaceImageId?: string,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      toast.loading("Subiendo imagen...");
      const isDatos = sectionId === "datos" || sectionId === "datosGenerales";
      if (isDatos && !valuationId) {
        throw new Error("Guarda el avalúo antes de agregar imágenes a Datos generales.");
      }
      const uploaded = isDatos
        ? await api.valuations.datosImages.upload(
            valuationId!,
            file,
            blockId,
            apartadoId,
          )
        : await api.uploads.create(file);
      toast.dismiss();
      toast.success("Imagen subida");

      const image: ImageContent = {
        id: isDatos ? uploaded.id : newId(),
        title: isDatos ? uploaded.filename : file.name,
        src: uploaded.url ?? "",
        enabled: true,
      };
      updateSectionBlocks(sectionId, (blocks) =>
        blocks.map((block) => {
          if (block.id !== blockId) return block;
          if (!apartadoId) {
            const updated = {
              ...block,
              images: replaceImageId
                ? block.images.map((current) => current.id === replaceImageId
                  ? { ...image, id: current.id, title: current.title || image.title }
                  : current)
                : [...block.images, image],
            };
            return ensureBlockContentIntegrity(updated);
          }
          return {
            ...block,
            apartados: block.apartados.map((subBlock) => {
              if (subBlock.id !== apartadoId) return subBlock;
              const updated = {
                ...subBlock,
                images: replaceImageId
                  ? subBlock.images.map((current) => current.id === replaceImageId
                    ? { ...image, id: current.id, title: current.title || image.title }
                    : current)
                  : [...subBlock.images, image],
              };
              // Reconcile content layout so the new image appears in the form
              return { ...updated, contentLayout: resolveContentLayout(updated) };
            }),
          };
        }),
      );
    } catch (err) {
      toast.dismiss();
      toast.error(`Error al subir imagen: ${err instanceof Error ? err.message : "Error desconocido"}`);
    }
    event.target.value = "";
  };

  const updateImage = (
    sectionId: string,
    blockId: string,
    imageId: string,
    patch: Partial<ImageContent>,
    apartadoId?: string,
  ) => {
    updateSectionBlocks(
      sectionId,
      (blocks) =>
        blocks.map((block) => {
          if (block.id !== blockId) return block;
          if (!apartadoId) {
            return {
              ...block,
              images: block.images.map((image) => (image.id === imageId ? { ...image, ...patch } : image)),
            };
          }
          return {
            ...block,
            apartados: block.apartados.map((subBlock) =>
              subBlock.id === apartadoId
                ? {
                    ...subBlock,
                    images: subBlock.images.map((image) =>
                      image.id === imageId ? { ...image, ...patch } : image,
                    ),
                  }
                : subBlock,
            ),
          };
        }),
      { groupKey: textEditGroupKey(`image:${imageId}`, patch) },
    );
  };

  const removeImage = async (
    sectionId: string,
    blockId: string,
    imageId: string,
    apartadoId?: string,
  ) => {
    const isDatos = sectionId === "datos" || sectionId === "datosGenerales";
    const latestSections = snapshotRef.current?.sections ?? sections;
    const targetSection = latestSections.find((section) => section.id === sectionId);
    const targetBlock = targetSection?.blocks.find((block) => block.id === blockId);
    const targetSubBlock = targetBlock?.apartados.find((subBlock) => subBlock.id === apartadoId);
    // Capture the image for surgical rollback before optimistic removal
    let removedImage: { image: ImageContent; index: number; inSubBlock: boolean } | null = null;
    if (isDatos && valuationId) {
      const container = apartadoId ? targetSubBlock : targetBlock;
      if (container) {
        const idx = container.images.findIndex((img) => img.id === imageId);
        if (idx !== -1) {
          removedImage = { image: container.images[idx], index: idx, inSubBlock: Boolean(apartadoId) };
        }
      }
      // Optimistic: remove from local state immediately so any concurrent
      // handleSave builds its payload without this image.
      updateSectionBlocks(sectionId, (blocks) =>
        blocks.map((block) => {
          if (block.id !== blockId) return block;
          if (!apartadoId) return { ...block, images: block.images.filter((image) => image.id !== imageId) };
          return {
            ...block,
            apartados: block.apartados.map((subBlock) => {
              if (subBlock.id !== apartadoId) return subBlock;
              const updated = { ...subBlock, images: subBlock.images.filter((image) => image.id !== imageId) };
              return { ...updated, contentLayout: resolveContentLayout(updated) };
            }),
          };
        }),
      );
      try {
        await api.valuations.datosImages.delete(valuationId, imageId);
      } catch (error) {
        // Surgical rollback: re-insert only the removed image at its original position
        if (removedImage) {
          updateSectionBlocks(sectionId, (blocks) =>
            blocks.map((block) => {
              if (block.id !== blockId) return block;
              if (removedImage!.inSubBlock) {
                if (apartadoId === undefined) return block;
                return {
                  ...block,
                  apartados: block.apartados.map((subBlock) => {
                    if (subBlock.id !== apartadoId) return subBlock;
                    // Guard against duplicate if image was re-added by other means
                    if (subBlock.images.some((img) => img.id === imageId)) return subBlock;
                    const reinserted = [...subBlock.images];
                    reinserted.splice(removedImage!.index, 0, removedImage!.image);
                    const updated = { ...subBlock, images: reinserted };
                    return { ...updated, contentLayout: resolveContentLayout(updated) };
                  }),
                };
              }
              // Block-level rollback
              if (block.images.some((img) => img.id === imageId)) return block;
              const reinserted = [...block.images];
              reinserted.splice(removedImage!.index, 0, removedImage!.image);
              return { ...block, images: reinserted };
            }),
          );
        }
        toast.error(`No se pudo quitar la imagen: ${error instanceof Error ? error.message : "Error desconocido"}`);
        return;
      }
      return;
    }
    // Non-DATOS path: local-only removal (no backend delete needed)
    updateSectionBlocks(sectionId, (blocks) =>
      blocks.map((block) => {
        if (block.id !== blockId) return block;
        if (!apartadoId) return { ...block, images: block.images.filter((image) => image.id !== imageId) };
        return {
          ...block,
          apartados: block.apartados.map((subBlock) => {
            if (subBlock.id !== apartadoId) return subBlock;
            const updated = { ...subBlock, images: subBlock.images.filter((image) => image.id !== imageId) };
            return { ...updated, contentLayout: resolveContentLayout(updated) };
          }),
        };
      }),
    );
  };

  return {
    addImage,
    documentHeaderImage,
    handleDocumentHeaderImageUpload,
    handlePrincipalCoverImageUpload,
    principalCoverImage,
    removeDocumentHeaderImage,
    removeImage,
    updateImage,
    uploadingCoverImage,
    uploadingDocumentHeaderImage,
  };
}
