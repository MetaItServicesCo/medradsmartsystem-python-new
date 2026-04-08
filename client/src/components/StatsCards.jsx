import React from "react";

const StatsCards = () => {
  const cards = [
    {
      title: "Service Requests",
      value: "12",
      color: "bg-[#2519B9]",
      path: "M5 18 Q 40 15, 60 12 T 95 5",
      dots: [
        [5, 18],
        [60, 12],
        [95, 5],
      ],
    },
    {
      title: "Completed Request",
      value: "51",
      color: "bg-[#3391E7]",
      path: "M5 12 Q 25 15, 45 18 T 85 8",
      dots: [
        [5, 12],
        [45, 18],
        [85, 8],
      ],
    },
    {
      title: "Schedule PM's",
      value: "6",
      color: "bg-[#F5A623]",
      path: "M5 15 Q 30 15, 50 15",
      dots: [[5, 15]],
    },
    {
      title: "Completed PM's",
      value: "23",
      color: "bg-[#D04444]",
      path: "M5 5 Q 30 25, 50 10 T 95 18",
      dots: [
        [5, 5],
        [50, 10],
        [95, 18],
      ],
    },
    {
      title: "Upcoming PM's",
      value: "260",
      color: "bg-[#F9AB15]",
      path: "M5 18 Q 30 2, 60 8 T 95 15",
      dots: [
        [5, 18],
        [60, 8],
        [95, 15],
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full p-4">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className={`${card.color} text-white p-6 rounded-md shadow-lg flex flex-col justify-between w-full h-44 relative overflow-hidden`}
        >
          {/* Header Section */}
          <div>
            <div className="text-3xl font-bold border-b-2 border-white/30 inline-block mb-1">
              {card.value}
            </div>
            <div className="text-[15px] font-semibold leading-tight">
              {card.title}
            </div>
          </div>

          {/* Curved Line Chart with Dots */}
          <div className="mt-auto h-12 w-full">
            <svg
              viewBox="0 0 100 25"
              preserveAspectRatio="none"
              className="w-full h-full opacity-60"
            >
              {/* The Curve Line */}
              <path
                d={card.path}
                fill="none"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              {/* Markers (Dots) */}
              {card.dots.map((dot, i) => (
                <circle
                  key={i}
                  cx={dot[0]}
                  cy={dot[1]}
                  r="2"
                  fill="white"
                  className="opacity-100"
                />
              ))}
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsCards;
