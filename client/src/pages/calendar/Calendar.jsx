import React, { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const styles = {
  wrapper: {
    maxWidth: "420px",
    margin: "1rem auto",
    fontFamily: "sans-serif",
    background: "#fff",
    border: "0.5px solid #e0e0e0",
    borderRadius: "12px",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "1rem 1.25rem",
    borderBottom: "0.5px solid #e0e0e0",
  },
  monthLabel: {
    fontSize: "16px",
    fontWeight: "500",
    margin: 0,
    color: "#111",
  },
  navBtn: {
    background: "none",
    border: "0.5px solid #ccc",
    borderRadius: "8px",
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: "16px",
    color: "#555",
  },
  weekdaysRow: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    padding: "0.75rem 1rem 0.25rem",
  },
  weekday: {
    textAlign: "center",
    fontSize: "12px",
    fontWeight: "500",
    color: "#888",
    padding: "4px 0",
  },
  daysGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    padding: "0.25rem 1rem 1rem",
    gap: "2px",
  },
  dayBase: {
    textAlign: "center",
    padding: "8px 4px",
    fontSize: "14px",
    borderRadius: "8px",
    cursor: "pointer",
    minHeight: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    position: "relative",
    color: "#111",
    userSelect: "none",
  },
  dayOtherMonth: {
    color: "#bbb",
    cursor: "default",
  },
  dayToday: {
    background: "#E6F1FB",
    color: "#0C447C",
    fontWeight: "500",
  },
  daySelected: {
    background: "#185FA5",
    color: "#E6F1FB",
    fontWeight: "500",
  },
  eventDot: {
    width: "4px",
    height: "4px",
    borderRadius: "50%",
    background: "#E24B4A",
    position: "absolute",
    bottom: "3px",
    left: "50%",
    transform: "translateX(-50%)",
  },
  eventDotOnSelected: {
    background: "#85B7EB",
  },
  footer: {
    borderTop: "0.5px solid #e0e0e0",
    padding: "0.75rem 1.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  todayBtn: {
    fontSize: "13px",
    padding: "5px 12px",
    borderRadius: "8px",
    border: "0.5px solid #ccc",
    background: "none",
    cursor: "pointer",
    color: "#555",
  },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "#888",
  },
  legendDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#E24B4A",
    display: "inline-block",
  },
  selectedInfo: {
    padding: "0.75rem 1.25rem",
    borderTop: "0.5px solid #e0e0e0",
    fontSize: "13px",
    color: "#185FA5",
    fontWeight: "500",
  },
};

const today = new Date();

// Sample events: key = "YYYY-M-D"
const defaultEvents = {
  [`${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`]: "Today",
  [`${today.getFullYear()}-${today.getMonth()}-${today.getDate() + 3}`]: "Meeting",
  [`${today.getFullYear()}-${today.getMonth()}-${today.getDate() + 7}`]: "Deadline",
};

const Calendar = () => {
  const [cur, setCur] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(null);
  const [events] = useState(defaultEvents);

  const prevMonth = () => {
    setCur((c) =>
      c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }
    );
  };

  const nextMonth = () => {
    setCur((c) =>
      c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }
    );
  };

  const goToday = () => {
    setCur({ y: today.getFullYear(), m: today.getMonth() });
    setSelected(null);
  };

  const firstDay = new Date(cur.y, cur.m, 1).getDay();
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const prevMonthDays = new Date(cur.y, cur.m, 0).getDate();

  const isToday = (d) =>
    d === today.getDate() &&
    cur.m === today.getMonth() &&
    cur.y === today.getFullYear();

  const isSelected = (d) =>
    selected &&
    selected.d === d &&
    selected.m === cur.m &&
    selected.y === cur.y;

  const eventKey = (d) => `${cur.y}-${cur.m}-${d}`;
  const hasEvent = (d) => !!events[eventKey(d)];

  const getDayStyle = (d, isOther = false) => {
    let s = { ...styles.dayBase };
    if (isOther) return { ...s, ...styles.dayOtherMonth };
    if (isSelected(d)) return { ...s, ...styles.daySelected };
    if (isToday(d)) return { ...s, ...styles.dayToday };
    return s;
  };

  const totalCells = firstDay + daysInMonth;
  const trailingDays = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.navBtn} onClick={prevMonth}>&#8249;</button>
        <p style={styles.monthLabel}>{MONTHS[cur.m]} {cur.y}</p>
        <button style={styles.navBtn} onClick={nextMonth}>&#8250;</button>
      </div>

      {/* Weekday labels */}
      <div style={styles.weekdaysRow}>
        {WEEKDAYS.map((d) => (
          <div key={d} style={styles.weekday}>{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div style={styles.daysGrid}>
        {/* Leading empty days from prev month */}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`prev-${i}`} style={{ ...styles.dayBase, ...styles.dayOtherMonth }}>
            {prevMonthDays - firstDay + 1 + i}
          </div>
        ))}

        {/* Current month days */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const sel = isSelected(d);
          return (
            <div
              key={d}
              style={getDayStyle(d)}
              onClick={() => setSelected({ d, m: cur.m, y: cur.y })}
            >
              {d}
              {hasEvent(d) && (
                <span
                  style={{
                    ...styles.eventDot,
                    ...(sel ? styles.eventDotOnSelected : {}),
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Trailing days from next month */}
        {Array.from({ length: trailingDays }, (_, i) => (
          <div key={`next-${i}`} style={{ ...styles.dayBase, ...styles.dayOtherMonth }}>
            {i + 1}
          </div>
        ))}
      </div>

      {/* Selected date info */}
      {selected && (
        <div style={styles.selectedInfo}>
          Selected: {MONTHS[selected.m]} {selected.d}, {selected.y}
          {events[`${selected.y}-${selected.m}-${selected.d}`]
            ? ` — ${events[`${selected.y}-${selected.m}-${selected.d}`]}`
            : ""}
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <button style={styles.todayBtn} onClick={goToday}>Today</button>
        <div style={styles.legend}>
          <span style={styles.legendDot} />
          <span>Event</span>
        </div>
      </div>
    </div>
  );
};

export default Calendar;