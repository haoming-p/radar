/* eslint-disable @typescript-eslint/no-explicit-any */

// Label data for export
export interface ExportLabelData {
  id: number;
  label: string;
  category: string;
  centroid: { x: number; y: number };
}

export interface ExportLabelOptions {
  labels: ExportLabelData[];
  draggedPositions: Record<number, { x: number; y: number }>;
  editedLabels: Record<number, string>;
  editedShortLabels: Record<number, string>;
  showFullKeywords: boolean;
  dimensions: { width: number; height: number };
  visibleCategories: Record<string, boolean>;
  visibleAreas: Record<number, boolean>;
}

// Category colors for labels
const CATEGORY_COLORS: Record<string, string> = {
  growing: "#166534",
  sparse: "#F97316",
  major: "#991B1B",
  avoid: "#1F2937",
};

// Constants for SVG text
const FONT_SIZE = 11;
const LINE_HEIGHT = 15;
const PADDING_X = 8;
const PADDING_Y = 6;

/**
 * Truncate text to fit within a given width
 */
function truncateToFit(text: string, boxWidth: number): string {
  const availableWidth = boxWidth - PADDING_X * 2;
  const maxChars = Math.floor(availableWidth / 7); // ~7px per char at font-size 11

  if (text.length <= maxChars) {
    return text;
  }

  return text.substring(0, Math.max(maxChars - 3, 5)).trim() + "...";
}

// ============ SVG EXPORT HELPERS ============

/**
 * Clone map SVG and add clean text labels.
 * FIXED: Keep original viewBox, scale label positions to SVG coordinates
 */
async function createExportSvgWithLabels(
  mapElement: HTMLElement
): Promise<SVGSVGElement | null> {
  // ============ STEP 1: Find and clone the map SVG ============
  const allSvgs = mapElement.querySelectorAll("svg");
  let originalSvg: SVGSVGElement | null = null;

  for (const svg of allSvgs) {
    const viewBox = svg.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.split(" ").map(Number);
      const width = parts[2] || 0;
      const height = parts[3] || 0;

      if (width > 100 && height > 100) {
        originalSvg = svg as SVGSVGElement;
        break;
      }
    }
  }

  if (!originalSvg) {
    console.error("[Export] No map SVG element found");
    return null;
  }

  const clonedSvg = originalSvg.cloneNode(true) as SVGSVGElement;
  clonedSvg.style.transform = "none";

  // ============ STEP 2: Get dimensions - KEEP ORIGINAL VIEWBOX ============
  const viewBox = clonedSvg.getAttribute("viewBox");
  const viewBoxParts = viewBox?.split(" ").map(Number) || [0, 0, 900, 700];
  const svgWidth = viewBoxParts[2];
  const svgHeight = viewBoxParts[3];

  const mapRect = originalSvg.getBoundingClientRect();

  // Scale factors: convert screen pixels to SVG coordinates
  const scaleX = svgWidth / mapRect.width;
  const scaleY = svgHeight / mapRect.height;

  console.log(`[Export] ViewBox: ${svgWidth}x${svgHeight}, Screen: ${mapRect.width.toFixed(0)}x${mapRect.height.toFixed(0)}`);
  console.log(`[Export] Scale: X=${scaleX.toFixed(3)}, Y=${scaleY.toFixed(3)}`);

  // ============ STEP 3: Find HTML labels ============
  const labelContainer = mapElement.querySelector(".pointer-events-none");
  const labelElements = labelContainer
    ? labelContainer.querySelectorAll(".pointer-events-auto")
    : mapElement.querySelectorAll(".pointer-events-auto");

  if (labelElements.length === 0) {
    return clonedSvg;
  }

  // ============ STEP 4: Create SVG labels ============
  try {
    const labelsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    labelsGroup.setAttribute("class", "exported-labels");

    let labelCount = 0;

    for (const labelEl of labelElements) {
      const htmlEl = labelEl as HTMLElement;

      // Skip small elements
      if (htmlEl.offsetWidth < 80 || htmlEl.offsetHeight < 20) {
        continue;
      }

      // Get the card element for dimensions
      const cardEl = htmlEl.querySelector(".rounded-lg") as HTMLElement;
      if (!cardEl) continue;

      // ===== SCREEN DIMENSIONS =====
      const cardRect = cardEl.getBoundingClientRect();
      const labelRect = htmlEl.getBoundingClientRect();

      // ===== CONVERT TO SVG COORDINATES =====
      const labelWidth = cardRect.width * scaleX + 8;
      const labelHeight = cardRect.height * scaleY;

      const centerX = (labelRect.left - mapRect.left + labelRect.width / 2) * scaleX;
      const topY = (cardRect.top - mapRect.top) * scaleY;

      // ===== TEXT CONTENT =====
      const hasCustomShortLabel = htmlEl.getAttribute("data-has-custom-short-label") === "true";
      const wrappedLinesAttr = htmlEl.getAttribute("data-wrapped-lines");

      const textSpan = htmlEl.querySelector("span");
      const labelText = textSpan?.textContent?.trim() || "";

      if (!labelText || labelText.length < 2) {
        continue;
      }

      // ===== DETECT COLOR =====
      const computedStyle = window.getComputedStyle(cardEl);
      const borderColor = computedStyle.borderColor;

      let textColor = CATEGORY_COLORS.growing;
      const rgbMatch = borderColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);

        if (r > 200 && g > 100 && b < 50) {
          textColor = CATEGORY_COLORS.sparse;
        } else if (r > 130 && g < 50 && b < 50) {
          textColor = CATEGORY_COLORS.major;
        } else if (r < 50 && g < 60 && b < 80) {
          textColor = CATEGORY_COLORS.avoid;
        }
      }

      // ===== DETERMINE TEXT LINES =====
      let lines: string[];
      const availableWidth = labelWidth - PADDING_X * 2;
      const charsPerLine = Math.floor(availableWidth / 7);

      if (hasCustomShortLabel && wrappedLinesAttr && wrappedLinesAttr !== "null") {
        // Custom label - re-wrap for current width
        const words = labelText.split(/,\s*/).map((w) => w.trim()).filter((w) => w.length > 0);
        lines = [];
        let currentLine = "";

        for (const word of words) {
          const testLine = currentLine ? `${currentLine}, ${word}` : word;
          if (testLine.length <= charsPerLine) {
            currentLine = testLine;
          } else {
            if (currentLine) {
              lines.push(currentLine + ",");
            }
            currentLine = word;
          }
        }
        if (currentLine) {
          lines.push(currentLine);
        }

        // Limit lines
        if (lines.length > 6) {
          lines = lines.slice(0, 5);
          lines.push("...");
        }
      } else {
        // Default label - truncate to single line
        lines = [truncateToFit(labelText, labelWidth)];
      }

      // ===== CALCULATE FINAL HEIGHT =====
      const actualLabelHeight = Math.max(
        labelHeight,
        lines.length * LINE_HEIGHT + PADDING_Y * 2
      );

      // ===== CREATE SVG RECT =====
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(centerX - labelWidth / 2));
      rect.setAttribute("y", String(topY));
      rect.setAttribute("width", String(labelWidth));
      rect.setAttribute("height", String(actualLabelHeight));
      rect.setAttribute("rx", "6");
      rect.setAttribute("ry", "6");
      rect.setAttribute("fill", "white");
      rect.setAttribute("stroke", textColor);
      rect.setAttribute("stroke-width", "1.5");
      labelsGroup.appendChild(rect);

      // ===== CREATE SVG TEXT =====
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
      text.setAttribute("font-size", String(FONT_SIZE));
      text.setAttribute("font-weight", "500");
      text.setAttribute("fill", textColor);

      const totalTextHeight = lines.length * LINE_HEIGHT;
      const textStartY = topY + (actualLabelHeight - totalTextHeight) / 2 + FONT_SIZE * 0.8;
      const textStartX = centerX - labelWidth / 2 + PADDING_X;

      lines.forEach((line, index) => {
        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspan.setAttribute("x", String(textStartX));
        tspan.setAttribute("y", String(textStartY + index * LINE_HEIGHT));
        tspan.textContent = line;
        text.appendChild(tspan);
      });

      labelsGroup.appendChild(text);
      labelCount++;
    }

    clonedSvg.appendChild(labelsGroup);
    console.log(`[Export] Created ${labelCount} labels`);

  } catch (error) {
    console.error("[Export] Error creating labels:", error);
  }

  return clonedSvg;
}

// ============ PNG EXPORT ============
export async function exportMapAsPng(
  mapElement: HTMLElement,
  filename: string = "patent-map.png"
): Promise<void> {
  try {
    const exportSvg = await createExportSvgWithLabels(mapElement);

    if (!exportSvg) {
      throw new Error("Failed to create export SVG");
    }

    const viewBox = exportSvg.getAttribute("viewBox");
    const viewBoxParts = viewBox?.split(" ").map(Number) || [0, 0, 900, 700];
    const svgWidth = viewBoxParts[2];
    const svgHeight = viewBoxParts[3];

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(exportSvg);

    const canvas = document.createElement("canvas");
    const scale = 2; // Increase for higher resolution (3 or 4)
    canvas.width = svgWidth * scale;
    canvas.height = svgHeight * scale;
    const ctx = canvas.getContext("2d");

    console.log(`[Export] PNG size: ${canvas.width}x${canvas.height}`);

    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load SVG image"));
      };
      img.src = url;
    });

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          console.error("[Export] Failed to create blob");
          return;
        }

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);

        console.log("[Export] PNG export complete");
      },
      "image/png",
      1.0
    );
  } catch (error) {
    console.error("[Export] Export failed:", error);
    throw error;
  }
}