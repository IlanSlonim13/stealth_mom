import type { CSSProperties, RefObject } from "react";
import type { Game } from "../engine/Game";
import { useGameStore } from "../state/gameStore";
import { LEVELS } from "../world/levels";
import { getTheme } from "../world/themes";

export function HUD({ gameRef }: { gameRef: RefObject<Game | null> }) {
  const levelIdx = useGameStore((s) => s.levelIdx);
  const tokens = useGameStore((s) => s.tokens);
  const heldItem = useGameStore((s) => s.heldItem);
  const throwMode = useGameStore((s) => s.throwMode);
  const nearPickup = useGameStore((s) => s.nearPickup);
  const setScreen = useGameStore((s) => s.setScreen);
  const startLevel = useGameStore((s) => s.startLevel);
  const setHeldItem = useGameStore((s) => s.setHeldItem);
  const setThrowMode = useGameStore((s) => s.setThrowMode);

  const level = LEVELS[levelIdx];
  const theme = getTheme(level.theme);
  const heldDef = level.decoyItems?.find((d) => d.itemName === heldItem);
  const pickupDef = level.decoyItems?.find((d) => d.itemName === nearPickup);

  const chip: CSSProperties = {
    background: "rgba(30,18,40,0.32)",
    border: "none", borderRadius: 18,
    color: "#FFF9F0", padding: "8px 16px",
    fontSize: 12, letterSpacing: 2, cursor: "pointer",
    backdropFilter: "blur(10px)", fontFamily: "Georgia, serif",
  };

  return (
    <>
      <style>{`
        @keyframes smPulse {
          0%,100% { transform:scale(1); }
          50%     { transform:scale(1.06); }
        }
        @keyframes smStarPop {
          0%   { opacity:0; transform:scale(0.2) rotate(-30deg); }
          70%  { opacity:1; transform:scale(1.35) rotate(6deg); }
          100% { opacity:1; transform:scale(1) rotate(0); }
        }
      `}</style>

      {/* top bar */}
      <div style={{
        position: "absolute", top: 14, left: 0, right: 0, zIndex: 3,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 16px", pointerEvents: "none",
      }}>
        <button style={{ ...chip, pointerEvents: "auto" }} onClick={() => setScreen("menu")}>
          ‹ MENU
        </button>

        {/* token pips */}
        <div style={{
          ...chip, cursor: "default", display: "flex", gap: 7, alignItems: "center",
          padding: "8px 14px",
        }}>
          {[0, 1, 2].map((i) => (
            <span key={`${i}-${i < tokens}`} style={{
              fontSize: 14,
              display: "inline-block",
              color: i < tokens ? "#FFD678" : "rgba(255,255,255,0.3)",
              filter: i < tokens ? "drop-shadow(0 0 5px rgba(255,214,120,0.9))" : "none",
              animation: i < tokens ? "smStarPop 0.45s ease-out" : undefined,
            }}>
              ★
            </span>
          ))}
        </div>

        <button style={{ ...chip, pointerEvents: "auto" }} onClick={() => startLevel(levelIdx)}>
          ↺ RETRY
        </button>
      </div>

      {/* bottom action area */}
      <div style={{
        position: "absolute", bottom: 22, left: 0, right: 0, zIndex: 3,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        pointerEvents: "none",
      }}>
        {nearPickup && !heldItem && pickupDef && (
          <button
            onClick={() => {
              gameRef.current?.pickUpItem(nearPickup);
              setHeldItem(nearPickup);
            }}
            style={{
              ...chip, pointerEvents: "auto",
              background: "rgba(255,214,120,0.28)",
              border: "1px solid rgba(255,214,120,0.8)",
              color: "#FFF3D0", fontSize: 13, padding: "11px 26px",
              animation: "smPulse 1.1s ease-in-out infinite",
            }}
          >
            {pickupDef.itemEmoji}  GRAB {pickupDef.itemName.toUpperCase()}
          </button>
        )}

        {heldItem && heldDef && !throwMode && (
          <button
            onClick={() => setThrowMode(true)}
            style={{
              ...chip, pointerEvents: "auto",
              background: `${theme.accent}55`,
              border: "1px solid rgba(255,255,255,0.4)",
              fontSize: 13, padding: "11px 26px",
            }}
          >
            {heldDef.itemEmoji}  THROW {heldItem.toUpperCase()}
          </button>
        )}

        {throwMode && heldDef && (
          <>
            <p style={{
              margin: 0, color: "#FFF3D0", fontSize: 12,
              fontFamily: "Georgia, serif", letterSpacing: 1,
              textShadow: "0 1px 6px rgba(30,10,40,0.6)",
            }}>
              Tap anywhere to throw the {heldItem}
            </p>
            <button
              onClick={() => setThrowMode(false)}
              style={{ ...chip, pointerEvents: "auto", fontSize: 10, opacity: 0.75 }}
            >
              CANCEL
            </button>
          </>
        )}
      </div>
    </>
  );
}
