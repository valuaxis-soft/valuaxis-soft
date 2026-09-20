"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  BlockEditorCard,
  BlockEditorContent,
  BlockEditorHeader,
} from "./section-editor";
import { StructuralActions } from "./structural-actions";
import type { ConceptPresentation } from "@/features/valuations/services/concept-presentation";

type BlockCardProps = {
  // Card shell
  cardRef: (node: HTMLElement | null) => void;
  style?: CSSProperties;
  className?: string;

  // Header
  badge?: ReactNode;
  dragHandle?: ReactNode;
  title: ReactNode;
  titleEdit?: {
    disabled: boolean;
    value: string;
    onChange: (value: string) => void;
  };

  // Structural actions (passed to StructuralActions)
  structuralActions?: {
    conceptPresentation?: ConceptPresentation;
    disabled?: boolean;
    itemLabel: string;
    move?: {
      canMoveDown: boolean;
      canMoveUp: boolean;
      onMoveDown: () => void;
      onMoveUp: () => void;
    };
    onConceptPresentationChange?: (next: ConceptPresentation | undefined) => void;
    onResetConceptPresentations?: () => void;
    visibility?: {
      onChange: (visible: boolean) => void;
      visible: boolean;
    };
    pageBreak?: {
      onChange: (value: boolean) => void;
      value: boolean;
    };
    deleteAction?: {
      onDelete: () => void;
      size?: "icon" | "icon-sm";
    };
  };

  // Content
  children?: ReactNode;
};

export function BlockCard({
  cardRef,
  style,
  className,
  badge,
  dragHandle,
  title,
  titleEdit,
  structuralActions,
  children,
}: BlockCardProps) {
  return (
    <BlockEditorCard
      cardRef={cardRef}
      style={style}
      className={className}
    >
      <BlockEditorHeader
        badge={badge}
        dragHandle={dragHandle}
        title={title}
        titleEdit={titleEdit}
      >
        {structuralActions ? (
          <StructuralActions
            conceptPresentation={structuralActions.conceptPresentation}
            disabled={structuralActions.disabled}
            itemLabel={structuralActions.itemLabel}
            onConceptPresentationChange={structuralActions.onConceptPresentationChange}
            onResetConceptPresentations={structuralActions.onResetConceptPresentations}
            move={structuralActions.move}
            visibility={structuralActions.visibility}
            pageBreak={structuralActions.pageBreak}
            deleteAction={structuralActions.deleteAction}
          />
        ) : null}
      </BlockEditorHeader>
      <BlockEditorContent>
        {children}
      </BlockEditorContent>
    </BlockEditorCard>
  );
}
