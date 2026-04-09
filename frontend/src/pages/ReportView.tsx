import { useMemo, useEffect } from "react";
import ReportMap from "../components/report/ReportMap";
import PlayerTrendChart from "../components/report/PlayerTrendChart";
import { PatentPoint, ClusterInfo, AreaInfo, HotAreaInfo, CurrentsData, AREA_COLORS } from "../components/internal/map/RadarMap";
import { processPlayerData, parseCSV } from "../scripts/PlayerDataUtils";
import { PlayerInfo } from "../components/internal/sidebar/PlayersSection";
import { useState } from "react";

// Reference data is fetched at runtime from /data/* (served by Vite's public/ folder)
// rather than imported as modules — keeps the JS bundle small and avoids OOM at build.
const RADAR10_JSON_URL = "/data/radar10-272364.json";
const RAW_CSV_URL = "/data/raw-272364.csv";

// Content width constant — all maps, charts, and card grids use this
const CONTENT_WIDTH = 1024;

export default function ReportView() {
  // Reference data fetched at runtime
  const [radar10Data, setRadar10Data] = useState<any | null>(null);
  const [rawCsvText, setRawCsvText] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [jsonRes, csvRes] = await Promise.all([
          fetch(RADAR10_JSON_URL),
          fetch(RAW_CSV_URL),
        ]);
        if (!jsonRes.ok) throw new Error(`Failed to load ${RADAR10_JSON_URL}: ${jsonRes.status}`);
        if (!csvRes.ok) throw new Error(`Failed to load ${RAW_CSV_URL}: ${csvRes.status}`);
        const json = await jsonRes.json();
        const csv = await csvRes.text();
        if (cancelled) return;
        setRadar10Data(json);
        setRawCsvText(csv);
      } catch (e) {
        if (!cancelled) setDataError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Parse data (same as AnalysisView)
  const clusters = useMemo(() => {
    if (!radar10Data) return {} as Record<string, ClusterInfo>;
    const result: Record<string, ClusterInfo> = {};
    for (const [id, cl] of Object.entries(radar10Data.clusters as Record<string, any>)) {
      result[id] = { ...cl, centroid_umap: cl.centroid, centroid_tsne: cl.centroid };
    }
    return result;
  }, [radar10Data]);

  const patents: PatentPoint[] = useMemo(() => {
    if (!radar10Data) return [];
    return (radar10Data.patents as any[]).map((p) => ({
      ...p, x_umap: p.x, y_umap: p.y, x_tsne: p.x, y_tsne: p.y,
    }));
  }, [radar10Data]);

  const areas: Record<string, AreaInfo> = useMemo(() => {
    if (!radar10Data) return {};
    const raw = (radar10Data as any).areas || {};
    const result: Record<string, AreaInfo> = {};
    for (const [id, area] of Object.entries(raw as Record<string, any>)) {
      result[id] = area;
    }
    return result;
  }, [radar10Data]);

  const hotAreas: Record<string, HotAreaInfo> = useMemo(() => {
    if (!radar10Data) return {};
    const raw = (radar10Data as any).hot_areas || {};
    const result: Record<string, HotAreaInfo> = {};
    for (const [id, area] of Object.entries(raw as Record<string, any>)) {
      result[id] = area;
    }
    return result;
  }, [radar10Data]);

  const currentsData: CurrentsData | undefined = useMemo(() => {
    if (!radar10Data) return undefined;
    const raw = (radar10Data as any).currents;
    return raw as CurrentsData | undefined;
  }, [radar10Data]);

  const [players, setPlayers] = useState<PlayerInfo[]>([]);

  useEffect(() => {
    if (!radar10Data || !rawCsvText) return;
    const rawPatents = parseCSV(rawCsvText);
    const spatialPatents = (radar10Data.patents as any[]).map((p: any) => ({
      index: p.index as number, x: p.x as number, y: p.y as number,
      area_id: p.area_id as number, topic_id: p.cluster_id as number,
    }));
    const areaLabels: Record<string, { id: number; label: string }> = {};
    for (const [id, area] of Object.entries((radar10Data as any).areas || {})) {
      areaLabels[id] = { id: (area as any).id, label: (area as any).label };
    }
    const result = processPlayerData(rawPatents, spatialPatents, areaLabels, 20);
    setPlayers(result.players);
  }, [radar10Data, rawCsvText]);

  // Sort areas by patent count
  const sortedAreas = useMemo(() => {
    return Object.values(areas).sort((a, b) => b.patent_count - a.patent_count);
  }, [areas]);

  const sortedHotAreas = useMemo(() => {
    return Object.values(hotAreas).sort((a, b) => b.patent_count - a.patent_count);
  }, [hotAreas]);

  const sortedAreaIds = sortedAreas.map((a) => a.id);

  // Compute "since 2022" counts for signals
  const signalRecentCounts = useMemo(() => {
    if (!currentsData) return {};
    const counts: Record<number, number> = {};
    for (const sig of currentsData.signals) {
      counts[sig.id] = patents.filter(
        (p) => p.cluster_id === sig.cluster_id && p.year != null && p.year >= 2022
      ).length;
    }
    return counts;
  }, [currentsData, patents]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Loading / error gate: wait for runtime-fetched reference data
  if (dataError) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-sm text-red-600 gap-2">
        <div>Failed to load reference data.</div>
        <div className="text-xs text-gray-500">{dataError}</div>
      </div>
    );
  }
  if (!radar10Data || !rawCsvText) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Loading patent data…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Print button (hidden in print) */}
      <div className="fixed top-4 right-4 z-50 print:hidden flex gap-2">
        <button
          onClick={() => window.close()}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg shadow-lg hover:bg-gray-300 transition-colors"
        >
          Close
        </button>
      </div>

      <div className="mx-auto py-12 px-8 print:py-4 print:px-0" style={{ maxWidth: CONTENT_WIDTH + 64 }}>
        {/* Header */}
        <div className="mb-10 print:mb-6">
          <div className="flex items-center gap-3 mb-2">
            <img src="/logo.png" alt="VALUENEX" className="h-8" />
          </div>
          <h1 className="text-3xl font-bold text-[#0d3356] mt-4">Patent Landscape Analysis Report</h1>
          <p className="text-gray-500 mt-1">{dateStr} &middot; {patents.length.toLocaleString()} patents &middot; {Object.keys(clusters).length} clusters &middot; {Object.keys(areas).length} zones</p>
          <div className="mt-4 h-0.5 bg-gradient-to-r from-[#0d3356] to-transparent" />
        </div>

        {/* ── Key Takeaways ── */}
        <section className="mb-12 print:mb-8">
          <div className="rounded-2xl bg-gradient-to-br from-[#0d3356] to-[#1a5a8a] p-8 text-white">
            <div className="text-xs uppercase tracking-widest text-blue-200/70 mb-4 font-medium">
              Key Takeaways
            </div>
            <h2 className="text-2xl font-bold leading-snug mb-3">
              <span className="text-cyan-300">{patents.length.toLocaleString()} patents</span> mapped across{" "}
              <span className="text-cyan-300">{Object.keys(areas).length} territory zones</span>.
            </h2>
            <p className="text-sm text-blue-100/80 leading-relaxed max-w-[700px]">
              {Object.keys(clusters).length} clusters reveal where innovation concentrates.
              {sortedHotAreas.length > 0 && <> {sortedHotAreas.length} hot zones show the densest activity.</>}
              {currentsData && currentsData.convergence_regions.length > 0 && (
                <> {currentsData.convergence_regions.length} convergence regions signal cross-domain momentum.</>
              )}
            </p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-4 -mt-6 px-4">
            {[
              { value: patents.length.toLocaleString(), label: "Patents", color: "#0ea5e9" },
              { value: Object.keys(clusters).length.toString(), label: "Clusters", color: "#6366f1" },
              { value: sortedHotAreas.length.toString(), label: "Hot Zones", color: "#f59e0b" },
              {
                value: currentsData ? currentsData.convergence_regions.length.toString() : "—",
                label: "Convergence Regions",
                color: "#dc2626",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-xl shadow-md border border-gray-100 p-5 text-center"
              >
                <div className="text-3xl font-extrabold" style={{ color: stat.color }}>
                  {stat.value}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-1 font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 1: Territory Zones ── */}
        <section className="mb-12 print:mb-8">
          <h2 className="text-xl font-bold text-[#0d3356] mb-1">1. Territory Zones</h2>
          <p className="text-sm text-gray-500 mb-6">
            Each territory zone represents a distinct cluster of related patents. Zones may overlap spatially since they share boundary regions.
          </p>

          {sortedAreas.map((area, idx) => {
            const colorIdx = sortedAreaIds.indexOf(area.id);
            const color = AREA_COLORS[colorIdx % AREA_COLORS.length];
            return (
              <div key={area.id} className="mb-8 print:break-inside-avoid">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color.dot }} />
                  <h3 className="text-base font-semibold text-gray-800">
                    {idx + 1}. {area.label}
                  </h3>
                </div>

                <div className="flex gap-6 items-start">
                  {/* Map */}
                  <div className="flex-shrink-0">
                    <ReportMap
                      patents={patents}
                      clusters={clusters}
                      areas={areas}
                      mode="zone"
                      highlightAreaId={area.id}
                      width={420}
                      height={320}
                    />
                  </div>

                  {/* Info card */}
                  <div className="flex-1 min-w-0">
                    <div className="space-y-3">
                      <div className="flex gap-6 text-sm">
                        <div>
                          <div className="text-2xl font-bold text-[#0d3356]">{area.patent_count.toLocaleString()}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider">Patents</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-[#0d3356]">{area.cluster_count}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider">Clusters</div>
                        </div>
                      </div>

                      {area.summary && (
                        <p className="text-xs text-gray-600 leading-relaxed">{area.summary}</p>
                      )}

                      {area.keywords && (
                        <div>
                          <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1.5 font-medium">Keywords</div>
                          <div className="flex flex-wrap gap-1">
                            {area.keywords.split(", ").slice(0, 10).map((kw, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{kw}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {idx < sortedAreas.length - 1 && (
                  <div className="mt-6 border-b border-gray-200" />
                )}
              </div>
            );
          })}
        </section>

        {/* ── Section 2: Hot Map ── */}
        <section className="mb-12 print:mb-8 print:break-before-page">
          <h2 className="text-xl font-bold text-[#0d3356] mb-1">2. Hot Map</h2>
          <p className="text-sm text-gray-500 mb-6">
            High-concentration zones identified from the density heatmap, representing areas with the densest patent activity.
          </p>

          {/* Combined heatmap — full width */}
          <div className="mb-6">
            <ReportMap
              patents={patents}
              clusters={clusters}
              areas={areas}
              hotAreas={hotAreas}
              mode="hotmap"
              width={CONTENT_WIDTH}
              height={Math.round(CONTENT_WIDTH * 0.65)}
            />
          </div>

          {/* Hot area cards */}
          <div className="grid grid-cols-2 gap-4">
            {sortedHotAreas.map((ha, idx) => (
              <div key={ha.id} className="border border-amber-200 rounded-lg p-5 bg-amber-50/30 print:break-inside-avoid">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <h3 className="text-sm font-semibold text-gray-800">{idx + 1}. {ha.label}</h3>
                </div>
                <div className="flex gap-4 mb-3">
                  <div>
                    <span className="text-lg font-bold text-[#0d3356]">{ha.patent_count.toLocaleString()}</span>
                    <span className="text-xs text-gray-500 ml-1">patents</span>
                  </div>
                  <div>
                    <span className="text-lg font-bold text-[#0d3356]">{ha.cluster_count}</span>
                    <span className="text-xs text-gray-500 ml-1">clusters</span>
                  </div>
                </div>
                {ha.summary && (
                  <p className="text-xs text-gray-600 leading-relaxed mb-3">{ha.summary}</p>
                )}
                {ha.keywords && (
                  <div>
                    <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1.5 font-medium">Keywords</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ha.keywords.split(", ").slice(0, 8).map((kw, i) => (
                        <span key={i} className="text-[11px] px-2 py-1 bg-amber-100/80 text-amber-800 rounded-md font-medium">{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 3: Currents ── */}
        {currentsData && (
          <section className="mb-12 print:mb-8 print:break-before-page">
            <h2 className="text-xl font-bold text-[#0d3356] mb-1">3. Currents</h2>
            <p className="text-sm text-gray-500 mb-6">
              Convergence regions where clusters from different zones are spatially close and growing, plus emerging signals worth watching.
            </p>

            {/* Currents map — full width */}
            <div className="mb-6">
              <ReportMap
                patents={patents}
                clusters={clusters}
                areas={areas}
                currentsData={currentsData}
                mode="currents"
                width={CONTENT_WIDTH}
                height={Math.round(CONTENT_WIDTH * 0.65)}
              />
            </div>

            {/* Convergence regions — top 3 */}
            {currentsData.convergence_regions.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wider mb-3">Convergence Regions</h3>
                <div className="space-y-4">
                  {currentsData.convergence_regions.slice(0, 3).map((cr, idx) => (
                    <div key={cr.id} className="border border-red-200 rounded-lg p-5 bg-red-50/20 print:break-inside-avoid">
                      <h4 className="text-sm font-semibold text-gray-800 mb-2">{idx + 1}. {cr.name}</h4>
                      <div className="flex gap-4 text-xs mb-3">
                        <span className="text-gray-600"><span className="font-bold text-[#0d3356] text-base">{cr.total_patents.toLocaleString()}</span> patents</span>
                        <span className="text-gray-600"><span className="font-bold text-[#0d3356] text-base">{cr.cluster_count}</span> clusters</span>
                        <span className="text-gray-600"><span className="font-bold text-emerald-600 text-base">{cr.growing_clusters}</span> growing</span>
                        <span className="text-gray-600"><span className="font-bold text-[#0d3356] text-base">{cr.zone_names.length}</span> zones</span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed mb-2">{cr.description}</p>
                      {cr.why_care && (
                        <p className="text-xs text-gray-500 italic leading-relaxed mb-3">{cr.why_care}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {cr.zone_names.map((zn, i) => (
                          <span key={i} className="text-[11px] px-2 py-1 bg-red-100/80 text-red-700 rounded-md font-medium">{zn}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signals — top 2 */}
            {currentsData.signals.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-orange-700 uppercase tracking-wider mb-3">Signals</h3>
                <div className="grid grid-cols-2 gap-4">
                  {currentsData.signals.slice(0, 2).map((sig, idx) => {
                    const recentCount = signalRecentCounts[sig.id] ?? 0;
                    return (
                      <div key={sig.id} className="border border-orange-200 rounded-lg p-5 bg-orange-50/20 print:break-inside-avoid">
                        <h4 className="text-sm font-semibold text-gray-800 mb-2">{idx + 1}. {sig.name}</h4>
                        <div className="flex gap-3 text-xs mb-3">
                          <span className="text-gray-600">
                            <span className="font-bold text-[#0d3356] text-base">{sig.cluster_count}</span> patents
                            {recentCount > 0 && <span className="text-gray-500"> ({recentCount} since 2022)</span>}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed mb-2">{sig.description}</p>
                        <div className="text-[11px] text-gray-400">Zone: <span className="text-gray-600 font-medium">{sig.zone_name}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Section 4: Player Trends ── */}
        {players.length > 0 && (
          <section className="mb-12 print:mb-8 print:break-before-page">
            <h2 className="text-xl font-bold text-[#0d3356] mb-1">4. Player Trends</h2>
            <p className="text-sm text-gray-500 mb-6">
              Top patent applicants and their filing activity over time.
            </p>

            {/* Trend chart — full width */}
            <div className="mb-6">
              <PlayerTrendChart players={players} topN={6} width={CONTENT_WIDTH} height={380} />
            </div>

            {/* Player detail cards */}
            <div className="grid grid-cols-2 gap-4">
              {players.slice(0, 6).map((player, idx) => (
                <div key={player.name} className="border border-gray-200 rounded-lg p-4 print:break-inside-avoid">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: player.color }} />
                    <h3 className="text-sm font-semibold text-gray-800">{idx + 1}. {player.name}</h3>
                  </div>
                  <div className="text-xs text-gray-600 mb-2">
                    <span className="font-medium text-[#0d3356]">{player.totalPatents}</span> total patents
                  </div>
                  {player.topAreas.length > 0 && (
                    <div>
                      <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1 font-medium">Top Areas</div>
                      <div className="space-y-0.5">
                        {player.topAreas.slice(0, 3).map((ta, i) => (
                          <div key={i} className="text-[10px] text-gray-600 flex justify-between">
                            <span className="truncate mr-2">{ta.label.split(",")[0]}</span>
                            <span className="text-gray-400 flex-shrink-0">{ta.count} patents</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="border-t border-gray-200 pt-4 text-center text-xs text-gray-400 print:mt-8">
          Generated by VALUENEX Radar &middot; {dateStr}
        </div>
      </div>
    </div>
  );
}
