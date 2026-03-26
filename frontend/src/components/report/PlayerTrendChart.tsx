import { useMemo } from "react";
import { scaleLinear, scalePoint } from "d3-scale";
import { PlayerInfo } from "../internal/sidebar/PlayersSection";

interface PlayerTrendChartProps {
  players: PlayerInfo[];
  topN?: number;
  width?: number;
  height?: number;
}

export default function PlayerTrendChart({
  players,
  topN = 6,
  width = 700,
  height = 360,
}: PlayerTrendChartProps) {
  const topPlayers = useMemo(() => {
    return players
      .sort((a, b) => b.totalPatents - a.totalPatents)
      .slice(0, topN);
  }, [players, topN]);

  // Collect all years and find max count
  const { years, maxCount } = useMemo(() => {
    const yearSet = new Set<number>();
    let max = 0;
    for (const p of topPlayers) {
      for (const yd of p.yearlyData) {
        yearSet.add(yd.year);
        if (yd.count > max) max = yd.count;
      }
    }
    const sorted = [...yearSet].sort((a, b) => a - b);
    return { years: sorted, maxCount: max };
  }, [topPlayers]);

  if (years.length === 0 || topPlayers.length === 0) return null;

  const margin = { top: 30, right: 200, bottom: 40, left: 50 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const xScale = scalePoint<number>()
    .domain(years)
    .range([0, innerW])
    .padding(0.1);

  const yScale = scaleLinear()
    .domain([0, maxCount * 1.1])
    .range([innerH, 0]);

  // Y axis ticks
  const yTicks = yScale.ticks(5).filter((t) => Number.isInteger(t));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="bg-white rounded-lg border border-gray-200">
      <g transform={`translate(${margin.left}, ${margin.top})`}>
        {/* Grid lines */}
        {yTicks.map((tick) => (
          <line
            key={tick}
            x1={0}
            x2={innerW}
            y1={yScale(tick)}
            y2={yScale(tick)}
            stroke="rgba(200,200,200,0.5)"
            strokeDasharray="3,3"
          />
        ))}

        {/* Y axis labels */}
        {yTicks.map((tick) => (
          <text key={tick} x={-10} y={yScale(tick)} textAnchor="end" dominantBaseline="central" fontSize={11} fill="#6b7280" fontFamily="system-ui, sans-serif">
            {tick}
          </text>
        ))}

        {/* X axis labels */}
        {years.map((year) => (
          <text key={year} x={xScale(year)!} y={innerH + 25} textAnchor="middle" fontSize={11} fill="#6b7280" fontFamily="system-ui, sans-serif">
            {year}
          </text>
        ))}

        {/* Lines + dots for each player */}
        {topPlayers.map((player) => {
          const dataPoints = years.map((year) => {
            const yd = player.yearlyData.find((d) => d.year === year);
            return { year, count: yd?.count ?? 0, x: xScale(year)!, y: yScale(yd?.count ?? 0) };
          });

          // Build line path
          const linePath = dataPoints
            .map((dp, i) => `${i === 0 ? "M" : "L"} ${dp.x} ${dp.y}`)
            .join(" ");

          return (
            <g key={player.name}>
              <path
                d={linePath}
                fill="none"
                stroke={player.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {dataPoints.map((dp) => (
                <circle
                  key={dp.year}
                  cx={dp.x}
                  cy={dp.y}
                  r={3.5}
                  fill="white"
                  stroke={player.color}
                  strokeWidth={2}
                />
              ))}
            </g>
          );
        })}

        {/* Legend on the right */}
        {topPlayers.map((player, i) => {
          const y = i * 24;
          return (
            <g key={player.name} transform={`translate(${innerW + 20}, ${y})`}>
              <line x1={0} y1={8} x2={18} y2={8} stroke={player.color} strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={9} cy={8} r={3} fill="white" stroke={player.color} strokeWidth={2} />
              <text x={24} y={8} dominantBaseline="central" fontSize={10} fill="#374151" fontFamily="system-ui, sans-serif">
                {player.name.length > 22 ? player.name.slice(0, 22) + "..." : player.name} ({player.totalPatents})
              </text>
            </g>
          );
        })}

        {/* Y axis title */}
        <text x={-margin.left + 10} y={-15} fontSize={11} fill="#6b7280" fontFamily="system-ui, sans-serif" fontWeight={500}>
          Patents / Year
        </text>
      </g>
    </svg>
  );
}
