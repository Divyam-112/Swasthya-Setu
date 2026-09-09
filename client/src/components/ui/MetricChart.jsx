import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "../../utils/format.js";

export default function MetricChart({ readings = [], type }) {
  const data = [...readings]
    .sort((a, b) => new Date(a.measuredAt) - new Date(b.measuredAt))
    .map((reading) => ({
      time: formatDate(reading.measuredAt),
      value: Number(reading.value),
      secondary: reading.secondaryValue ? Number(reading.secondaryValue) : null,
    }));

  if (!data.length) {
    return <p className="muted">No health readings available yet.</p>;
  }

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid stroke="#e4eee7" />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#0d5c45"
            strokeWidth={2}
            name={type === "blood_pressure" ? "Systolic" : "Reading"}
          />
          {type === "blood_pressure" ? (
            <Line
              type="monotone"
              dataKey="secondary"
              stroke="#1e3d4a"
              strokeWidth={2}
              name="Diastolic"
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
