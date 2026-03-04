import { useGameStore } from "../state/gameStore";
import { LEVELS } from "../world/levels";
import { PALETTES } from "../world/LevelTypes";

export function IntroScreen() {
  const levelIdx = useGameStore((s) => s.levelIdx);
  const level = LEVELS[levelIdx];
  const pal = PALETTES[level.scene];

  return (
    <div style={{
      width: "100%", height: "100%",
      background: pal.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "Georgia, serif", color: "#FFF",
    }}>
      <style>{`
        @keyframes fadeSlide {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0);    }
        }
      `}</style>
      <div style={{ animation: "fadeSlide 0.6s ease-out", textAlign: "center", padding: "0 32px" }}>
        <p style={{ fontSize: 11, letterSpacing: 4, opacity: 0.4, textTransform: "uppercase", margin: "0 0 8px" }}>
          Level {level.id}
        </p>
        <h2 style={{ fontSize: 24, fontWeight: 400, margin: "0 0 12px", fontStyle: "italic" }}>
          {level.name}
        </h2>
        <p style={{ fontSize: 13, opacity: 0.6, maxWidth: 280, lineHeight: 1.6 }}>
          {level.subtitle}
        </p>
      </div>
    </div>
  );
}
