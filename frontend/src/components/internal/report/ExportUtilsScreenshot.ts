/**
 * Export Utils Screenshot - Testing high resolution SVG export
 * Tests fixing the scale issue by setting explicit width/height on SVG
 * 
 * Two functions to compare:
 * - exportMapAsScreenshot: WITH the width/height fix (Screenshot Fixed button)
 * - exportMapAsSimpleScreenshot: WITHOUT the fix (Screenshot Simple button)
 */

// Category colors for labels
const CATEGORY_COLORS: Record<string, string> = {
  growing: "#166534",
  sparse: "#F97316",
  major: "#991B1B",
  avoid: "#1F2937",
};

// Constants for SVG text - MATCH BROWSER'S text-xs (12px)
const FONT_SIZE = 12;
const LINE_HEIGHT = 16;
const PADDING_X = 8;
const PADDING_Y = 6;

/**
 * Truncate text to fit within a given width
 */
function truncateToFit(text: string, boxWidth: number): string {
  const availableWidth = boxWidth - PADDING_X * 2;
  const maxChars = Math.floor(availableWidth / 7);

  if (text.length <= maxChars) {
    return text;
  }

  return text.substring(0, Math.max(maxChars - 3, 5)).trim() + "...";
}

/**
 * Clone map SVG and add labels
 * NEW APPROACH: Scale SVG content UP to screen size, add labels at screen coordinates
 */
async function createExportSvgWithLabels(
  mapElement: HTMLElement
): Promise<SVGSVGElement | null> {
  console.log("[HighRes] ==========================================");
  console.log("[HighRes] createExportSvgWithLabels START");
  console.log("[HighRes] NEW APPROACH: Scale SVG up to screen size");
  console.log("[HighRes] ==========================================");

  // ============ STEP 1: Find and clone the map SVG ============
  console.log("[HighRes] STEP 1: Finding map SVG...");
  const allSvgs = mapElement.querySelectorAll("svg");
  console.log(`[HighRes] Found ${allSvgs.length} SVG elements`);

  let originalSvg: SVGSVGElement | null = null;
  let originalViewBox = { width: 900, height: 700 };

  for (let i = 0; i < allSvgs.length; i++) {
    const svg = allSvgs[i];
    const viewBox = svg.getAttribute("viewBox");
    console.log(`[HighRes] SVG[${i}] viewBox: ${viewBox}`);

    if (viewBox) {
      const parts = viewBox.split(" ").map(Number);
      const width = parts[2] || 0;
      const height = parts[3] || 0;

      if (width > 100 && height > 100) {
        originalSvg = svg as SVGSVGElement;
        originalViewBox = { width, height };
        console.log(`[HighRes] ✓ Selected SVG[${i}] as map (${width}x${height})`);
        break;
      }
    }
  }

  if (!originalSvg) {
    console.error("[HighRes] ✗ No map SVG element found!");
    return null;
  }

  const clonedSvg = originalSvg.cloneNode(true) as SVGSVGElement;
  clonedSvg.style.transform = "none";
  console.log("[HighRes] ✓ SVG cloned");

  // ============ STEP 2: Get screen dimensions ============
  console.log("[HighRes] STEP 2: Getting dimensions...");
  
  const mapRect = originalSvg.getBoundingClientRect();
  const screenWidth = mapRect.width;
  const screenHeight = mapRect.height;

  console.log(`[HighRes] Original viewBox: ${originalViewBox.width}x${originalViewBox.height}`);
  console.log(`[HighRes] Screen dimensions: ${screenWidth.toFixed(1)}x${screenHeight.toFixed(1)}`);

  // ============ STEP 3: Scale up SVG content ============
  console.log("[HighRes] STEP 3: Scaling up SVG content to screen size...");

  // Calculate scale factors to go from viewBox to screen
  const scaleUpX = screenWidth / originalViewBox.width;
  const scaleUpY = screenHeight / originalViewBox.height;
  
  // ASPECT RATIO CONTROL
  // 0 = perfect circle (uniform scaling, no stretch)
  // 1 = full stretch to fill screen (may look oval)
  // Try values like 0.3 or 0.5 for slight oval effect
  const STRETCH_AMOUNT = 0.3; // <-- ADJUST THIS (0 to 1)
  
  const minScale = Math.min(scaleUpX, scaleUpY);
  const finalScaleX = minScale + (scaleUpX - minScale) * STRETCH_AMOUNT;
  const finalScaleY = minScale + (scaleUpY - minScale) * STRETCH_AMOUNT;
  
  console.log(`[HighRes] Scale factors: X=${scaleUpX.toFixed(4)}, Y=${scaleUpY.toFixed(4)}`);
  console.log(`[HighRes] STRETCH_AMOUNT: ${STRETCH_AMOUNT} (0=uniform, 1=full stretch)`);
  console.log(`[HighRes] Final scales: X=${finalScaleX.toFixed(4)}, Y=${finalScaleY.toFixed(4)}`);

  // Calculate the scaled map size - THIS IS OUR ACTUAL OUTPUT SIZE (no white borders!)
  const scaledMapWidth = originalViewBox.width * finalScaleX;
  const scaledMapHeight = originalViewBox.height * finalScaleY;
  
  console.log(`[HighRes] Scaled map size (output size): ${scaledMapWidth.toFixed(0)}x${scaledMapHeight.toFixed(0)}`);

  // Use scaled map size as viewBox - NO WHITE BORDERS!
  clonedSvg.setAttribute("viewBox", `0 0 ${scaledMapWidth} ${scaledMapHeight}`);
  console.log(`[HighRes] ✓ ViewBox set to map size: 0 0 ${scaledMapWidth.toFixed(0)} ${scaledMapHeight.toFixed(0)}`);

  // Wrap ALL existing SVG content in a scaled group (no offset needed - starts at 0,0)
  const existingChildren = Array.from(clonedSvg.children);
  const scaleGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  scaleGroup.setAttribute("transform", `scale(${finalScaleX}, ${finalScaleY})`);
  scaleGroup.setAttribute("class", "scaled-map-content");

  existingChildren.forEach(child => {
    scaleGroup.appendChild(child);
  });
  clonedSvg.appendChild(scaleGroup);
  console.log(`[HighRes] ✓ Wrapped ${existingChildren.length} elements in scaled group`);

  // ============ STEP 4: Find HTML labels ============
  console.log("[HighRes] STEP 4: Finding HTML labels...");
  
  const labelContainer = mapElement.querySelector(".pointer-events-none");
  console.log(`[HighRes] Label container found: ${!!labelContainer}`);

  const labelElements = labelContainer
    ? labelContainer.querySelectorAll(".pointer-events-auto")
    : mapElement.querySelectorAll(".pointer-events-auto");

  console.log(`[HighRes] Found ${labelElements.length} potential labels`);

  if (labelElements.length === 0) {
    console.log("[HighRes] No labels to add, returning SVG");
    return clonedSvg;
  }

  // ============ STEP 5: Create SVG labels ============
  console.log("[HighRes] STEP 5: Creating SVG labels...");
  
  // Calculate scale from screen coords to output coords
  const labelScaleX = scaledMapWidth / screenWidth;
  const labelScaleY = scaledMapHeight / screenHeight;
  console.log(`[HighRes] Label scale: X=${labelScaleX.toFixed(4)}, Y=${labelScaleY.toFixed(4)}`);

  const labelsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  labelsGroup.setAttribute("class", "exported-labels");

  let labelCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < labelElements.length; i++) {
    const htmlEl = labelElements[i] as HTMLElement;

    console.log(`[HighRes] --- Label ${i + 1}/${labelElements.length} ---`);

    // Skip small elements
    if (htmlEl.offsetWidth < 80 || htmlEl.offsetHeight < 20) {
      console.log(`[HighRes] ✗ Skipped: too small (${htmlEl.offsetWidth}x${htmlEl.offsetHeight})`);
      skippedCount++;
      continue;
    }

    // Get the card element
    const cardEl = htmlEl.querySelector(".rounded-lg") as HTMLElement;
    if (!cardEl) {
      console.log(`[HighRes] ✗ Skipped: no .rounded-lg card found`);
      skippedCount++;
      continue;
    }

    // ===== SCREEN DIMENSIONS =====
    const cardRect = cardEl.getBoundingClientRect();
    const labelRect = htmlEl.getBoundingClientRect();

    // Label dimensions - scale from screen to output
    const ICON_SPACE = 54;
    const screenLabelWidth = cardRect.width - ICON_SPACE + 8;
    const screenLabelHeight = cardRect.height;
    
    // Scale to output coordinates
    const labelWidth = screenLabelWidth * labelScaleX;
    const labelHeight = screenLabelHeight * labelScaleY;

    // Position relative to map, scaled to output coordinates
    const screenCenterX = labelRect.left - mapRect.left + labelRect.width / 2;
    const screenTopY = cardRect.top - mapRect.top;
    
    const centerX = screenCenterX * labelScaleX;
    const topY = screenTopY * labelScaleY;

    console.log(`[HighRes] Screen pos: (${screenCenterX.toFixed(1)}, ${screenTopY.toFixed(1)}) → Output pos: (${centerX.toFixed(1)}, ${topY.toFixed(1)})`);
    console.log(`[HighRes] Label size: ${labelWidth.toFixed(1)}x${labelHeight.toFixed(1)}`);

    // ===== TEXT CONTENT =====
    const hasCustomShortLabel = htmlEl.getAttribute("data-has-custom-short-label") === "true";
    const wrappedLinesAttr = htmlEl.getAttribute("data-wrapped-lines");

    const textSpan = htmlEl.querySelector("span");
    const labelText = textSpan?.textContent?.trim() || "";

    console.log(`[HighRes] Text: "${labelText.substring(0, 30)}${labelText.length > 30 ? '...' : ''}"`);
    console.log(`[HighRes] hasCustomShortLabel: ${hasCustomShortLabel}`);

    if (!labelText || labelText.length < 2) {
      console.log(`[HighRes] ✗ Skipped: text too short`);
      skippedCount++;
      continue;
    }

    // ===== DETECT COLOR =====
    const computedStyle = window.getComputedStyle(cardEl);
    const borderColor = computedStyle.borderColor;

    let textColor = CATEGORY_COLORS.growing;
    let category = "growing";
    const rgbMatch = borderColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);

      if (r > 200 && g > 100 && b < 50) {
        textColor = CATEGORY_COLORS.sparse;
        category = "sparse";
      } else if (r > 130 && g < 50 && b < 50) {
        textColor = CATEGORY_COLORS.major;
        category = "major";
      } else if (r < 50 && g < 60 && b < 80) {
        textColor = CATEGORY_COLORS.avoid;
        category = "avoid";
      }
    }
    console.log(`[HighRes] Category: ${category}, Color: ${textColor}`);

    // ===== DETERMINE TEXT LINES =====
    let lines: string[];
    // Use SCREEN width for text wrapping calculation (matching browser)
    const screenAvailableWidth = screenLabelWidth - PADDING_X * 2;
    const charsPerLine = Math.floor(screenAvailableWidth / 7); // 7px per char at screen size

    console.log(`[HighRes] Available width (screen): ${screenAvailableWidth.toFixed(1)}, chars/line: ${charsPerLine}`);

    if (hasCustomShortLabel && wrappedLinesAttr && wrappedLinesAttr !== "null") {
      // Use browser-wrapped lines DIRECTLY (they're already at screen size!)
      lines = wrappedLinesAttr.split("|");
      console.log(`[HighRes] Using browser-wrapped lines directly (${lines.length} lines)`);
    } else {
      // Default label - truncate (use screen width for calculation)
      lines = [truncateToFit(labelText, screenLabelWidth)];
      console.log(`[HighRes] Using truncated single line`);
    }

    console.log(`[HighRes] Final lines: ${JSON.stringify(lines)}`);

    // ===== SCALE TEXT PARAMETERS =====
    const avgScale = (labelScaleX + labelScaleY) / 2;
    const scaledFontSize = FONT_SIZE * avgScale;
    const scaledLineHeight = LINE_HEIGHT * avgScale;
    const scaledPaddingX = PADDING_X * labelScaleX;
    const scaledPaddingY = PADDING_Y * labelScaleY;

    // ===== CALCULATE FINAL HEIGHT =====
    const actualLabelHeight = Math.max(
      labelHeight,
      lines.length * scaledLineHeight + scaledPaddingY * 2
    );
    console.log(`[HighRes] Final height: ${actualLabelHeight.toFixed(1)}, scaled font: ${scaledFontSize.toFixed(1)}`);

    // ===== CREATE SVG RECT =====
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(centerX - labelWidth / 2));
    rect.setAttribute("y", String(topY));
    rect.setAttribute("width", String(labelWidth));
    rect.setAttribute("height", String(actualLabelHeight));
    rect.setAttribute("rx", String(6 * avgScale));
    rect.setAttribute("ry", String(6 * avgScale));
    rect.setAttribute("fill", "white");
    rect.setAttribute("stroke", textColor);
    rect.setAttribute("stroke-width", String(1.5 * avgScale));
    labelsGroup.appendChild(rect);

    // ===== CREATE SVG TEXT =====
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
    text.setAttribute("font-size", String(scaledFontSize));
    text.setAttribute("font-weight", "500");
    text.setAttribute("fill", textColor);

    const totalTextHeight = lines.length * scaledLineHeight;
    const textStartY = topY + (actualLabelHeight - totalTextHeight) / 2 + scaledFontSize * 0.8;
    const textStartX = centerX - labelWidth / 2 + scaledPaddingX;

    lines.forEach((line, index) => {
      const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      tspan.setAttribute("x", String(textStartX));
      tspan.setAttribute("y", String(textStartY + index * scaledLineHeight));
      tspan.textContent = line;
      text.appendChild(tspan);
    });

    labelsGroup.appendChild(text);
    labelCount++;
    console.log(`[HighRes] ✓ Label ${labelCount} created`);
  }

  clonedSvg.appendChild(labelsGroup);

  console.log("[HighRes] ==========================================");
  console.log(`[HighRes] SUMMARY: ${labelCount} labels created, ${skippedCount} skipped`);
  console.log(`[HighRes] Final viewBox: ${scaledMapWidth.toFixed(0)}x${scaledMapHeight.toFixed(0)} (no white borders!)`);
  console.log("[HighRes] ==========================================");

  return clonedSvg;
}

// ============ HIGH-RES PNG EXPORT ============
export async function exportMapAsScreenshot(
  mapElement: HTMLElement,
  filename: string = "patent-map-highres.png",
  options: { scale?: number; hideIcons?: boolean } = {}
): Promise<void> {
  const { scale = 2 } = options; // 2x on top of screen size = very high res

  console.log("[HighRes] ##########################################");
  console.log("[HighRes] exportMapAsScreenshot START");
  console.log(`[HighRes] Requested scale: ${scale}x (on top of screen size)`);
  console.log("[HighRes] ##########################################");

  try {
    const exportSvg = await createExportSvgWithLabels(mapElement);

    if (!exportSvg) {
      throw new Error("Failed to create export SVG");
    }

    // Get the NEW viewBox (which is now screen size)
    const viewBox = exportSvg.getAttribute("viewBox");
    const viewBoxParts = viewBox?.split(" ").map(Number) || [0, 0, 1920, 1080];
    const svgWidth = viewBoxParts[2];
    const svgHeight = viewBoxParts[3];

    console.log(`[HighRes] SVG viewBox (screen size): ${svgWidth.toFixed(0)}x${svgHeight.toFixed(0)}`);

    // Calculate canvas size (screen size × scale)
    const canvasWidth = Math.round(svgWidth * scale);
    const canvasHeight = Math.round(svgHeight * scale);

    console.log(`[HighRes] Canvas size: ${canvasWidth}x${canvasHeight} (${scale}x scale)`);

    // Set explicit width/height on SVG before serializing
    exportSvg.setAttribute("width", String(canvasWidth));
    exportSvg.setAttribute("height", String(canvasHeight));
    console.log(`[HighRes] ✓ Set SVG width="${canvasWidth}" height="${canvasHeight}"`);

    // Serialize SVG
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(exportSvg);
    console.log(`[HighRes] SVG serialized: ${svgString.length} chars`);

    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }

    // Fill background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    console.log(`[HighRes] Canvas created and filled with white`);

    // Load SVG as image
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    console.log(`[HighRes] Loading SVG as image...`);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        console.log(`[HighRes] ✓ Image loaded: ${img.width}x${img.height}`);
        console.log(`[HighRes] Drawing to canvas...`);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        console.log(`[HighRes] ✓ Image drawn to canvas`);
        resolve();
      };
      img.onerror = (err) => {
        console.error("[HighRes] ✗ Image load failed:", err);
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load SVG image"));
      };
      img.src = url;
    });

    // Export as PNG
    console.log(`[HighRes] Exporting as PNG...`);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          console.error("[HighRes] ✗ Failed to create blob");
          return;
        }

        console.log(`[HighRes] ✓ Blob created: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);

        console.log("[HighRes] ##########################################");
        console.log("[HighRes] ✓ EXPORT SUCCESS!");
        console.log(`[HighRes] Filename: ${filename}`);
        console.log(`[HighRes] Size: ${canvasWidth}x${canvasHeight} pixels`);
        console.log(`[HighRes] This is ${scale}x screen size (${svgWidth.toFixed(0)}x${svgHeight.toFixed(0)})`);
        console.log("[HighRes] ##########################################");
      },
      "image/png",
      1.0
    );
  } catch (error) {
    console.error("[HighRes] ##########################################");
    console.error("[HighRes] ✗ EXPORT FAILED!");
    console.error("[HighRes] Error:", error);
    console.error("[HighRes] ##########################################");
    throw error;
  }
}

// End of file