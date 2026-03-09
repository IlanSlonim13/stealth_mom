import type { CSSProperties } from "react";
import { useGameStore } from "../state/gameStore";

export function CaughtScreen() {
  const caughtLine = useGameStore((s) => s.caughtLine);
  const levelIdx = useGameStore((s) => s.levelIdx);
  const startLevel = useGameStore((s) => s.startLevel);
  const setScreen = useGameStore((s) => s.setScreen);

  return (
    <div style={{
      width: "100%", height: "100%",
      background: "radial-gradient(circle, #3A1010 0%, #1A0505 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "Georgia, serif", color: "#FFF",
      animation: "caughtFadeIn 0.5s ease-out both",
    }}>
      <style>{`
        @keyframes caughtFadeIn {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes shake {
          0%,100% { transform:translateX(0);  }
          25%      { transform:translateX(-8px); }
          75%      { transform:translateX(8px);  }
        }
      `}</style>
      <div style={{ animation: "shake 0.4s ease-out 0.3s both", textAlign: "center", padding: "0 32px" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>😱</div>
        <h2 style={{ fontSize: 22, fontWeight: 400, margin: "0 0 12px", color: "#FF6B6B" }}>
          BUSTED!
        </h2>
        <p style={{ fontSize: 14, opacity: 0.7, maxWidth: 300, lineHeight: 1.6, marginBottom: 32, fontStyle: "italic" }}>
          "{caughtLine}"
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={() => startLevel(levelIdx)}
            style={btnStyle("#FF6464", "rgba(255,100,100,0.15)")}
          >
            Try Again
          </button>
          <button
            onClick={() => setScreen("menu")}
            style={btnStyle("#FFF", "rgba(255,255,255,0.05)")}
          >
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
