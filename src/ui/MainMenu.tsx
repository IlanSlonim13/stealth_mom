import { useGameStore } from "../state/gameStore";
import { LEVELS } from "../world/levels";

const NPC_ICONS: Record<string, string> = {
  dog: "🐕",
  toddler: "👶",
  husband: "🧔",
};

export function MainMenu() {
  const startLevel = useGameStore((s) => s.startLevel);

  return (
    <div style={{
      width: "100%", height: "100%",
      background: "linear-gradient(160deg, #2A1F14 0%, #1A0F2E 40%, #0D2818 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "Georgia, serif", color: "#FFF", overflow: "hidden", position: "relative",
    }}>
      <style>{`
        @keyframes floatUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        .level-btn:hover { background: rgba(255,255,255,0.12) !important; transform: translateX(4px) !important; }
      `}</style>

      <div style={{ animation: "floatUp 0.8s ease-out", textAlign: "center", zIndex: 1, padding: "0 24px", width: "100%", maxWidth: 380 }}>
        <div style={{ fontSize: 48, marginBottom: 4 }}>🤫</div>
        <h1 style={{ fontSize: 28, fontWeight: 400, letterSpacing: 3, margin: "0 0 4px", fontStyle: "italic" }}>
          Stealth Mom
        </h1>
        <p style={{ fontSize: 11, letterSpacing: 4, opacity: 0.5, margin: "0 0 40px", textTransform: "uppercase" }}>
          Operation Peace &amp; Quiet
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LEVELS.map((lv, i) => (
            <button
              key={i}
              className="level-btn"
              onClick={() => startLevel(i)}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: "12px 24px",
                color: "#FFF", cursor: "pointer",
                fontSize: 13, letterSpacing: 1,
                transition: "all 0.3s",
                display: "flex", alignItems: "center", gap: 10,
                fontFamily: "Georgia, serif", width: "100%",
              }}
            >
              <span style={{ opacity: 0.3, fontWeight: 300, fontFamily: "monospace", minWidth: 20 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{lv.name}</span>
              <span style={{ marginLeft: "auto", opacity: 0.4, fontSize: 11 }}>
                {lv.npcs.map((n) => NPC_ICONS[n.type] ?? "").join("")}
                {lv.traps.length > 0 ? "💣" : ""}
                {lv.decoys > 0 ? "🔑" : ""}
              </span>
            </button>
          ))}
        </div>

        <p style={{ marginTop: 32, fontSize: 10, opacity: 0.25, letterSpacing: 2 }}>
          TAP TILES TO SNEAK • AVOID DETECTION • REACH THE GOAL
        </p>
      </div>
    </div>
  );
}
