"use client";

// ============================================================
//  Visual header designer — a free-position canvas over the real
//  paper renderer (WYSIWYG with the PDF engine).
//
//  • Blocks carry percentage geometry (x / y / w of the canvas), so
//    the canvas, the live preview and the exported PDF all lay the
//    header out identically.
//  • Drag a block's ⋮⋮ handle with @dnd-kit; resize with the corner
//    handle; select a block to edit it in the properties panel.
//  • Design mode shows selection chrome; Preview shows the paper as
//    it will print. Existing row-based headers are auto-converted
//    on first open (canvasLayoutFromRows) and saved as canvas.
// ============================================================

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from "@dnd-kit/core";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { HeaderRenderer, HeaderBlockView } from "./header-renderer";
import {
  CANVAS_LIMITS,
  HEADER_ALIGNS,
  HEADER_COLOR_PRESETS,
  HEADER_LIMITS,
  HEADER_PRESETS,
  HEADER_TOKENS,
  canvasLayoutFromRows,
  clampPercent,
  isCanvasHeader,
  newHeaderBlockId,
  normalizeCanvasLayout,
  type HeaderBlock,
  type HeaderBrandingBlock,
  type HeaderCanvasLayout,
  type HeaderConfig,
  type HeaderIdentityBlock,
  type HeaderMetaGridBlock,
  type HeaderTokenContext,
  type SchoolHeaderProfile,
} from "@/lib/paper-header";
import {
  Eye,
  EyeOff,
  GripVertical,
  ImageIcon,
  LayoutGrid,
  MoveDiagonal,
  PenLine,
  Plus,
  TextIcon,
  Trash2,
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

const BLOCK_LABEL: Record<HeaderBlock["kind"], string> = {
  branding: "Logo & Branding",
  identity: "Name & Address",
  metaGrid: "Meta box",
};

const ALIGN_SHORT = { left: "L", center: "C", right: "R" } as const;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function HeaderBuilderCanvas({
  value,
  onChange,
  context,
  logoUrl,
  schoolDefault,
  schoolProfile,
}: Props) {
  // While the parent still holds a row-based config (e.g. an older paper opened
  // for the first time), keep the auto-converted canvas here. The first real
  // edit commits it to the parent as { rows: [], canvas }.
  const [converted, setConverted] = useState<HeaderCanvasLayout | null>(() =>
    isCanvasHeader(value) ? null : canvasLayoutFromRows(value)
  );
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ id: string; startX: number } | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"design" | "preview">("design");

  const isCanvas = isCanvasHeader(value);
  const layout = isCanvas ? normalizeCanvasLayout(value.canvas) : converted ?? canvasLayoutFromRows(value);
  const selected = layout.blocks.find((b) => b.id === selectedId) ?? null;

  function commit(next: HeaderCanvasLayout) {
    setConverted(null);
    onChange({ rows: [], canvas: next });
  }

  function patchLayout(patch: Partial<HeaderCanvasLayout>) {
    commit({ ...layout, ...patch });
  }

  function patchBlock(id: string, patch: Partial<HeaderBlock>) {
    commit({
      ...layout,
      blocks: layout.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as HeaderBlock) : b)),
    });
  }

  function removeBlock(id: string) {
    commit({ ...layout, blocks: layout.blocks.filter((b) => b.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  function addBlock(kind: HeaderBlock["kind"]) {
    if (layout.blocks.length >= CANVAS_LIMITS.maxBlocks) return;
    const base = {
      id: newHeaderBlockId(),
      x: 0,
      y: layout.blocks.length === 0 ? 4 : 8,
      w: kind === "branding" ? 30 : 100,
      align: (kind === "identity" ? "center" : "left") as HeaderBlock["align"],
      visible: true,
    };
    const block: HeaderBlock =
      kind === "branding"
        ? { ...base, kind, logoHeight: 72, showContact: false }
        : kind === "identity"
          ? {
              ...base,
              kind,
              nameText: "{{schoolName}}",
              addressText: "{{schoolAddress}}  •  {{schoolPhone}}",
              fontSize: 18,
              color: "#02015c",
            }
          : {
              ...base,
              kind,
              section: "SHIVAY",
              showSection: true,
              showClass: true,
              showDate: true,
              showDuration: true,
              showTotalMarks: true,
              showSubject: false,
              color: "#02015c",
            };
    commit({ ...layout, blocks: [...layout.blocks, block] });
    setSelectedId(block.id);
  }

  // ── drag & drop (@dnd-kit) ──
  // We ignore dnd-kit's transform and drive position from state via the event
  // delta (in px), converted to canvas percentages. That keeps the dragged
  // block pixel-snapped to the pointer with no ghost/deviation artifacts.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function moveByDelta(id: string, delta: { x: number; y: number }) {
    const rect = canvasWrapRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;
    const block = layout.blocks.find((b) => b.id === id);
    if (!block) return;
    patchBlock(id, {
      x: clampPercent(block.x + (delta.x / rect.width) * 100, 0),
      y: clampPercent(block.y + (delta.y / rect.height) * 100, 0),
    });
  }

  function onDragMove(e: DragMoveEvent) {
    if (e.active) moveByDelta(e.active.id as string, e.delta);
  }

  function onDragEnd(e: DragEndEvent) {
    if (e.active) moveByDelta(e.active.id as string, e.delta);
  }

  // ── resize (pointer events — dnd-kit has no resize primitive) ──
  function beginResize(e: ReactPointerEvent<HTMLElement>, id: string) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { id, startX: e.clientX };
  }

  function moveResize(e: ReactPointerEvent<HTMLElement>) {
    const r = resizeRef.current;
    if (!r) return;
    const rect = canvasWrapRef.current?.getBoundingClientRect();
    if (!rect || !rect.width) return;
    const block = layout.blocks.find((b) => b.id === r.id);
    if (!block) return;
    const dw = ((e.clientX - r.startX) / rect.width) * 100;
    patchBlock(r.id, { w: clampPercent(block.w + dw, 30, CANVAS_LIMITS.wMin, CANVAS_LIMITS.wMax) });
    r.startX = e.clientX;
  }

  function endResize(e: ReactPointerEvent<HTMLElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    resizeRef.current = null;
  }

  const isDefault = schoolDefault
    ? JSON.stringify(layout) ===
      JSON.stringify(
        isCanvasHeader(schoolDefault)
          ? normalizeCanvasLayout(schoolDefault.canvas)
          : canvasLayoutFromRows(schoolDefault)
      )
    : false;

  const presetProfile: SchoolHeaderProfile = schoolProfile ?? {
    name: context.schoolName,
    logoUrl,
    address: null,
    phone: null,
    board: null,
    academicYear: null,
  };

  return (
    <DndContext sensors={sensors} onDragMove={onDragMove} onDragEnd={onDragEnd}>
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100">
        {/* ── toolbar ── */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <PenLine className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-xs font-semibold">Header Designer</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-zinc-900 p-0.5">
            {(["design", "preview"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize transition",
                  mode === m ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                {m === "design" ? <PenLine className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* ── canvas ── */}
        <div
          ref={canvasWrapRef}
          className={cn(
            "overflow-x-auto px-4 py-4",
            mode === "design" ? "bg-zinc-950" : "bg-zinc-900"
          )}
          onClick={() => setSelectedId(null)}
        >
          <div
            className="relative mx-auto w-full max-w-[560px] touch-none rounded bg-white shadow-[0_0_0_1px_#3f3f46,0_8px_24px_rgba(0,0,0,0.5)]"
            style={{ height: mode === "design" ? layout.height + 48 : layout.height }}
          >
            {mode === "design" ? (
              layout.blocks
                .filter((b) => b.visible)
                .map((block) => (
                  <DesignBlock
                    key={block.id}
                    block={block}
                    selected={block.id === selectedId}
                    context={context}
                    logoUrl={logoUrl}
                    onSelect={(id) => setSelectedId(id)}
                    onRemove={removeBlock}
                    onBeginResize={beginResize}
                    onMoveResize={moveResize}
                    onEndResize={endResize}
                  />
                ))
            ) : (
              <HeaderRenderer config={{ rows: [], canvas: layout }} context={context} logoUrl={logoUrl} />
            )}

            {mode === "design" && layout.blocks.filter((b) => b.visible).length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
                Drop a block from the “Add” row below to start.
              </div>
            )}
          </div>
        </div>

        {/* ── add blocks ── */}
        <div className="grid grid-cols-3 gap-2 border-t border-zinc-800 px-3 py-2.5">
          <AddBlockButton
            icon={<ImageIcon className="h-3.5 w-3.5" />}
            label="A · Logo"
            disabled={layout.blocks.length >= CANVAS_LIMITS.maxBlocks}
            onClick={() => addBlock("branding")}
          />
          <AddBlockButton
            icon={<TextIcon className="h-3.5 w-3.5" />}
            label="B · Name"
            disabled={layout.blocks.length >= CANVAS_LIMITS.maxBlocks}
            onClick={() => addBlock("identity")}
          />
          <AddBlockButton
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            label="C · Meta"
            disabled={layout.blocks.length >= CANVAS_LIMITS.maxBlocks}
            onClick={() => addBlock("metaGrid")}
          />
        </div>

        {/* ── properties ── */}
        <div className="space-y-3 border-t border-zinc-800 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] text-zinc-500">Canvas height (px)</Label>
            <Input
              type="number"
              min={CANVAS_LIMITS.heightMin}
              max={CANVAS_LIMITS.heightMax}
              value={layout.height}
              onChange={(e) =>
                patchLayout({
                  height: clamp(
                    Number(e.target.value),
                    CANVAS_LIMITS.heightMin,
                    CANVAS_LIMITS.heightMax
                  ),
                })
              }
              className="h-7 w-20 text-xs"
            />
          </div>

          {selected ? (
            <BlockProperties
              block={selected}
              logoUrl={logoUrl}
              onPatch={patchBlock}
            />
          ) : (
            <p className="py-1 text-center text-[11px] text-zinc-500">
              Click a block on the canvas to edit it.
            </p>
          )}
        </div>

        {/* ── blocks list (re-enable hidden blocks) ── */}
        {layout.blocks.length > 0 && (
          <div className="space-y-1 border-t border-zinc-800 px-3 py-2.5">
            <Label className="text-[11px] text-zinc-500">
              Blocks ({layout.blocks.length}/{CANVAS_LIMITS.maxBlocks})
            </Label>
            {layout.blocks.map((b) => (
              <div
                key={b.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs",
                  b.id === selectedId && "border-zinc-600"
                )}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 text-left text-zinc-300 hover:text-white"
                  onClick={() => setSelectedId(b.id)}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      b.kind === "branding"
                        ? "bg-emerald-400"
                        : b.kind === "identity"
                          ? "bg-sky-400"
                          : "bg-amber-400"
                    )}
                  />
                  {BLOCK_LABEL[b.kind]}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title={b.visible ? "Hide block" : "Show block"}
                    onClick={() => patchBlock(b.id, { visible: !b.visible })}
                    className="text-zinc-400 hover:text-white"
                  >
                    {b.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    title="Delete block"
                    onClick={() => removeBlock(b.id)}
                    className="text-zinc-400 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── presets + reset ── */}
        <div className="grid grid-cols-2 gap-2 border-t border-zinc-800 px-3 py-2.5">
          {HEADER_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              title={preset.description}
              className="justify-start border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              onClick={() =>
                commit(canvasLayoutFromRows(preset.build({ ...presetProfile, logoUrl })))
              }
            >
              <Plus className="h-3 w-3 text-zinc-500" />
              {preset.label}
            </Button>
          ))}
        </div>

        {schoolDefault && (
          <div className="border-t border-zinc-800 px-3 py-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full border border-zinc-800 text-zinc-400 hover:text-white"
              disabled={isDefault}
              onClick={() =>
                commit(
                  isCanvasHeader(schoolDefault)
                    ? normalizeCanvasLayout(schoolDefault.canvas)
                    : canvasLayoutFromRows(schoolDefault)
                )
              }
            >
              Reset to school default
            </Button>
          </div>
        )}
      </div>
    </DndContext>
  );
}

// ============================================================
//  Design block — real renderer + selection chrome + handles
// ============================================================

function DesignBlock({
  block,
  selected,
  context,
  logoUrl,
  onSelect,
  onRemove,
  onBeginResize,
  onMoveResize,
  onEndResize,
}: {
  block: HeaderBlock;
  selected: boolean;
  context: HeaderTokenContext;
  logoUrl: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onBeginResize: (e: ReactPointerEvent<HTMLElement>, id: string) => void;
  onMoveResize: (e: ReactPointerEvent<HTMLElement>) => void;
  onEndResize: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: block.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group absolute z-10 box-border transition-opacity",
        isDragging && "opacity-40",
        selected && "outline outline-2 outline-offset-1 outline-primary",
        "outline-dashed outline-1 outline-offset-1 outline-primary/40"
      )}
      style={{
        left: `${block.x}%`,
        top: `${block.y}%`,
        width: `${block.w}%`,
        pointerEvents: "auto",
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
    >
      <HeaderBlockView block={block} context={context} logoUrl={logoUrl} />

      {/* Label + drag + delete */}
      <div
        className={cn(
          "absolute -top-2.5 flex items-center gap-0.5 rounded bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-300 shadow transition",
          selected ? "opacity-100" : "-top-2.5 opacity-0 group-hover:opacity-100"
        )}
      >
        <span className="px-0.5">{BLOCK_LABEL[block.kind]}</span>
        <span className="text-zinc-500">·</span>
        <button
          type="button"
          title="Drag to move this block"
          aria-label="Drag to move this block"
          {...attributes}
          {...listeners}
          className="cursor-grab p-0.5 text-zinc-300 active:cursor-grabbing"
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <button
          type="button"
          title="Delete block"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(block.id);
          }}
          className="p-0.5 text-zinc-400 hover:text-red-400"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Resize handle */}
      {selected && (
        <div
          className="absolute -bottom-2 -right-2 flex h-4 w-4 cursor-se-resize items-center justify-center rounded bg-zinc-700 text-zinc-200 shadow"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => onBeginResize(e, block.id)}
          onPointerMove={onMoveResize}
          onPointerUp={onEndResize}
          onPointerCancel={onEndResize}
        >
          <MoveDiagonal className="h-3 w-3" />
        </div>
      )}
    </div>
  );
}

function AddBlockButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40"
    >
      {icon}
      {label}
    </Button>
  );
}

// ============================================================
//  Properties panel
// ============================================================

function BlockProperties({
  block,
  logoUrl,
  onPatch,
}: {
  block: HeaderBlock;
  logoUrl: string | null;
  onPatch: (id: string, patch: Partial<HeaderBlock>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-zinc-200">{BLOCK_LABEL[block.kind]}</span>
        <div className="flex items-center gap-1">
          {HEADER_ALIGNS.map((a) => (
            <Button
              key={a.value}
              type="button"
              variant={block.align === a.value ? "default" : "outline"}
              size="icon-xs"
              onClick={() => onPatch(block.id, { align: a.value })}
              className="h-7 w-7 text-xs"
              title={a.label}
            >
              {ALIGN_SHORT[a.value]}
            </Button>
          ))}
        </div>
      </div>

      {block.kind === "branding" && (
        <BrandingFields
          block={block}
          logoUrl={logoUrl}
          onPatch={(patch) => onPatch(block.id, patch)}
        />
      )}

      {block.kind === "identity" && (
        <IdentityFields block={block} onPatch={(patch) => onPatch(block.id, patch)} />
      )}

      {block.kind === "metaGrid" && (
        <MetaFields block={block} onPatch={(patch) => onPatch(block.id, patch)} />
      )}

      {/* Position / size — every block */}
      <div className="grid grid-cols-3 gap-2">
        <GeoField label="X %" value={block.x} min={CANVAS_LIMITS.xMin} max={CANVAS_LIMITS.xMax} onCommit={(v) => onPatch(block.id, { x: v })} />
        <GeoField label="Y %" value={block.y} min={CANVAS_LIMITS.yMin} max={CANVAS_LIMITS.yMax} onCommit={(v) => onPatch(block.id, { y: v })} />
        <GeoField label="W %" value={block.w} min={CANVAS_LIMITS.wMin} max={CANVAS_LIMITS.wMax} onCommit={(v) => onPatch(block.id, { w: v })} />
      </div>
    </div>
  );
}

function GeoField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-zinc-500">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onCommit(clamp(Number(e.target.value), min, max))}
        className="h-7 text-xs"
      />
    </div>
  );
}

function BrandingFields({
  block,
  logoUrl,
  onPatch,
}: {
  block: HeaderBrandingBlock;
  logoUrl: string | null;
  onPatch: (patch: Partial<HeaderBrandingBlock>) => void;
}) {
  return (
    <div className="space-y-2.5">
      {!logoUrl && (
        <p className="text-[10px] text-amber-400">No school logo yet — upload one in School Settings.</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] text-zinc-500">Logo height (px)</Label>
        <Input
          type="number"
          min={HEADER_LIMITS.logoHeightMin}
          max={HEADER_LIMITS.logoHeightMax}
          value={block.logoHeight}
          onChange={(e) =>
            onPatch({ logoHeight: clamp(Number(e.target.value), HEADER_LIMITS.logoHeightMin, HEADER_LIMITS.logoHeightMax) })
          }
          className="h-7 w-20 text-xs"
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
        Contact line under logo
        <Switch checked={block.showContact} onCheckedChange={(v) => onPatch({ showContact: v })} />
      </div>
    </div>
  );
}

function IdentityFields({
  block,
  onPatch,
}: {
  block: HeaderIdentityBlock;
  onPatch: (patch: Partial<HeaderIdentityBlock>) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <Label className="text-[11px] text-zinc-500">School name</Label>
        <Textarea
          value={block.nameText}
          onChange={(e) => onPatch({ nameText: e.target.value.slice(0, 300) })}
          placeholder="e.g., {{schoolName}}"
          rows={2}
          className="min-h-0 resize-none border-zinc-700 bg-zinc-900 text-xs text-zinc-200"
        />
        <TokenRow onInsert={(token) => onPatch({ nameText: block.nameText ? `${block.nameText} ${token}` : token })} />
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-zinc-500">Address / contact line</Label>
        <Textarea
          value={block.addressText}
          onChange={(e) => onPatch({ addressText: e.target.value.slice(0, 500) })}
          placeholder="e.g., {{schoolAddress}}  •  {{schoolPhone}}"
          rows={2}
          className="min-h-0 resize-none border-zinc-700 bg-zinc-900 text-xs text-zinc-200"
        />
        <TokenRow onInsert={(token) => onPatch({ addressText: block.addressText ? `${block.addressText} ${token}` : token })} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-500">Name size (pt)</Label>
          <Input
            type="number"
            min={HEADER_LIMITS.fontSizeMin}
            max={HEADER_LIMITS.fontSizeMax}
            value={block.fontSize}
            onChange={(e) =>
              onPatch({ fontSize: clamp(Number(e.target.value), HEADER_LIMITS.fontSizeMin, HEADER_LIMITS.fontSizeMax) })
            }
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-zinc-500">Name color</Label>
          <div className="flex items-center gap-1.5">
            <Select value={block.color} onValueChange={(v) => v && onPatch({ color: v })}>
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
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(block.color) ? block.color : "#1a1a1a"}
              onChange={(e) => onPatch({ color: e.target.value })}
              className="h-7 w-8 cursor-pointer rounded-md border border-zinc-700 bg-transparent p-0.5"
              aria-label="Custom name color"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaFields({
  block,
  onPatch,
}: {
  block: HeaderMetaGridBlock;
  onPatch: (patch: Partial<HeaderMetaGridBlock>) => void;
}) {
  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <Label className="text-[11px] text-zinc-500">Section</Label>
        <Input
          value={block.section}
          onChange={(e) => onPatch({ section: e.target.value.slice(0, 80) })}
          placeholder="e.g., SHIVAY"
          className="h-8 border-zinc-700 bg-zinc-900 text-xs text-zinc-200"
        />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {(
          [
            ["showSection", "Section"],
            ["showClass", "Class / Standard"],
            ["showDate", "Exam Date"],
            ["showDuration", "Time / Duration"],
            ["showTotalMarks", "Max. Marks"],
            ["showSubject", "Subject"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-2 text-xs text-zinc-400">
            {label}
            <Switch checked={block[key]} onCheckedChange={(v) => onPatch({ [key]: v })} />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
        Field color
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(block.color) ? block.color : "#02015c"}
          onChange={(e) => onPatch({ color: e.target.value })}
          className="h-7 w-8 cursor-pointer rounded-md border border-zinc-700 bg-transparent p-0.5"
          aria-label="Meta bar color"
        />
      </div>
    </div>
  );
}

function TokenRow({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {HEADER_TOKENS.map((t) => (
        <button
          key={t.token}
          type="button"
          title={`${t.label} — e.g. ${t.sample}`}
          onClick={() => onInsert(t.token)}
          className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-white"
        >
          {t.token}
        </button>
      ))}
    </div>
  );
}