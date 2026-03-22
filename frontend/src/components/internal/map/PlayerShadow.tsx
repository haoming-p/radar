import { ScaleLinear } from "d3-scale";

interface PlayerShadowProps {
  name: string;
  color: string;
  // Center position in data coordinates
  center: { x: number; y: number };
  // Radius in data coordinates (standard deviation)
  radius: number;
  // Scales to convert to SVG coordinates
  xScale: ScaleLinear<number, number>;
  yScale: ScaleLinear<number, number>;
  // Optional: show label
  showLabel?: boolean;
  // Optional: opacity
  opacity?: number;
}

export default function PlayerShadow({
  name,
  color,
  center,
  radius,
  xScale,
  yScale,
  showLabel = true,
  opacity = 0.25,
}: PlayerShadowProps) {
  // Convert center to SVG coordinates
  const cx = xScale(center.x);
  const cy = yScale(center.y);

  // Convert radius to SVG coordinates (use x scale for both to keep circle)
  // Scale down by 0.5 and cap at max 150px to prevent covering entire map
  const svgRadius = Math.abs(xScale(center.x + radius) - xScale(center.x)) * 0.5;
  
  // Min 30px, Max 150px
  const displayRadius = Math.min(Math.max(svgRadius, 30), 150);

  return (
    <g className="player-shadow">
      {/* Outer glow */}
      <circle
        cx={cx}
        cy={cy}
        r={displayRadius * 1.5}
        fill={color}
        opacity={opacity * 0.3}
      />
      
      {/* Main shadow */}
      <circle
        cx={cx}
        cy={cy}
        r={displayRadius}
        fill={color}
        opacity={opacity}
        stroke={color}
        strokeWidth={2}
        strokeOpacity={0.6}
      />

      {/* Center dot */}
      <circle
        cx={cx}
        cy={cy}
        r={6}
        fill={color}
        stroke="white"
        strokeWidth={2}
      />

      {/* Label */}
      {showLabel && (
        <text
          x={cx}
          y={cy - displayRadius - 10}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill={color}
          style={{ textShadow: "0 0 3px white, 0 0 3px white" }}
        >
          {name}
        </text>
      )}
    </g>
  );
}