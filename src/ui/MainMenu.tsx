import { useGameStore } from "../state/gameStore";
import { useProgressStore } from "../state/progressStore";
import { LEVELS } from "../world/levels";

const NPC_ICONS: Record<string, string> = {
  dog: "🐕", toddler: "👶", husband: "🧔", cat: "🐈",
};

export function MainMenu() {
  const startLevel = useGameStore((s) => s.startLevel);
  const stars = useProgressStore((s) => s.stars);
  const isUnlocked = useProgressStore((s) => s.isUnlocked);
  const totalStars = Object.values(stars).reduce((a, b) => a + b, 0);

  const firstIncomplete = LEVELS.findIndex((lv) => !(lv.id in stars));
  const continueIdx = firstIncomplete === -1 ? 0 : firstIncomplete;

  return (
    <div style={{
      width: "100%", height: "100%", overflow: "hidden auto", position: "relative",
      background: "linear-gradient(170deg, #F7CDA8 0%, #E29AA6 42%, #8E6B9E 78%, #5E4A78 100%)",
      fontFamily: "Georgia, serif",
    }}>
      <style>{`
        @keyframes smMenuIn {
          from { opacity:0; transform:translateY(24px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes smSunPulse {
          0%,100% { transform:scale(1); opacity:0.85; }
          50%     { transform:scale(1.04); opacity:1; }
        }
        .sm-level:not(.locked):hover { transform:translateY(-3px); box-shadow:0 10px 26px rgba(50,25,60,0.28); }
      `}</style>

      {/* decorative sun + arch, Monument Valley style */}
      <div style={{
        position: "absolute", top: 46, left: "50%", transform: "translateX(-50%)",
        width: 130, height: 130, borderRadius: "50%",
        background: "radial-gradient(circle, #FFEED2 0%, #FFD9A8 55%, rgba(255,217,168,0) 72%)",
        animation: "smSunPulse 5s ease-in-out infinite", pointerEvents: "none",
      }} />

      <div style={{
        maxWidth: 420, margin: "0 auto", padding: "72px 22px 48px",
        animation: "smMenuIn 0.8s ease-out", position: "relative",
      }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ fontSize: 44, marginBottom: 2 }}>🤫</div>
          <h1 style={{
            margin: "0 0 4px", fontSize: 30, fontWeight: 400, fontStyle: "italic",
            letterSpacing: 3, color: "#4A2440",
          }}>
            Stealth Mom
          </h1>
          <p style={{
            margin: 0, fontSize: 10, letterSpacing: 5, textTransform: "uppercase",
            color: "#4A2440", opacity: 0.55,
          }}>
            Operation Peace &amp; Quiet
          </p>
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "#4A2440", opacity: 0.75 }}>
            ★ {totalStars} / {LEVELS.length * 3}
          </p>
        </div>

        {LEVELS[continueIdx] && isUnlocked(LEVELS[continueIdx].id) && (
          <button
            onClick={() => startLevel(continueIdx)}
            style={{
              display: "block", width: "100%", marginBottom: 22,
              background: "rgba(255,252,246,0.94)", border: "none", borderRadius: 22,
              padding: "15px 20px", cursor: "pointer",
              fontFamily: "Georgia, serif", fontSize: 15, color: "#4A2440",
              letterSpacing: 1, boxShadow: "0 8px 26px rgba(50,25,60,0.25)",
            }}
          >
            {continueIdx === 0 && totalStars === 0 ? "▶  Begin" : "▶  Continue"} — Level {LEVELS[continueIdx].id}: {LEVELS[continueIdx].name}
          </button>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {LEVELS.map((lv, i) => {
            const unlocked = isUnlocked(lv.id);
            const lvStars = stars[lv.id];
            return (
              <button
                key={lv.id}
                className={`sm-level${unlocked ? "" : " locked"}`}
                onClick={() => unlocked && startLevel(i)}
                title={lv.name}
                style={{
                  aspectRatio: "1", borderRadius: 18, border: "none",
                  cursor: unlocked ? "pointer" : "default",
                  background: unlocked
                    ? "rgba(255,252,246,0.88)"
                    : "rgba(255,252,246,0.28)",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 3,
                  fontFamily: "Georgia, serif",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  boxShadow: unlocked ? "0 4px 14px rgba(50,25,60,0.16)" : "none",
                  animation: `smMenuIn 0.5s ease-out ${0.05 * i}s both`,
                }}
              >
                {unlocked ? (
                  <>
                    <span style={{ fontSize: 19, color: "#4A2440" }}>{lv.id}</span>
                    <span style={{ fontSize: 9, letterSpacing: 0.4, color: "#4A2440", opacity: 0.7, padding: "0 4px", lineHeight: 1.2 }}>
                      {lv.name}
                    </span>
                    <span style={{ fontSize: 10, letterSpacing: 2, color: "#D9973E", minHeight: 12 }}>
                      {lvStars !== undefined
                        ? "★".repeat(lvStars) + "☆".repeat(3 - lvStars)
                        : lv.npcs.map((n) => NPC_ICONS[n.type]).join("") || "🧸"}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 17, opacity: 0.55 }}>🔒</span>
                )}
              </button>
            );
          })}
        </div>

        <p style={{
          marginTop: 30, textAlign: "center", fontSize: 10, letterSpacing: 2.5,
          color: "#3A2038", opacity: 0.5,
        }}>
          SNEAK · COLLECT ★ · REACH YOUR ME-TIME
        </p>
      </div>
    </div>
  );
}
