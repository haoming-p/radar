import { PlayerInfo, YearlyPlayerData, PLAYER_COLORS } from "../components/internal/sidebar/PlayersSection";

// Raw patent data from CSV
export interface RawPatentData {
  index: number;
  title: string;
  applicants: string;
  filing_date: string;
  // ... other fields we don't need
}

// Spatial patent data (from our existing JSON)
export interface SpatialPatent {
  index: number;
  x: number;
  y: number;
  area_id: number;
  topic_id: number;
}

// Area info for labels
export interface AreaLabelInfo {
  id: number;
  label: string;
}

/**
 * Process CSV + spatial data to generate player information
 */
export function processPlayerData(
  rawPatents: RawPatentData[],
  spatialPatents: SpatialPatent[],
  areas: Record<string, AreaLabelInfo>,
  topN: number = 20
): { players: PlayerInfo[]; yearRange: [number, number] } {
  // Create a map of index -> spatial data
  const spatialMap = new Map<number, SpatialPatent>();
  spatialPatents.forEach((p) => spatialMap.set(p.index, p));

  // Group patents by applicant (case-insensitive dedup)
  // Key = uppercased name, value includes best display name + patents
  const applicantPatents = new Map<string, {
    displayNames: Map<string, number>; // original casing → frequency
    patents: { x: number; y: number; year: number; areaId: number; index: number }[];
  }>();

  let minYear = Infinity;
  let maxYear = -Infinity;

  rawPatents.forEach((raw) => {
    const spatial = spatialMap.get(raw.index);
    if (!spatial) return; // Skip if no spatial data

    // Parse applicants (may be separated by ; or |)
    const applicants = parseApplicants(raw.applicants);

    // Parse year from filing date
    const year = parseYear(raw.filing_date);
    if (!year) return;

    minYear = Math.min(minYear, year);
    maxYear = Math.max(maxYear, year);

    // Add to each applicant (usually just the first/primary one)
    applicants.forEach((applicant) => {
      const key = applicant.toUpperCase();
      if (!applicantPatents.has(key)) {
        applicantPatents.set(key, { displayNames: new Map(), patents: [] });
      }
      const entry = applicantPatents.get(key)!;
      entry.displayNames.set(applicant, (entry.displayNames.get(applicant) || 0) + 1);
      entry.patents.push({
        x: spatial.x,
        y: spatial.y,
        year,
        areaId: spatial.area_id,
        index: raw.index,
      });
    });
  });

  // Convert to PlayerInfo and sort by patent count
  const allPlayers: PlayerInfo[] = [];

  applicantPatents.forEach((data) => {
    const patents = data.patents;
    if (patents.length < 2) return; // Skip single-patent applicants

    // Pick most frequent original casing as display name
    let name = "";
    let maxFreq = 0;
    data.displayNames.forEach((freq, original) => {
      if (freq > maxFreq) { maxFreq = freq; name = original; }
    });

    // Calculate density-based center and radius
    const { center, radius } = calculateDenseCenter(patents);

    // Group by year (with top areas per year)
    const yearlyData = calculateYearlyData(patents, minYear, maxYear, areas);

    // Find top areas
    const topAreas = calculateTopAreas(patents, areas);

    allPlayers.push({
      name,
      totalPatents: patents.length,
      color: "", // Will be assigned later
      center,
      radius,
      patents: patents.map((p) => ({ x: p.x, y: p.y, year: p.year, index: p.index })),
      yearlyData,
      topAreas,
    });
  });

  // Sort by patent count and take top N
  allPlayers.sort((a, b) => b.totalPatents - a.totalPatents);
  const topPlayers = allPlayers.slice(0, topN);

  // Assign colors
  topPlayers.forEach((player, i) => {
    player.color = PLAYER_COLORS[i % PLAYER_COLORS.length];
  });

  // Handle edge case where no valid data
  if (minYear === Infinity) minYear = 2015;
  if (maxYear === -Infinity) maxYear = 2024;

  return {
    players: topPlayers,
    yearRange: [minYear, maxYear],
  };
}

/**
 * Parse applicants string into array of names
 * Only takes the first applicant to avoid double-counting
 */
function parseApplicants(applicants: string): string[] {
  if (!applicants) return [];
  
  // Handle various separators: ; | ,
  // But be careful with commas as they might be part of company names
  let parts: string[];
  if (applicants.includes(";")) {
    parts = applicants.split(";");
  } else if (applicants.includes("|")) {
    parts = applicants.split("|");
  } else {
    parts = [applicants]; // Single applicant
  }
  
  return parts
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
    .slice(0, 1); // Take only first applicant
}

/**
 * Parse year from date string
 * Handles formats like: 2020-01-15, 01/15/2020, 2020, etc.
 */
function parseYear(dateStr: string): number | null {
  if (!dateStr) return null;
  
  // Try to find 4-digit year
  const match = dateStr.match(/(\d{4})/);
  if (match) {
    const year = parseInt(match[1], 10);
    if (year >= 1900 && year <= 2100) {
      return year;
    }
  }
  return null;
}

/**
 * Calculate center of gravity (average position)
 */
function calculateCenter(patents: { x: number; y: number }[]): { x: number; y: number } {
  const sumX = patents.reduce((sum, p) => sum + p.x, 0);
  const sumY = patents.reduce((sum, p) => sum + p.y, 0);
  return {
    x: sumX / patents.length,
    y: sumY / patents.length,
  };
}

/**
 * Calculate distribution radius (standard deviation from center)
 */
function calculateRadius(
  patents: { x: number; y: number }[],
  center: { x: number; y: number }
): number {
  const sumSqDist = patents.reduce((sum, p) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return sum + dx * dx + dy * dy;
  }, 0);
  return Math.sqrt(sumSqDist / patents.length);
}

/**
 * Find the density-based center and radius.
 * 1. For each patent, count neighbors within a search radius
 * 2. Center = average of the densest neighborhood
 * 3. Radius = std dev of that neighborhood
 */
function calculateDenseCenter(
  patents: { x: number; y: number }[]
): { center: { x: number; y: number }; radius: number } {
  if (patents.length <= 2) {
    const center = calculateCenter(patents);
    return { center, radius: calculateRadius(patents, center) };
  }

  // Search radius = 30% of overall spread
  const avgCenter = calculateCenter(patents);
  const overallRadius = calculateRadius(patents, avgCenter);
  const searchR = overallRadius * 0.6;
  const searchR2 = searchR * searchR;

  // Find the patent with the most neighbors
  let bestIdx = 0;
  let bestCount = 0;
  for (let i = 0; i < patents.length; i++) {
    let count = 0;
    for (let j = 0; j < patents.length; j++) {
      const dx = patents[i].x - patents[j].x;
      const dy = patents[i].y - patents[j].y;
      if (dx * dx + dy * dy <= searchR2) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestIdx = i;
    }
  }

  // Collect the dense neighborhood
  const peak = patents[bestIdx];
  const neighbors = patents.filter((p) => {
    const dx = p.x - peak.x;
    const dy = p.y - peak.y;
    return dx * dx + dy * dy <= searchR2;
  });

  const center = calculateCenter(neighbors);
  const radius = calculateRadius(neighbors, center);
  return { center, radius };
}

/**
 * Calculate yearly patent counts, centers, and top areas
 */
function calculateYearlyData(
  patents: { x: number; y: number; year: number; areaId: number }[],
  minYear: number,
  maxYear: number,
  areas: Record<string, AreaLabelInfo>
): YearlyPlayerData[] {
  const byYear = new Map<number, { x: number; y: number; areaId: number }[]>();

  // Initialize all years
  for (let y = minYear; y <= maxYear; y++) {
    byYear.set(y, []);
  }

  // Group patents
  patents.forEach((p) => {
    if (byYear.has(p.year)) {
      byYear.get(p.year)!.push({ x: p.x, y: p.y, areaId: p.areaId });
    }
  });

  // Convert to array
  const result: YearlyPlayerData[] = [];
  byYear.forEach((yearPatents, year) => {
    const count = yearPatents.length;
    const { center, radius } = count > 0
      ? calculateDenseCenter(yearPatents)
      : { center: { x: 0, y: 0 }, radius: 0 };

    // Calculate top areas for this year
    const topAreas = calculateTopAreasFromList(yearPatents, areas);

    result.push({ year, count, center, radius, topAreas });
  });

  return result.sort((a, b) => a.year - b.year);
}

/**
 * Calculate top areas from a list of patents with areaId
 */
function calculateTopAreasFromList(
  patents: { areaId: number }[],
  areas: Record<string, AreaLabelInfo>
): { areaId: number; count: number; label: string }[] {
  const countByArea = new Map<number, number>();

  patents.forEach((p) => {
    if (p.areaId >= 0) {
      countByArea.set(p.areaId, (countByArea.get(p.areaId) || 0) + 1);
    }
  });

  const result: { areaId: number; count: number; label: string }[] = [];
  countByArea.forEach((count, areaId) => {
    const area = areas[String(areaId)];
    result.push({
      areaId,
      count,
      label: area?.label || `Area ${areaId}`,
    });
  });

  return result.sort((a, b) => b.count - a.count).slice(0, 5);
}

/**
 * Calculate top areas by patent count
 */
function calculateTopAreas(
  patents: { areaId: number }[],
  areas: Record<string, AreaLabelInfo>
): { areaId: number; count: number; label: string }[] {
  const countByArea = new Map<number, number>();

  patents.forEach((p) => {
    if (p.areaId >= 0) {
      countByArea.set(p.areaId, (countByArea.get(p.areaId) || 0) + 1);
    }
  });

  const result: { areaId: number; count: number; label: string }[] = [];
  countByArea.forEach((count, areaId) => {
    const area = areas[String(areaId)];
    result.push({
      areaId,
      count,
      label: area?.label || `Area ${areaId}`,
    });
  });

  return result.sort((a, b) => b.count - a.count).slice(0, 5);
}

/**
 * Parse CSV text into array of objects
 */
export function parseCSV(csvText: string): RawPatentData[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);
  
  // Find column indices
  const indexCol = headers.findIndex(h => h.toLowerCase() === "index" || h.toLowerCase() === "id");
  const titleCol = headers.findIndex(h => h.toLowerCase().includes("title"));
  const applicantsCol = headers.findIndex(h => h.toLowerCase().includes("applicant"));
  const dateCol = headers.findIndex(h => 
    h.toLowerCase().includes("filing") || 
    h.toLowerCase().includes("date") ||
    h.toLowerCase().includes("year")
  );

  // Parse rows
  const results: RawPatentData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;

    results.push({
      index: indexCol >= 0 ? parseInt(values[indexCol], 10) : i - 1,
      title: titleCol >= 0 ? values[titleCol] : "",
      applicants: applicantsCol >= 0 ? values[applicantsCol] : "",
      filing_date: dateCol >= 0 ? values[dateCol] : "",
    });
  }

  return results;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}