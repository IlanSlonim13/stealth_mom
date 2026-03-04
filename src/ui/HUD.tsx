import { useGameStore } from "../state/gameStore";
import { LEVELS } from "../world/levels";

export function HUD() {
  const levelIdx    = useGameStore((s) => s.levelIdx);
  const decoyMode   = useGameStore((s) => s.decoyMode);
  const inventory   = useGameStore((s) => s.inventory);
  const nearPickup  = useGameStore((s) => s.nearPickup);
  const setScreen   = useGameStore((s) => s.setScreen);
  const startLevel  = useGameStore((s) => s.startLevel);
  const setDecoyMode = useGameStore((s) => s.setDecoyMode);
  const pickUpDecoy = useGameStore((s) => s.pickUpDecoy);
  const throwDecoy  = useGameStore((s) => s.throwDecoy);

  const level = LEVELS[levelIdx];
  const hasDecoyItems = (level.decoyItems?.length ?? 0) > 0;

  const hudBtn: React.CSSProperties = {
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6, color: "#FFF", padding: "5px 12px",
    fontSize: 11, cursor: "pointer",
    backdropFilter: "blur(8px)", letterSpacing: 1,
    fontFamily: "Georgia, serif",
  };

  // Find decoy item data for current inventory item
  const heldItem = inventory[0] ?? null;
  const heldDef = level.decoyItems?.find((d) => d.itemName === heldItem);

  // Find pickup-able item definition
  const pickupDef = level.decoyItems?.find((d) => d.itemName === nearPickup);

  return (
    <>
      {/* Top bar */}
      <div style={{
        position: "absolute", top: 12, left: 0, right: 0,
        display: "flex", justifyContent: "space-between", padding: "0 14px",
        pointerEvents: "none",
      }}>
        <button style={{ ...hudBtn, pointerEvents: "auto" }} onClick={() => setScreen("menu")}>
          MENU
        </button>
        <div style={{ ...hudBtn, pointerEvents: "none" }}>{level.name}</div>
        <button style={{ ...hudBtn, pointerEvents: "auto" }} onClick={() => startLevel(levelIdx)}>
          RETRY
        </button>
      </div>

      {/* Bottom action area */}
      {hasDecoyItems && (
        <div style={{
          position: "absolute", bottom: 20,
          left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>

          {/* GRAB prompt — when near pickup and hands are empty */}
          {nearPickup && !heldItem && pickupDef && (
            <button
              onClick={() => pickUpDecoy(nearPickup)}
              style={{
                background: "rgba(255,215,0,0.25)",
                border: "1px solid rgba(255,215,0,0.7)",
                borderRadius: 8, color: "#FFD700", padding: "8px 22px",
                fontSize: 13, cursor: "pointer",
                backdropFilter: "blur(8px)", fontFamily: "Georgia, serif", letterSpacing: 1,
                animation: "pulse 1s ease-in-out infinite",
              }}
            >
              {pickupDef.itemEmoji} GRAB {pickupDef.itemName.toUpperCase()}
            </button>
          )}

          {/* THROW button — when holding an item */}
          {heldItem && heldDef && !decoyMode && (
            <button
              onClick={() => setDecoyMode("throw")}
              style={{
                background: "rgba(255,100,0,0.3)",
                border: "1px solid rgba(255,150,50,0.7)",
                borderRadius: 8, color: "#FFF", padding: "8px 22px",
                fontSize: 13, cursor: "pointer",
                backdropFilter: "blur(8px)", fontFamily: "Georgia, serif", letterSpacing: 1,
              }}
            >
              {heldDef.itemEmoji} THROW {heldItem.toUpperCase()}
            </button>
          )}

          {/* Throw-mode instructions */}
          {decoyMode === "throw" && heldDef && (
            <>
              <p style={{
                color: "#FFD700", fontSize: 11, fontFamily: "Georgia, serif",
                letterSpacing: 1, margin: 0,
              }}>
                Tap a tile to throw the {heldItem}
              </p>
              <button
                onClick={() => { setDecoyMode(false); throwDecoy(); }}
                style={{ ...hudBtn, fontSize: 10, padding: "4px 10px", opacity: 0.7 }}
              >
                CANCEL
              </button>
            </>
          )}

          {/* Inventory indicator */}
          {heldItem && (
            <div style={{
              ...hudBtn, pointerEvents: "none", fontSize: 10,
              opacity: 0.8, padding: "3px 10px",
            }}>
              Carrying: {heldDef?.itemEmoji} {heldItem}
            </div>
          )}
        </div>
      )}
    </>
  );
}
