"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/* ————————————————— تعبیه‌ی کشیدن و رها کردن ————————————————— */

/**
 * پوشش‌دهنده‌ی جابه‌جایی ردیف‌های لیست با کشیدن و رها کردن (@dnd-kit).
 *
 *   <SortableRows ids={ids} onReorder={save} disabled={!canReorder}>
 *     …ردیف‌های <SortableTableRow id={item.id}>…
 *   </SortableRows>
 *
 * · ids — ترتیب جاری ردیف‌ها (شناسه‌ها)
 * · onReorder — ترتیب جدید کل لیست پس از رها کردن آیتم
 * · disabled — وقتی فیلتر/جستجو فعال است ردیف‌ها بدون دستگیره رندر می‌شوند
 *   تا ترتیبِ فیلترشده با ترتیب واقعی خلط نشود
 */
export function SortableRows({
  ids,
  onReorder,
  disabled = false,
  children,
}: {
  ids: string[];
  onReorder: (orderedIds: string[]) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    // فاصله‌ی ۶ پیکسل برای متمایز شدن از کلیک روی دکمه‌های ردیف
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  if (disabled) return <>{children}</>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/* ————————————————— دستگیره‌ی کشیدن ————————————————— */

type HandleProps = React.HTMLAttributes<HTMLButtonElement> &
  Record<string, unknown>;

/** سلول دستگیره‌ی کشیدن — attributes/listeners خودِ آیتم روی دکمه نشسته‌اند */
function DragHandle({
  handleProps,
  label,
  active = false,
}: {
  handleProps: HandleProps;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      {...handleProps}
      aria-label={label}
      title="برای تغییر ترتیب، بکشید و رها کنید"
      className={cn(
        "flex size-7 cursor-grab touch-none select-none items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
        active && "text-teal-600 dark:text-teal-300"
      )}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

/**
 * ردیف جدول قابل کشیدن — یک سلول دستگیره در ابتدای ردیف می‌افزاید؛
 * سرستون متناظر را ماژول مصرف‌کننده اضافه می‌کند (w-10).
 * enabled=false ردیف عادی رندر می‌کند (بدون دستگیره).
 */
export function SortableTableRow({
  id,
  enabled = true,
  className,
  children,
}: {
  id: string;
  enabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties | undefined =
    enabled && transform
      ? {
          transform: CSS.Translate.toString(transform),
          transition: transition ?? undefined,
          position: "relative",
        }
      : undefined;

  const handleProps = {
    ...attributes,
    ...listeners,
    ref: setActivatorNodeRef,
  } as HandleProps;

  return (
    <TableRow
      ref={enabled ? setNodeRef : undefined}
      style={style}
      className={cn(
        enabled && isDragging && "z-20 opacity-70 ring-1 ring-teal-500/40",
        className
      )}
    >
      {enabled ? (
        <TableCell className="w-10 p-1 align-middle">
          <DragHandle
            handleProps={handleProps}
            label="تغییر ترتیب ردیف"
            active={isDragging}
          />
        </TableCell>
      ) : null}
      {children}
    </TableRow>
  );
}

/**
 * کارت موبایل قابل کشیدن — دستگیره شناور بالای کارت؛
 * برای لیست‌های کارتی موبایل (بدون جدول).
 */
export function SortableCard({
  id,
  enabled = true,
  className,
  children,
}: {
  id: string;
  enabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties | undefined =
    enabled && transform
      ? {
          transform: CSS.Translate.toString(transform),
          transition: transition ?? undefined,
        }
      : undefined;

  const handleProps = {
    ...attributes,
    ...listeners,
    ref: setActivatorNodeRef,
  } as HandleProps;

  return (
    <li
      ref={enabled ? setNodeRef : undefined}
      style={style}
      className={cn(
        "relative list-none",
        enabled && isDragging && "z-20 opacity-70 ring-1 ring-teal-500/40",
        className
      )}
    >
      {enabled ? (
        <span className="absolute -top-2 end-2 z-10 flex rounded-lg bg-background/90 shadow-sm backdrop-blur-sm dark:bg-background/90">
          <DragHandle handleProps={handleProps} label="تغییر ترتیب کارت" active={isDragging} />
        </span>
      ) : null}
      {children}
    </li>
  );
}
