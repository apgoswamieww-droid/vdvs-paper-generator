"use client";

// ============================================================
//  Paper Header — shared React renderer (preview)
//  Mirrors lib/paper-header.headerConfigToHTML (PDF) and the
//  Word table renderer in lib/paper-docx.ts.
// ============================================================

import type { CSSProperties } from "react";
import {
  headerAlignItemsCss,
  headerCellFlex,
  headerFontCss,
  headerMetaGridCells,
  headerTextAlignCss,
  headerVerticalAlignCss,
  isCanvasHeader,
  normalizeCanvasLayout,
  normalizeHeaderConfig,
  resolveHeaderTokens,
  type HeaderBlock,
  type HeaderBrandingBlock,
  type HeaderConfig,
  type HeaderContent,
  type HeaderIdentityBlock,
  type HeaderMetaGridBlock,
  type HeaderTokenContext,
} from "@/lib/paper-header";

type Props = {
  config: HeaderConfig;
  context: HeaderTokenContext;
  logoUrl?: string | null;
  className?: string;
};

export function HeaderRenderer({ config, context, logoUrl, className }: Props) {
  if (isCanvasHeader(config)) {
    const layout = normalizeCanvasLayout(config.canvas);
    return (
      <div className={className}>
        <div className="relative w-full" style={{ height: layout.height, breakInside: "avoid" }}>
          {layout.blocks
            .filter((b) => b.visible)
            .map((block) => (
              <HeaderBlockView key={block.id} block={block} context={context} logoUrl={logoUrl ?? null} />
            ))}
        </div>
      </div>
    );
  }

  const normalized = normalizeHeaderConfig(config);

  return (
    <div className={className}>
      {normalized.rows.map((row) => {
        if (row.type === "divider") {
          const border =
            row.style === "double"
              ? "3px double"
              : row.style === "dashed"
                ? "1px dashed"
                : "1px solid";
          return (
            <div key={row.id} style={{ borderBottom: `${border} ${row.color}`, margin: "6px 0" }} />
          );
        }

        if (row.type === "metaGrid") {
          const cells = headerMetaGridCells(row, context);
          if (cells.length === 0) return null;
          return (
            <div
              key={row.id}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                borderTop: `1.5px solid ${row.color}`,
                borderLeft: `1.5px solid ${row.color}`,
                margin: "8px 0",
              }}
            >
              {cells.map((c) => (
                <div
                  key={c.key}
                  style={{
                    padding: "5px 10px",
                    borderRight: `1.5px solid ${row.color}`,
                    borderBottom: `1.5px solid ${row.color}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: "7.5pt",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: row.color,
                    }}
                  >
                    {c.label}
                  </div>
                  <div style={{ fontSize: "10.5pt", fontWeight: 700, color: "#1a1a1a" }}>{c.value}</div>
                </div>
              ))}
            </div>
          );
        }

        return (
          <div
            key={row.id}
            style={{
              display: "flex",
              alignItems: headerVerticalAlignCss(row.vAlign),
              gap: row.gap,
              width: "100%",
            }}
          >
            {row.cells.map((cell) => (
              <div
                key={cell.id}
                style={{
                  flex: headerCellFlex(cell.width),
                  minWidth: 0,
                  textAlign: cell.align,
                }}
              >
                <HeaderCellContent content={cell.content} context={context} logoUrl={logoUrl ?? null} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function HeaderCellContent({
  content,
  context,
  logoUrl,
}: {
  content: HeaderContent;
  context: HeaderTokenContext;
  logoUrl: string | null;
}) {
  if (content.type === "logo") {
    if (!logoUrl) {
      return (
        <span className="inline-block rounded border border-dashed border-slate-300 px-2 py-1 text-[10px] text-slate-400">
          no logo set
        </span>
      );
    }
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={logoUrl}
        alt="School logo"
        className="inline-block"
        style={{ height: content.height, width: "auto", maxWidth: "100%", objectFit: "contain" }}
      />
    );
  }

  return (
    <div
      style={{
        fontFamily: headerFontCss(content.fontFamily),
        fontSize: `${content.fontSize}pt`,
        fontWeight: content.bold ? 700 : 400,
        fontStyle: content.italic ? "italic" : "normal",
        color: content.color,
        padding: "2px 0",
        whiteSpace: "pre-line",
      }}
    >
      {resolveHeaderTokens(content.text, context)}
    </div>
  );
}

/** One absolutely-positioned canvas block — mirrors headerBlockToHTML. */
export function HeaderBlockView({
  block,
  context,
  logoUrl,
}: {
  block: HeaderBlock;
  context: HeaderTokenContext;
  logoUrl: string | null;
}) {
  const baseStyle: CSSProperties = {
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    left: `${block.x}%`,
    top: `${block.y}%`,
    width: `${block.w}%`,
    textAlign: headerTextAlignCss(block.align),
    alignItems: headerAlignItemsCss(block.align),
  };

  if (block.kind === "branding") {
    return (
      <div style={baseStyle}>
        <BlockLogo block={block} logoUrl={logoUrl} />
        {block.showContact && (
          <div
            style={{
              fontFamily: headerFontCss("Nunito"),
              fontSize: "9pt",
              color: "#555555",
              marginTop: 4,
              whiteSpace: "pre-line",
            }}
          >
            {resolveHeaderTokens("{{schoolAddress}}  •  {{schoolPhone}}", context)}
          </div>
        )}
      </div>
    );
  }

  if (block.kind === "identity") {
    return (
      <div style={baseStyle}>
        <BlockIdentity block={block} context={context} />
      </div>
    );
  }

  return <BlockMetaGrid block={block} context={context} style={baseStyle} />;
}

function BlockLogo({
  block,
  logoUrl,
}: {
  block: HeaderBrandingBlock;
  logoUrl: string | null;
}) {
  if (!logoUrl) {
    return (
      <span className="inline-block rounded border border-dashed border-slate-300 px-2 py-1 text-[10px] text-slate-400">
        no logo set
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={logoUrl}
      alt="School logo"
      style={{ height: block.logoHeight, width: "auto", maxWidth: "100%", display: "block", objectFit: "contain" }}
    />
  );
}

function BlockIdentity({
  block,
  context,
}: {
  block: HeaderIdentityBlock;
  context: HeaderTokenContext;
}) {
  const address = block.addressText.trim();
  return (
    <>
      <div
        style={{
          fontFamily: headerFontCss("Rasa"),
          fontSize: `${block.fontSize}pt`,
          fontWeight: 700,
          color: block.color,
          lineHeight: 1.2,
          whiteSpace: "pre-line",
        }}
      >
        {resolveHeaderTokens(block.nameText, context)}
      </div>
      {address && (
        <div
          style={{
            fontFamily: headerFontCss("Nunito"),
            fontSize: "9.5pt",
            color: "#555555",
            lineHeight: 1.4,
            marginTop: 2,
            whiteSpace: "pre-line",
          }}
        >
          {resolveHeaderTokens(address, context)}
        </div>
      )}
    </>
  );
}

function BlockMetaGrid({
  block,
  context,
  style,
}: {
  block: HeaderMetaGridBlock;
  context: HeaderTokenContext;
  style: CSSProperties;
}) {
  const cells = headerMetaGridCells(block, context);
  if (cells.length === 0) return null;
  return (
    <div style={style}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          borderTop: `1.5px solid ${block.color}`,
          borderLeft: `1.5px solid ${block.color}`,
          margin: "8px 0",
          width: "100%",
        }}
      >
        {cells.map((c) => (
          <div
            key={c.key}
            style={{
              padding: "5px 10px",
              borderRight: `1.5px solid ${block.color}`,
              borderBottom: `1.5px solid ${block.color}`,
            }}
          >
            <div
              style={{
                fontSize: "7.5pt",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: block.color,
              }}
            >
              {c.label}
            </div>
            <div style={{ fontSize: "10.5pt", fontWeight: 700, color: "#1a1a1a" }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}