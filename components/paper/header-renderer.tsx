"use client";

// ============================================================
//  Paper Header — shared React renderer (preview)
//  Mirrors lib/paper-header.headerConfigToHTML (PDF) and the
//  Word table renderer in lib/paper-docx.ts.
// ============================================================

import {
  headerCellFlex,
  headerFontCss,
  headerVerticalAlignCss,
  normalizeHeaderConfig,
  resolveHeaderTokens,
  type HeaderConfig,
  type HeaderContent,
  type HeaderTokenContext,
} from "@/lib/paper-header";

type Props = {
  config: HeaderConfig;
  context: HeaderTokenContext;
  logoUrl?: string | null;
  className?: string;
};

export function HeaderRenderer({ config, context, logoUrl, className }: Props) {
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
            <div
              key={row.id}
              style={{ borderBottom: `${border} ${row.color}`, margin: "6px 0" }}
            />
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
