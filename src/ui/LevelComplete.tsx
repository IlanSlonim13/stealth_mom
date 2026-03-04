import type { CSSProperties } from "react";
import { useGameStore } from "../state/gameStore";
import { LEVELS } from "../world/levels";

const CONFETTI_COLORS = ["#FFD700", "#FF6B9D", "#87CEEB", "#98FB98", "#DDA0DD", "#FFA07A"];

export function LevelComplete() {
  const winText = useGameStore((s) => s.winText);
  const levelIdx = useGameStore((s) => s.levelIdx);
  const startLevel = useGameStore((s) => s.startLevel);
  const setScreen = useGameStore((s) => s.setScreen);

  const isLast = levelIdx >= LEVELS.length - 1;

  return (
    <div style={{
      width: "100%", height: "100%",
      background: "radial-gradient(circle, #1A2A10 0%, #0A150A 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "Georgia, serif", color: "#FFF",
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @keyframes confettiFall {
          from { transform:translateY(-20px) rotate(0deg);   opacity:1; }
          to   { transform:translateY(100vh) rotate(720deg); opacity:0; }
        }
        @keyframes scaleIn {
          from { transform:scale(0.5); opacity:0; }
          to   { transform:scale(1);   opacity:1; }
        }
      `}</style>

      {/* Confetti */}
      {Array.from({ length: 30 }, (_, i) => (
        <div key={i} style={{
          position: "absolute", top: -20,
          left: `${(i * 37) % 100}%`,
          width: 8 + (i % 3) * 4,
          height: 8 + (i % 3) * 4,
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          borderRadius: i % 2 === 0 ? "50%" : "2px",
          animation: `confettiFall ${2 + (i % 4) * 0.5}s ease-out ${(i % 5) * 0.1}s forwards`,
        }} />
      ))}

      <div style={{ animation: "scaleIn 0.5s ease-out", textAlign: "center", zIndex: 1, padding: "0 32px" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontSize: 22, fontWeight: 400, margin: "0 0 8px", color: "#98FB98" }}>
          SANCTUARY REACHED!
        </h2>
        <p style={{ fontSize: 12, opacity: 0.6, maxWidth: 300, lineHeight: 1.6, marginBottom: 8, fontStyle: "italic" }}>
          {winText}
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "center" }}>
          {!isLast ? (
            <button onClick={() => startLevel(levelIdx + 1)} style={btnStyle("#64FF64", "rgba(100,255,100,0.15)")}>
              Next Level
            </button>
          ) : (
            <button onClick={() => setScreen("menu")} style={btnStyle("#FFD700", "rgba(255,215,0,0.15)")}>
              You Win! Menu
            </button>
          )}
          <button onClick={() => setScreen("menu")} style={btnStyle("#FFF", "rgba(255,255,255,0.05)")}>
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(color: string, bg: string): CSSProperties {
  return {
    background: bg,
    border: `1px solid ${color}44`,
    borderRadius: 8, padding: "10px 24px",
    color: "#FFF", cursor: "pointer", fontSize: 13,
    fontFamily: "Georgia, serif",
  };
}
