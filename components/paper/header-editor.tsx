"use client";

// ============================================================
//  Paper Header Editor
//
//  • Rows hold cells that sit SIDE BY SIDE (logo next to the
//    school name, contact block in a third column…)
//  • Drag the ⋮⋮ handle to reorder rows, or drag a cell into
//    another row to move it
//  • Layout presets give a well-aligned header in one click
// ============================================================

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HeaderRenderer } from "./header-renderer";
import {
  HEADER_ALIGNS,
  HEADER_COLOR_PRESETS,
  HEADER_DIVIDER_STYLES,
  HEADER_FONT_OPTIONS,
  HEADER_LIMITS,
  HEADER_PRESETS,
  HEADER_TOKENS,
  HEADER_V_ALIGNS,
  HEADER_WIDTH_OPTIONS,
  newCellsRow,
  newDividerRow,
  newLogoCell,
  newTextCell,
  type HeaderAlign,
  type HeaderCell,
  type HeaderCellsRow,
  type HeaderConfig,
  type HeaderDividerRow,
  type HeaderDividerStyle,
  type HeaderFontFamily,
  type HeaderRow,
  type HeaderTokenContext,
  type SchoolHeaderProfile,
  type HeaderVAlign,
} from "@/lib/paper-header";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImageIcon,
  MinusIcon,
  Plus,
  TextIcon,
  Trash2,
  X,
} from "lucide-react";

type Props = {
  value: HeaderConfig;
  onChange: (config: HeaderConfig) => void;
  context: HeaderTokenContext;
  logoUrl: string | null;
  schoolDefault: HeaderConfig | null;
  /** School details used to build the layout presets. */
  schoolProfile?: SchoolHeaderProfile | null;
};

type DragPayload =
  | { kind: "row"; rowId: string }
  | { kind: "cell"; rowId: string; cellId: string };

/**
 * Where a drop would land.
 *   • `row`   — put the dragged row before/after this one
 *   • `cells` — put the dragged cell into `rowId` at `gapIndex`, counted in the
 *               row's *pre-removal* cell array (0 … cells.length)
 */
type DropTarget =
  | { kind: "row"; rowId: string; mode: "before" | "after" }
  | { kind: "cells"; rowId: string; gapIndex: number };

const ALIGN_SHORT: Record<HeaderAlign, string> = { left: "L", center: "C", right: "R" };

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Whether a row would render anything at all in its preview. */
function rowHasContent(row: HeaderCellsRow): boolean {
  return row.cells.some((cell) =>
    cell.content.type === "logo" ? true : cell.content.text.trim() !== ""
  );
}

export function HeaderEditor({
  value,
  onChange,
  context,
  logoUrl,
  schoolDefault,
  schoolProfile,
}: Props) {
  // Refs mirror the drag state so the pointerup handler can never read a stale
  // closure — a pointermove and its pointerup can land in the same React batch.
  const dragRef = useRef<DragPayload | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  function setTarget(target: DropTarget | null) {
    dropTargetRef.current = target;
    setDropTarget(target);
  }

  const isDefault = schoolDefault
    ? JSON.stringify(value) === JSON.stringify(schoolDefault)
    : false;

  // ── mutations ──
  function setRows(rows: HeaderRow[]) {
    onChange({ rows });
  }

  function patchRow(
    rowId: string,
    patch: Partial<HeaderCellsRow> | Partial<HeaderDividerRow>
  ) {
    setRows(value.rows.map((r) => (r.id === rowId ? ({ ...r, ...patch } as HeaderRow) : r)));
  }

  function patchCell(rowId: string, cellId: string, patch: Partial<HeaderCell>) {
    setRows(
      value.rows.map((r) =>
        r.id === rowId && r.type === "cells"
          ? { ...r, cells: r.cells.map((c) => (c.id === cellId ? { ...c, ...patch } : c)) }
          : r
      )
    );
  }

  function patchCellContent(rowId: string, cellId: string, patch: Record<string, unknown>) {
    setRows(
      value.rows.map((r) =>
        r.id === rowId && r.type === "cells"
          ? {
              ...r,
              cells: r.cells.map((c) =>
                c.id === cellId ? { ...c, content: { ...c.content, ...patch } } : c
              ),
            }
          : r
      )
    );
  }

  function addRow() {
    if (value.rows.length >= HEADER_LIMITS.maxRows) return;
    setRows([...value.rows, newCellsRow([newTextCell({ text: "New line" }, "center")])]);
  }

  function addDivider() {
    if (value.rows.length >= HEADER_LIMITS.maxRows) return;
    setRows([...value.rows, newDividerRow()]);
  }

  function removeRow(rowId: string) {
    setRows(value.rows.filter((r) => r.id !== rowId));
  }

  function addCell(rowId: string, type: "text" | "logo") {
    const row = value.rows.find((r) => r.id === rowId);
    if (!row || row.type !== "cells") return;
    if (row.cells.length >= HEADER_LIMITS.maxCellsPerRow) return;
    // A lone column fills the row; added columns hug the logo and let the text
    // absorb whatever space is left, which is what makes them sit side by side.
    const populated = row.cells.length > 0;
    const cell =
      type === "text"
        ? newTextCell({ text: "" }, "left", populated ? "fill" : 1)
        : newLogoCell(72, "left", "auto");
    patchRow(rowId, { cells: [...row.cells, cell] });
  }

  function removeCell(rowId: string, cellId: string) {
    const row = value.rows.find((r) => r.id === rowId);
    if (!row || row.type !== "cells") return;
    const cells = row.cells.filter((c) => c.id !== cellId);
    // A cells row without cells is meaningless — drop it.
    if (cells.length === 0) {
      removeRow(rowId);
      return;
    }
    patchRow(rowId, { cells });
  }

  // ── drag & drop ──
  //
  // Pointer events rather than HTML5 drag-and-drop: they fire for a mouse, a
  // pen and a finger, so dragging a column works on a tablet too. The handle
  // captures the pointer, then every move hit-tests whatever sits underneath
  // for a [data-drop] target.

  function beginDrag(e: ReactPointerEvent<HTMLElement>, payload: DragPayload) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = payload;
    setDrag(payload);
    setTarget(null);
  }

  function updateDrag(e: ReactPointerEvent<HTMLElement>) {
    const payload = dragRef.current;
    if (!payload) return;

    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (!under) return;
    const zone = under.closest<HTMLElement>("[data-drop]");
    if (!zone) return;

    // Reordering rows ignores the finer cell targets stacked inside them.
    if (payload.kind === "row") {
      const rowEl = under.closest<HTMLElement>('[data-drop="row"]');
      const rowId = rowEl?.dataset.rowId;
      if (!rowEl || !rowId) return;
      const rect = rowEl.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      setTarget({ kind: "row", rowId, mode: after ? "after" : "before" });
      return;
    }

    const rowId = zone.dataset.rowId;
    if (!rowId) return;

    if (zone.dataset.drop === "cell") {
      const cellIndex = Number(zone.dataset.cellIndex ?? "0");
      const rect = zone.getBoundingClientRect();
      // The left half of a column drops before it, the right half after it.
      const gapIndex = e.clientX < rect.left + rect.width / 2 ? cellIndex : cellIndex + 1;
      setTarget({ kind: "cells", rowId, gapIndex });
      return;
    }

    const row = value.rows.find((r) => r.id === rowId);
    if (!row || row.type !== "cells") return;
    // The row background and the "drop here" strip both append a last column.
    setTarget({ kind: "cells", rowId, gapIndex: row.cells.length });
  }

  function endDrag(e: ReactPointerEvent<HTMLElement>) {
    const target = dropTargetRef.current;
    const payload = dragRef.current;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
    dropTargetRef.current = null;
    setDrag(null);
    setDropTarget(null);

    if (!target || !payload) return;

    if (payload.kind === "row") {
      if (target.kind === "row") moveRow(payload.rowId, target.rowId, target.mode);
      return;
    }

    if (target.kind === "cells") {
      moveCell(payload.rowId, payload.cellId, target.rowId, target.gapIndex);
    }
  }

  function moveRow(fromId: string, toId: string, mode: "before" | "after") {
    if (fromId === toId) return;
    const rows = [...value.rows];
    const fromIdx = rows.findIndex((r) => r.id === fromId);
    if (fromIdx < 0) return;
    const [moved] = rows.splice(fromIdx, 1);
    let toIdx = rows.findIndex((r) => r.id === toId);
    if (toIdx < 0) return;
    if (mode === "after") toIdx += 1;
    rows.splice(toIdx, 0, moved);
    setRows(rows);
  }

  /**
   * `gapIndex` is the insertion point in the row's *pre-removal* cell array, so
   * it shifts down by one when the dragged cell came from an earlier slot.
   * Without that correction a column dragged to the right lands a slot early.
   */
  function moveCell(fromRowId: string, cellId: string, toRowId: string, gapIndex: number) {
    const rows = value.rows.map((r) =>
      r.type === "cells" ? { ...r, cells: [...r.cells] } : r
    );

    const fromRow = rows.find((r) => r.id === fromRowId);
    if (!fromRow || fromRow.type !== "cells") return;
    const fromIdx = fromRow.cells.findIndex((c) => c.id === cellId);
    if (fromIdx < 0) return;

    const toRow = rows.find((r) => r.id === toRowId);
    if (!toRow || toRow.type !== "cells") return;

    const [cell] = fromRow.cells.splice(fromIdx, 1);

    let insertAt = gapIndex;
    if (fromRowId === toRowId && fromIdx < gapIndex) insertAt -= 1;
    insertAt = Math.max(0, Math.min(insertAt, toRow.cells.length));

    toRow.cells.splice(insertAt, 0, cell);

    // A cells row that lost its last cell is meaningless — drop it.
    setRows(rows.filter((r) => r.type !== "cells" || r.cells.length > 0));
  }

  /** Button fallback for reordering a column — works with a keyboard too. */
  function moveCellBy(rowId: string, cellId: string, delta: number) {
    const row = value.rows.find((r) => r.id === rowId);
    if (!row || row.type !== "cells") return;
    const from = row.cells.findIndex((c) => c.id === cellId);
    if (from < 0) return;
    const to = from + delta;
    if (to < 0 || to >= row.cells.length) return;
    moveCell(rowId, cellId, rowId, delta > 0 ? to + 1 : to);
  }

  const presetProfile: SchoolHeaderProfile = schoolProfile ?? {
    name: "",
    logoUrl,
    address: null,
    phone: null,
    board: null,
    academicYear: null,
  };

  return (
    <div className="space-y-3">
      {/* Live preview */}
      <div className="rounded-lg border border-border bg-white p-4 text-black">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Preview
        </p>
        {value.rows.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-400">
            Empty header — pick a layout below to start.
          </p>
        ) : (
          <HeaderRenderer config={value} context={context} logoUrl={logoUrl} />
        )}
      </div>

      {/* Layout presets */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">Start from a layout</Label>
        <div className="grid grid-cols-2 gap-2">
          {HEADER_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              title={preset.description}
              onClick={() => onChange(preset.build({ ...presetProfile, logoUrl }))}
              className="justify-start text-left"
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Rows */}
      <p className="text-[11px] text-muted-foreground">
        Grab a row&apos;s ⋮ handle to reorder rows, or a column&apos;s handle to slide
        it sideways — drop it on another row&apos;s strip to move it there.
      </p>
      <div className="space-y-2">
        {value.rows.map((row, index) => (
          <RowCard
            key={row.id}
            row={row}
            index={index}
            logoUrl={logoUrl}
            context={context}
            dropTarget={dropTarget}
            dragging={drag}
            onDragStart={beginDrag}
            onDragMove={updateDrag}
            onDragEnd={endDrag}
            onPatchRow={patchRow}
            onPatchCell={patchCell}
            onPatchCellContent={patchCellContent}
            onAddCell={addCell}
            onRemoveCell={removeCell}
            onMoveCell={moveCellBy}
            onRemoveRow={removeRow}
          />
        ))}
      </div>

      {/* Add rows */}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" />
          Add row
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addDivider}>
          <MinusIcon className="h-3.5 w-3.5" />
          Add divider
        </Button>
      </div>

      {schoolDefault && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full border border-border/60"
          disabled={isDefault}
          onClick={() => onChange(schoolDefault)}
        >
          Reset to school default
        </Button>
      )}
    </div>
  );
}

// ============================================================
//  Row
// ============================================================

type RowProps = {
  row: HeaderRow;
  index: number;
  logoUrl: string | null;
  /** Token values, so a row can show what it really renders as. */
  context: HeaderTokenContext;
  dropTarget: DropTarget | null;
  dragging: DragPayload | null;
  onDragStart: (e: ReactPointerEvent<HTMLElement>, payload: DragPayload) => void;
  onDragMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onDragEnd: (e: ReactPointerEvent<HTMLElement>) => void;
  onPatchRow: (
    rowId: string,
    patch: Partial<HeaderCellsRow> | Partial<HeaderDividerRow>
  ) => void;
  onPatchCell: (rowId: string, cellId: string, patch: Partial<HeaderCell>) => void;
  onPatchCellContent: (rowId: string, cellId: string, patch: Record<string, unknown>) => void;
  onAddCell: (rowId: string, type: "text" | "logo") => void;
  onRemoveCell: (rowId: string, cellId: string) => void;
  onMoveCell: (rowId: string, cellId: string, delta: number) => void;
  onRemoveRow: (rowId: string) => void;
};

function RowCard({
  row,
  index,
  logoUrl,
  context,
  dropTarget,
  dragging,
  onDragStart,
  onDragMove,
  onDragEnd,
  onPatchRow,
  onPatchCell,
  onPatchCellContent,
  onAddCell,
  onRemoveCell,
  onMoveCell,
  onRemoveRow,
}: RowProps) {
  const rowMode =
    dropTarget?.kind === "row" && dropTarget.rowId === row.id ? dropTarget.mode : null;
  const gapIndex =
    dropTarget?.kind === "cells" && dropTarget.rowId === row.id ? dropTarget.gapIndex : null;
  const isDraggingRow = dragging?.kind === "row" && dragging.rowId === row.id;

  return (
    <div className="relative">
      {/* Where a dragged row would land */}
      {rowMode === "before" && <div className="absolute -top-1 left-0 right-0 h-0.5 rounded bg-primary" />}
      {rowMode === "after" && <div className="absolute -bottom-1 left-0 right-0 h-0.5 rounded bg-primary" />}

      <div
        data-drop="row"
        data-row-id={row.id}
        className={cn(
          "space-y-2 rounded-lg border bg-card p-2.5 transition",
          isDraggingRow ? "opacity-50" : "",
          gapIndex !== null ? "border-primary/60 bg-primary/5" : "border-border/60"
        )}
      >
        {/* Row toolbar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <DragHandle
              title="Drag to reorder this row"
              className="h-3.5 w-3.5"
              onPointerDown={(e) => onDragStart(e, { kind: "row", rowId: row.id })}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
            />
            <span className="text-[11px] font-semibold text-muted-foreground">
              {row.type === "divider" ? "Divider" : `Row ${index + 1}`}
            </span>
            {row.type === "cells" && row.cells.length > 1 && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {row.cells.length} columns
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {row.type === "cells" && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Add a text column"
                  disabled={row.cells.length >= HEADER_LIMITS.maxCellsPerRow}
                  onClick={() => onAddCell(row.id, "text")}
                >
                  <TextIcon className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Add the school logo as a column"
                  disabled={!logoUrl || row.cells.length >= HEADER_LIMITS.maxCellsPerRow}
                  onClick={() => onAddCell(row.id, "logo")}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-destructive hover:text-destructive"
              title="Delete this row"
              onClick={() => onRemoveRow(row.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Divider row */}
        {row.type === "divider" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Style</Label>
              <Select
                value={row.style}
                onValueChange={(v) => v && onPatchRow(row.id, { style: v as HeaderDividerStyle })}
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HEADER_DIVIDER_STYLES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ColorControl
              value={row.color}
              onChange={(color) => onPatchRow(row.id, { color })}
              compact
            />
          </div>
        )}

        {/* Cells — side by side */}
        {row.type === "cells" && (
          <>
            {/* What this row really renders as, using the paper's own renderer. */}
            <div className="rounded-md border border-dashed border-border/70 bg-white p-2">
              {rowHasContent(row) ? (
                <HeaderRenderer config={{ rows: [row] }} context={context} logoUrl={logoUrl} />
              ) : (
                <p className="text-[10px] text-slate-400">
                  Empty row — add text or a logo to see it here.
                </p>
              )}
            </div>

            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${row.cells.length}, minmax(0, 1fr))` }}>
              {row.cells.map((cell, ci) => (
                <div
                  key={cell.id}
                  className="relative"
                  data-drop="cell"
                  data-row-id={row.id}
                  data-cell-index={ci}
                >
                  {gapIndex === ci && (
                    <div className="absolute -left-1 top-0 bottom-0 w-0.5 rounded bg-primary" />
                  )}
                  {gapIndex === row.cells.length && ci === row.cells.length - 1 && (
                    <div className="absolute -right-1 top-0 bottom-0 w-0.5 rounded bg-primary" />
                  )}
                  <CellCard
                    rowId={row.id}
                    cell={cell}
                    index={ci}
                    cellCount={row.cells.length}
                    logoUrl={logoUrl}
                    isDragging={dragging?.kind === "cell" && dragging.cellId === cell.id}
                    onDragStart={onDragStart}
                    onDragMove={onDragMove}
                    onDragEnd={onDragEnd}
                    onPatch={onPatchCell}
                    onPatchContent={onPatchCellContent}
                    onRemove={onRemoveCell}
                    onMove={onMoveCell}
                  />
                </div>
              ))}
            </div>

            {/* Explicit drop strip, so appending a column is discoverable. */}
            <div
              data-drop="cells-end"
              data-row-id={row.id}
              className={cn(
                "flex h-6 items-center justify-center rounded border border-dashed text-[10px] transition",
                gapIndex === row.cells.length
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border/50 text-muted-foreground/60"
              )}
            >
              {gapIndex === row.cells.length
                ? "Release to drop the column here"
                : "Drop a column here to append it"}
            </div>

            {/* Row layout settings */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Vertical align</Label>
                <Select
                  value={row.vAlign}
                  onValueChange={(v) => v && onPatchRow(row.id, { vAlign: v as HeaderVAlign })}
                >
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HEADER_V_ALIGNS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Column gap (px)</Label>
                <Input
                  type="number"
                  min={HEADER_LIMITS.gapMin}
                  max={HEADER_LIMITS.gapMax}
                  value={row.gap}
                  onChange={(e) =>
                    onPatchRow(row.id, {
                      gap: clamp(Number(e.target.value), HEADER_LIMITS.gapMin, HEADER_LIMITS.gapMax, 12),
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  Cell
// ============================================================

function CellCard({
  rowId,
  cell,
  index,
  cellCount,
  logoUrl,
  isDragging,
  onDragStart,
  onDragMove,
  onDragEnd,
  onPatch,
  onPatchContent,
  onRemove,
  onMove,
}: {
  rowId: string;
  cell: HeaderCell;
  /** Position inside its row — also the drop-target index. */
  index: number;
  /** How many columns the row has, to disable the edge move buttons. */
  cellCount: number;
  logoUrl: string | null;
  isDragging: boolean;
  onDragStart: (e: ReactPointerEvent<HTMLElement>, payload: DragPayload) => void;
  onDragMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onDragEnd: (e: ReactPointerEvent<HTMLElement>) => void;
  onPatch: (rowId: string, cellId: string, patch: Partial<HeaderCell>) => void;
  onPatchContent: (rowId: string, cellId: string, patch: Record<string, unknown>) => void;
  onRemove: (rowId: string, cellId: string) => void;
  onMove: (rowId: string, cellId: string, delta: number) => void;
}) {
  const isText = cell.content.type === "text";

  return (
    <div
      className={cn(
        "space-y-2 rounded-md border border-border/60 bg-muted/30 p-2",
        isDragging && "opacity-50"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <DragHandle
            title="Drag to move this column"
            className="h-3 w-3"
            onPointerDown={(e) => onDragStart(e, { kind: "cell", rowId, cellId: cell.id })}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isText ? "Text" : "Logo"}
          </span>
          <span
            className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground"
            title="How this column claims space in the row"
          >
            {cell.width === "auto" ? "hug" : cell.width === "fill" ? "fill" : `${cell.width}×`}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-destructive hover:text-destructive"
          title="Remove column"
          onClick={() => onRemove(rowId, cell.id)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {isText && cell.content.type === "text" && (
        <div className="space-y-2">
          <div className="flex items-end gap-1.5">
            <Input
              value={cell.content.text}
              onChange={(e) => onPatchContent(rowId, cell.id, { text: e.target.value })}
              placeholder="Type here — drop-down for {{fields}}"
              className="h-8 flex-1 text-sm"
            />
            <InsertTokenSelect
              onInsert={(token) =>
                onPatchContent(rowId, cell.id, {
                  text: cell.content.type === "text" && cell.content.text ? `${cell.content.text} ${token}` : token,
                })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Select
              value={cell.content.fontFamily}
              onValueChange={(v) => v && onPatchContent(rowId, cell.id, { fontFamily: v as HeaderFontFamily })}
            >
              <SelectTrigger className="h-7 w-full text-xs" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEADER_FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={HEADER_LIMITS.fontSizeMin}
              max={HEADER_LIMITS.fontSizeMax}
              value={cell.content.fontSize}
              onChange={(e) =>
                onPatchContent(rowId, cell.id, {
                  fontSize: clamp(
                    Number(e.target.value),
                    HEADER_LIMITS.fontSizeMin,
                    HEADER_LIMITS.fontSizeMax,
                    12
                  ),
                })
              }
              className="h-7 text-xs"
              title="Font size (pt)"
            />
          </div>

          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <ToggleButton
                active={cell.content.bold}
                label="B"
                onClick={() =>
                  onPatchContent(rowId, cell.id, { bold: cell.content.type === "text" ? !cell.content.bold : false })
                }
              />
              <ToggleButton
                active={cell.content.italic}
                label="I"
                onClick={() =>
                  onPatchContent(rowId, cell.id, {
                    italic: cell.content.type === "text" ? !cell.content.italic : false,
                  })
                }
              />
            </div>
            <AlignButtons align={cell.align} onChange={(align) => onPatch(rowId, cell.id, { align })} />
          </div>

          <ColorControl
            value={cell.content.color}
            onChange={(color) => onPatchContent(rowId, cell.id, { color })}
          />
        </div>
      )}

      {!isText && cell.content.type === "logo" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Height (px)</Label>
              <Input
                type="number"
                min={HEADER_LIMITS.logoHeightMin}
                max={HEADER_LIMITS.logoHeightMax}
                value={cell.content.height}
                onChange={(e) =>
                  onPatchContent(rowId, cell.id, {
                    height: clamp(
                      Number(e.target.value),
                      HEADER_LIMITS.logoHeightMin,
                      HEADER_LIMITS.logoHeightMax,
                      72
                    ),
                  })
                }
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Align</Label>
              <AlignButtons align={cell.align} onChange={(align) => onPatch(rowId, cell.id, { align })} />
            </div>
          </div>
          {!logoUrl && (
            <p className="text-[10px] text-amber-400">
              No school logo yet — upload one in School Settings.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">Width</span>
        <Select
          value={String(cell.width)}
          onValueChange={(v) => {
            if (!v) return;
            onPatch(rowId, cell.id, {
              width: v === "auto" || v === "fill" ? v : Number(v),
            });
          }}
        >
          <SelectTrigger className="h-7 flex-1 text-xs" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HEADER_WIDTH_OPTIONS.map((w) => (
              <SelectItem key={w.value} value={w.value}>
                {w.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7"
            title="Move column left"
            disabled={index === 0}
            onClick={() => onMove(rowId, cell.id, -1)}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7"
            title="Move column right"
            disabled={index >= cellCount - 1}
            onClick={() => onMove(rowId, cell.id, 1)}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Small controls
// ============================================================

/**
 * The grab handle every drag starts from. Pointer events plus touch-action:
 * none mean a finger drag moves the item instead of scrolling the panel.
 */
function DragHandle({
  title,
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  title: string;
  className?: string;
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      style={{ touchAction: "none" }}
      className={cn("cursor-grab text-muted-foreground active:cursor-grabbing", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <GripVertical className="h-full w-full" />
    </button>
  );
}

function ToggleButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="icon-xs"
      onClick={onClick}
      aria-pressed={active}
      className="h-7 w-7 text-xs"
    >
      {label}
    </Button>
  );
}

function AlignButtons({
  align,
  onChange,
}: {
  align: HeaderAlign;
  onChange: (a: HeaderAlign) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {HEADER_ALIGNS.map((a) => (
        <Button
          key={a.value}
          type="button"
          variant={align === a.value ? "default" : "outline"}
          size="icon-xs"
          onClick={() => onChange(a.value)}
          className="h-7 w-7"
          title={a.label}
        >
          {ALIGN_SHORT[a.value]}
        </Button>
      ))}
    </div>
  );
}

function ColorControl({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (c: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-end gap-2", compact && "flex-col items-stretch")}>
      <div className="flex-1 space-y-1.5">
        <Label className="text-[10px] text-muted-foreground">Color</Label>
        <Select
          value={value}
          onValueChange={(v) => {
            if (v) onChange(v);
          }}
        >
          <SelectTrigger className="h-7 w-full text-xs" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HEADER_COLOR_PRESETS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-border"
                    style={{ backgroundColor: c.value }}
                  />
                  {c.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#1a1a1a"}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        aria-label="Custom header color"
      />
    </div>
  );
}

function InsertTokenSelect({ onInsert }: { onInsert: (token: string) => void }) {
  const [value, setValue] = useState<string | null>(null);

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        setValue(null);
        if (v) onInsert(v);
      }}
    >
      <SelectTrigger className="h-8 w-9 justify-center p-0" size="sm" title="Insert field">
        <span className="text-sm font-bold">{"{{"}</span>
      </SelectTrigger>
      <SelectContent align="start">
        {HEADER_TOKENS.map((t) => (
          <SelectItem key={t.token} value={t.token}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
