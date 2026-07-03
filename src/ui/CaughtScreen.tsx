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
      background: "linear-gradient(170deg, #8E4A5E 0%, #5E2E48 60%, #341A30 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "Georgia, serif", color: "#FFF5EC",
    }}>
      <style>{`
        @keyframes smShake {
          0%,100% { transform:translateX(0); }
          20% { transform:translateX(-9px) rotate(-1deg); }
          40% { transform:translateX(8px) rotate(1deg); }
          60% { transform:translateX(-6px); }
          80% { transform:translateX(4px); }
        }
        @keyframes smFadeUp {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
      <div style={{ animation: "smShake 0.5s ease-out", textAlign: "center", padding: "0 32px" }}>
        <div style={{ fontSize: 60, marginBottom: 14 }}>😱</div>
        <h2 style={{
          fontSize: 24, fontWeight: 400, margin: "0 0 14px",
          letterSpacing: 4, color: "#FFB4A8",
        }}>
          BUSTED!
        </h2>
        <p style={{
          fontSize: 15, opacity: 0.85, maxWidth: 300, lineHeight: 1.6,
          margin: "0 auto 34px", fontStyle: "italic",
        }}>
          “{caughtLine}”
        </p>
        <div style={{
          display: "flex", gap: 12, justifyContent: "center",
          animation: "smFadeUp 0.5s ease-out 0.25s both",
        }}>
          <button onClick={() => startLevel(levelIdx)} style={btn("rgba(255,252,246,0.94)", "#4A2440")}>
            ↺  Try Again
          </button>
          <button onClick={() => setScreen("menu")} style={btn("transparent", "#FFF5EC", true)}>
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}

function btn(bg: string, color: string, outline = false): CSSProperties {
  return {
    background: bg,
    border: outline ? "1px solid rgba(255,245,236,0.4)" : "none",
    borderRadius: 22, padding: "12px 30px",
    color, cursor: "pointer", fontSize: 14,
    fontFamily: "Georgia, serif", letterSpacing: 1,
    boxShadow: outline ? "none" : "0 6px 20px rgba(20,8,24,0.3)",
  };
}
