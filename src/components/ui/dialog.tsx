"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/**
 * The one look of every popup (docs/DISENO.md): Dialog, AlertDialog, the
 * command palette and the side menu share it, so they cannot drift apart.
 * The overlay is tinted with the logo navy; the surface wears the Valuaxis
 * rule (navy → blue → cyan) with an ice-blue wash behind the header, a
 * navy-tinted shadow and a faint navy ring.
 */
export const POPUP_OVERLAY_CLASS = "bg-primary/30 supports-backdrop-filter:backdrop-blur-[3px]"
export const POPUP_SURFACE_CLASS =
  "rounded-2xl bg-popover brand-popup text-popover-foreground shadow-float ring-1 ring-primary/10"
/** Title of a popup: navy, in the display face. */
export const POPUP_TITLE_CLASS = "font-display text-xl leading-tight font-semibold text-primary"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        POPUP_OVERLAY_CLASS,
        className
      )}
      {...props}
    />
  )
}

function DialogContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto p-4 pt-6 duration-150 outline-none sm:p-6 sm:pt-7 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          POPUP_SURFACE_CLASS,
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          data-slot="dialog-close"
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4 text-muted-foreground hover:text-primary"
              aria-label="Cerrar"
            />
          }
        >
          <XIcon />
        </DialogPrimitive.Close>
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("grid gap-1.5 pr-8", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn(POPUP_TITLE_CLASS, className)} {...props} />
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle }
