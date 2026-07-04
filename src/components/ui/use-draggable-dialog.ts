"use client"

import * as React from "react"

type DragOffset = {
  x: number
  y: number
}

type DraggableDialogOptions = {
  style?: React.CSSProperties
  handleSlots: string[]
  transformMode: "mobile-sheet" | "centered"
}

const VIEWPORT_MARGIN = 8

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      [
        "button",
        "input",
        "textarea",
        "select",
        "a",
        "[contenteditable=true]",
        "[role=button]",
        "[role=checkbox]",
        "[role=combobox]",
        "[role=menuitem]",
        "[role=option]",
        "[data-radix-popper-content-wrapper]",
      ].join(",")
    )
  )
}

function isDragHandle(target: EventTarget | null, root: HTMLElement, handleSlots: string[]) {
  if (!(target instanceof HTMLElement)) return false
  if (target === root) return true
  return handleSlots.some((slot) => Boolean(target.closest(`[data-slot="${slot}"]`)))
}

function clamp(value: number, min: number, max: number) {
  if (min > max) return value
  return Math.min(max, Math.max(min, value))
}

export function useDraggableDialog<T extends HTMLElement>({
  style,
  handleSlots,
  transformMode,
}: DraggableDialogOptions) {
  const contentRef = React.useRef<T | null>(null)
  const [offset, setOffset] = React.useState<DragOffset>({ x: 0, y: 0 })
  const [dragging, setDragging] = React.useState(false)
  const [isDesktop, setIsDesktop] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)")
    const updateViewportMode = () => setIsDesktop(mediaQuery.matches)

    updateViewportMode()

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateViewportMode)
      return () => mediaQuery.removeEventListener("change", updateViewportMode)
    }

    mediaQuery.addListener(updateViewportMode)
    return () => mediaQuery.removeListener(updateViewportMode)
  }, [])

  const onPointerDown = React.useCallback((event: React.PointerEvent<T>) => {
    if (event.button !== 0) return
    const root = contentRef.current
    if (!root) return
    if (isInteractiveTarget(event.target)) return
    if (!isDragHandle(event.target, root, handleSlots)) return

    event.preventDefault()
    root.setPointerCapture?.(event.pointerId)
    setDragging(true)

    const startX = event.clientX
    const startY = event.clientY
    const startOffset = { ...offset }
    const startRect = root.getBoundingClientRect()

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY
      const minX = startOffset.x + VIEWPORT_MARGIN - startRect.left
      const maxX = startOffset.x + window.innerWidth - VIEWPORT_MARGIN - startRect.right
      const minY = startOffset.y + VIEWPORT_MARGIN - startRect.top
      const maxY = startOffset.y + window.innerHeight - VIEWPORT_MARGIN - startRect.bottom

      setOffset({
        x: clamp(startOffset.x + deltaX, minX, maxX),
        y: clamp(startOffset.y + deltaY, minY, maxY),
      })
    }

    const stopDragging = () => {
      setDragging(false)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", stopDragging)
      window.removeEventListener("pointercancel", stopDragging)
    }

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", stopDragging)
    window.addEventListener("pointercancel", stopDragging)
  }, [handleSlots, offset])

  const draggableStyle = React.useMemo(() => {
    const x = `${offset.x}px`
    const y = `${offset.y}px`
    const shouldCenter = transformMode === "centered" || isDesktop
    const transform = shouldCenter
      ? `translate(calc(-50% + ${x}), calc(-50% + ${y}))`
      : `translate(calc(-50% + ${x}), ${y})`

    return {
      ...style,
      ...(shouldCenter ? { left: "50%", top: "50%" } : null),
      translate: "none",
      transform,
    } as React.CSSProperties
  }, [isDesktop, offset.x, offset.y, style, transformMode])

  return {
    contentRef,
    dragging,
    draggableStyle,
    onPointerDown,
  }
}
