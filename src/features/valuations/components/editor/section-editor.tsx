"use client";

import type { CSSProperties, ReactNode } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";


export function BlockEditorCard({
  cardRef,
  children,
  className,
  style,
}: {
  cardRef: (node: HTMLElement | null) => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Card ref={cardRef} style={style} className={className}>
      {children}
    </Card>
  );
}

export function BlockEditorHeader({
  badge,
  children,
  dragHandle,
  title,
  titleEdit,
}: {
  badge?: ReactNode;
  children: ReactNode;
  dragHandle?: ReactNode;
  title: ReactNode;
  titleEdit?: {
    disabled: boolean;
    value: string;
    onChange: (value: string) => void;
  };
}) {
  return (
    <CardHeader className="border-b border-[#00285A]/20 bg-[#00285A]/[0.05]">
      <CardTitle className="flex min-w-0 items-center gap-2">
        {dragHandle}
        {badge ? <Badge>{badge}</Badge> : null}
        {titleEdit ? (
          <Input
            aria-label="Título de la sección"
            className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm font-black uppercase leading-tight text-[#00285A] shadow-none hover:bg-background/70 focus-visible:border-ring focus-visible:bg-background"
            disabled={titleEdit.disabled}
            value={titleEdit.value}
            onChange={(event) => titleEdit.onChange(event.target.value)}
          />
        ) : (
          <span className="min-w-0 flex-1 text-sm font-black uppercase leading-tight text-[#00285A]">
            {title}
          </span>
        )}
      </CardTitle>
      <CardAction className="flex shrink-0 items-center gap-2">
        {children}
      </CardAction>
    </CardHeader>
  );
}

export function BlockEditorContent({ children }: { children: ReactNode }) {
  return (
    <CardContent className="space-y-5">
      {children}
    </CardContent>
  );
}