import React from "react";
import { motion } from "framer-motion";

const StatsCards = () => {
  const cards = [
    { title: "Service Requests", value: "7,265", pct: "+11.01%", trend: "up", points: [18, 14, 16, 10, 8, 12, 6], bg: "rgba(230, 241, 253, 1)" },
    { title: "Complete Requests", value: "3,671", pct: "-0.03%", trend: "down", points: [8, 12, 10, 14, 13, 15, 14], bg: "rgba(237, 238, 252, 1)" },
    { title: "Schedule PM's", value: "156", pct: "+15.03%", trend: "up", points: [20, 16, 18, 12, 10, 8, 5], bg: "rgba(230, 241, 253, 1)" },
    { title: "Complete PM's", value: "2,318", pct: "+6.08%", trend: "up", points: [16, 14, 12, 10, 12, 8, 7], bg: "rgba(237, 238, 252, 1)" },
  ];

  const sparklinePath = (pts, w = 64, h = 28) => {
    const max = Math.max(...pts), min = Math.min(...pts);
    const range = max - min || 1;
    const xs = pts.map((_, i) => i * (w / (pts.length - 1)));
    const ys = pts.map((p) => h - ((p - min) / range) * (h - 4) - 2);
    let d = `M${xs[0]},${ys[0]}`;
    for (let i = 1; i < xs.length; i++) {
      const cpx = (xs[i - 1] + xs[i]) / 2;
      d += ` C${cpx},${ys[i - 1]} ${cpx},${ys[i]} ${xs[i]},${ys[i]}`;
    }
    return { d, lastX: xs[xs.length - 1], lastY: ys[ys.length - 1] };
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
      {cards.map((card, idx) => {
        const isUp = card.trend === "up";
        const color = isUp ? "#22C55E" : "#EF4444";
        const { d, lastX, lastY } = sparklinePath(card.points);

        return (
          <motion.div
            key={idx}
            // Scroll Animation Settings
            initial={{ opacity: 0, scale: 0.9, y: 80 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }} // Jab screen mein aaye
            viewport={{ once: false, amount: 0.2 }} // Ek baar animate ho, 20% dikhne par
            transition={{ 
              duration: 1.1, 
              delay: idx * 0.1, 
              ease: "easeOut" 
            }}
            whileHover={{ y: -5, transition: { duration: 0.2 } }} // Hover effect
            className="rounded-2xl p-5 flex flex-col gap-2 shadow-sm"
            style={{ background: card.bg }}
          >
            <p className="text-sm text-gray-400 font-normal">{card.title}</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-gray-900 leading-none">
                  {card.value}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs font-medium" style={{ color }}>
                    {card.pct}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 12 L12 4 M7 4 H12 V9"
                      stroke={color}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      transform={isUp ? "rotate(-40,8,8)" : "rotate(40,8,8)"}
                    />
                  </svg>
                </div>
              </div>

              {/* Animated Sparkline */}
              <svg width="64" height="28" viewBox="0 0 64 28" fill="none">
                <motion.path
                  d={d}
                  stroke={color}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }} // Viewport mein aate hi draw ho
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, delay: idx * 0.1 + 0.4 }}
                />
                <motion.circle 
                  cx={lastX} cy={lastY} r="2.5" fill={color} 
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 + 1.4 }}
                />
              </svg>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default StatsCards;