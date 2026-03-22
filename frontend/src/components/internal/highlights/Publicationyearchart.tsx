import { useMemo, useRef, useState, useEffect } from "react";
import { scaleLinear, scaleBand } from "d3-scale";
import { line, curveMonotoneX } from "d3-shape";
import { max } from "d3-array";
import { TrendingUp } from "lucide-react";

// ============ TYPES ============
interface Patent {
  x: number;
  y: number;
  area_id: number;
  topic_id: number;
  title: string;
  year?: number;
}

interface PublicationYearChartProps {
  patents: Patent[];
  yearRange: [number, number];
}

export default function PublicationYearChart({
  patents,
  yearRange,
}: PublicationYearChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);

  // Responsive width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // Count patents by year
  const chartData = useMemo(() => {
    const countsByYear = new Map<number, number>();
    
    // Initialize all years in range
    for (let year = yearRange[0]; year <= yearRange[1]; year++) {
      countsByYear.set(year, 0);
    }
    
    // Count patents
    patents.forEach((p) => {
      if (p.year && p.year >= yearRange[0] && p.year <= yearRange[1]) {
        countsByYear.set(p.year, (countsByYear.get(p.year) || 0) + 1);
      }
    });
    
    // Convert to array
    return Array.from(countsByYear.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);
  }, [patents, yearRange]);

  // Chart dimensions
  const height = 220;
  const margin = { top: 25, right: 20, bottom: 20, left: 45 };
  const innerWidth = containerWidth - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Scales
  const xScale = useMemo(() => {
    return scaleBand<number>()
      .domain(chartData.map((d) => d.year))
      .range([0, innerWidth])
      .padding(0.1);
  }, [chartData, innerWidth]);

  const yScale = useMemo(() => {
    const maxCount = max(chartData, (d) => d.count) || 0;
    return scaleLinear()
      .domain([0, maxCount * 1.15]) // Extra space for labels on top
      .range([innerHeight, 0]);
  }, [chartData, innerHeight]);

  // Line generator
  const lineGenerator = useMemo(() => {
    return line<{ year: number; count: number }>()
      .x((d) => (xScale(d.year) || 0) + xScale.bandwidth() / 2)
      .y((d) => yScale(d.count))
      .curve(curveMonotoneX);
  }, [xScale, yScale]);

  const linePath = lineGenerator(chartData) || "";

  // Area under the line
  const areaPath = useMemo(() => {
    if (chartData.length === 0) return "";
    const points = chartData.map((d) => ({
      x: (xScale(d.year) || 0) + xScale.bandwidth() / 2,
      y: yScale(d.count),
    }));
    
    let path = `M ${points[0].x} ${innerHeight}`;
    path += ` L ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    
    path += ` L ${points[points.length - 1].x} ${innerHeight}`;
    path += " Z";
    
    return path;
  }, [chartData, xScale, yScale, innerHeight]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-blue-500" />
        <h3 className="font-semibold text-gray-900">Publication Year</h3>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="w-full">
        <svg width={containerWidth} height={height} className="overflow-visible">
          <g transform={`translate(${margin.left}, ${margin.top})`}>
            {/* Grid lines */}
            {yScale.ticks(5).map((tick) => (
              <g key={tick}>
                <line
                  x1={0}
                  x2={innerWidth}
                  y1={yScale(tick)}
                  y2={yScale(tick)}
                  stroke="#E5E7EB"
                  strokeDasharray="2,2"
                />
                <text
                  x={-8}
                  y={yScale(tick)}
                  textAnchor="end"
                  alignmentBaseline="middle"
                  className="text-xs fill-gray-400"
                >
                  {tick}
                </text>
              </g>
            ))}

            {/* Area fill */}
            <path d={areaPath} fill="rgba(59, 130, 246, 0.1)" />

            {/* Line */}
            <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth={2} />

            {/* Data points with numbers */}
            {chartData.map((d) => {
              const x = (xScale(d.year) || 0) + xScale.bandwidth() / 2;
              const y = yScale(d.count);
              return (
                <g key={d.year}>
                  {/* Point */}
                  <circle cx={x} cy={y} r={4} fill="#3B82F6" />
                  {/* Number above */}
                  <text
                    x={x}
                    y={y - 10}
                    textAnchor="middle"
                    className="text-xs fill-gray-600"
                  >
                    {d.count}
                  </text>
                </g>
              );
            })}

            {/* X axis labels */}
            {chartData.map((d, i) => {
              // Show every other year if too many
              if (chartData.length > 12 && i % 2 !== 0) return null;
              return (
                <text
                  key={d.year}
                  x={(xScale(d.year) || 0) + xScale.bandwidth() / 2}
                  y={innerHeight + 18}
                  textAnchor="middle"
                  className="text-xs fill-gray-500"
                >
                  {d.year}
                </text>
              );
            })}

            {/* X axis line */}
            <line
              x1={0}
              x2={innerWidth}
              y1={innerHeight}
              y2={innerHeight}
              stroke="#E5E7EB"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}