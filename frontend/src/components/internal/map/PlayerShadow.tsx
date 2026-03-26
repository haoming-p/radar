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
  // Optional: radius scale multiplier (default 0.5, use larger for all-time view)
  radiusScale?: number;
  // Optional: max display radius in px
  maxRadius?: number;
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
  radiusScale = 0.5,
  maxRadius = 150,
}: PlayerShadowProps) {
  // Convert center to SVG coordinates
  const cx = xScale(center.x);
  const cy = yScale(center.y);

  // Convert radius to SVG coordinates (use x scale for both to keep circle)
  const svgRadius = Math.abs(xScale(center.x + radius) - xScale(center.x)) * radiusScale;

  // Min 30px, Max configurable
  const displayRadius = Math.min(Math.max(svgRadius, 30), maxRadius);

  return (
    <g className="player-shadow">
      {/* Outer glow */}
      <circle
        cx={cx}
        cy={cy}
        r={displayRadius * 1.4}
        fill={color}
        opacity={opacity * 0.4}
      />

      {/* Main shadow */}
      <circle
        cx={cx}
        cy={cy}
        r={displayRadius}
        fill={color}
        opacity={opacity}
        stroke={color}
        strokeWidth={2.5}
        strokeOpacity={0.8}
      />

      {/* Label */}
      {showLabel && (
        <text
          x={cx}
          y={cy - displayRadius - 10}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill={color}
          style={{ textShadow: "0 0 4px white, 0 0 4px white, 0 0 6px white" }}
        >
          {name}
        </text>
      )}
    </g>
  );
}