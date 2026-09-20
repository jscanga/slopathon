import * as pdfjs from "pdfjs-dist";
import {
  parseReportText,
  buildPlanFromRows,
  type ParseResult,
} from "./peoplesoftImport";
import type { StudentPlan } from "../types";

// Resolve the worker via a URL relative to this module. This avoids Vite's
// `?url` virtual-module handling (which can inline as base64 and trip CSP)
// and works across pdfjs-dist v4 without extra type declarations.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/**
 * Reads a PeopleSoft What-If PDF File and returns text lines. pdf.js exposes
 * text as positioned items per page; we group items into visual lines by
 * their y-coordinate so the row-regex sees whole rows like the report shows
 * them, rather than a stream of loose tokens.
 */
export async function extractPdfLines(file: File): Promise<string[]> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const allLines: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    // Group text items into lines by rounded y position.
    const lineMap = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as Array<{
      str: string;
      transform: number[];
    }>) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x, str: item.str });
    }

    // Emit lines top-to-bottom (larger y is higher on the page), tokens
    // left-to-right.
    const ys = [...lineMap.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const tokens = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      const line = tokens
        .map((t) => t.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) allLines.push(line);
    }
  }

  return allLines;
}

export interface ImportResult {
  plan: StudentPlan;
  parse: ParseResult;
  warnings: string[];
}

/** Full pipeline: PDF File -> StudentPlan (+ warnings for the UI). */
export async function importPeopleSoftPdf(
  file: File,
  majorId = "cs-bs-2023"
): Promise<ImportResult> {
  const lines = await extractPdfLines(file);
  const parse = parseReportText(lines);
  const { plan, warnings } = buildPlanFromRows(parse.rows, majorId);
  return { plan, parse, warnings: [...parse.warnings, ...warnings] };
}
