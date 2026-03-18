import { useGameStore } from "../state/gameStore";
import { LEVELS } from "../world/levels";

export interface HUDProps {
  onPerformTask?: (taskId: string) => void;
}

export function HUD({ onPerformTask }: HUDProps = {}) {
  const levelIdx    = useGameStore((s) => s.levelIdx);
  const decoyMode   = useGameStore((s) => s.decoyMode);
  const inventory   = useGameStore((s) => s.inventory);
  const nearPickup  = useGameStore((s) => s.nearPickup);
  const setScreen   = useGameStore((s) => s.setScreen);
  const startLevel  = useGameStore((s) => s.startLevel);
  const setDecoyMode = useGameStore((s) => s.setDecoyMode);
  const pickUpDecoy = useGameStore((s) => s.pickUpDecoy);
  const throwDecoy  = useGameStore((s) => s.throwDecoy);

  // Task-mode state
  const nearTask      = useGameStore((s) => s.nearTask);
  const taskStatuses  = useGameStore((s) => s.taskStatuses);
  const coffeeTimer   = useGameStore((s) => s.coffeeTimer);
  const taskItem      = useGameStore((s) => s.taskItem);

  const level = LEVELS[levelIdx];
  const isTaskMode = level.levelMode === "tasks";
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

  // Task label for nearby task
  const nearTaskDef = isTaskMode ? level.tasks?.find(t => t.id === nearTask) : null;

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

      {/* Coffee timer (top-right, task mode only) */}
      {isTaskMode && coffeeTimer < 1 && coffeeTimer > 0 && (
        <div style={{
          position: "absolute", top: 48, right: 14,
          pointerEvents: "none",
        }}>
          <svg width={48} height={48} viewBox="0 0 48 48">
            <circle cx={24} cy={24} r={20} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={4} />
            <circle
              cx={24} cy={24} r={20}
              fill="none"
              stroke={coffeeTimer > 0.5 ? "#44AA44" : coffeeTimer > 0.25 ? "#CCAA00" : "#CC3333"}
              strokeWidth={4}
              strokeDasharray={`${coffeeTimer * 125.6} 125.6`}
              strokeLinecap="round"
              transform="rotate(-90 24 24)"
            />
            <text x={24} y={28} textAnchor="middle" fill="#FFF" fontSize={14} fontFamily="Georgia, serif">
              ☕
            </text>
          </svg>
        </div>
      )}

      {/* Task checklist (left side, task mode only) */}
      {isTaskMode && level.tasks && (
        <div style={{
          position: "absolute", top: 48, left: 10,
          display: "flex", flexDirection: "column", gap: 2,
          pointerEvents: "none", maxHeight: "60vh", overflowY: "auto",
        }}>
          {level.tasks.filter(t => t.autoComplete === 0).map(t => {
            const status = taskStatuses[t.id] ?? "locked";
            const isDone = status === "done";
            const isActive = status === "active";
            const isAvailable = status === "available";
            return (
              <div key={t.id} style={{
                fontFamily: "Georgia, serif",
                fontSize: 10,
                color: isDone ? "#88CC88" : isActive ? "#FFD700" : isAvailable ? "#FFF" : "rgba(255,255,255,0.35)",
                letterSpacing: 0.5,
                display: "flex", alignItems: "center", gap: 4,
                textDecoration: isDone ? "line-through" : "none",
              }}>
                <span style={{ fontSize: 11 }}>{isDone ? "✓" : isActive ? "⏳" : "○"}</span>
                {t.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Task item indicator (task mode) */}
      {isTaskMode && taskItem && (
        <div style={{
          position: "absolute", bottom: 60,
          left: "50%", transform: "translateX(-50%)",
          ...hudBtn, pointerEvents: "none", fontSize: 10,
          opacity: 0.8, padding: "3px 10px",
        }}>
          Carrying: {taskItem}
        </div>
      )}

      {/* Task action button (bottom center, task mode) */}
      {isTaskMode && nearTaskDef && (
        <div style={{
          position: "absolute", bottom: 20,
          left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <button
            onClick={() => onPerformTask?.(nearTaskDef.id)}
            style={{
              background: "rgba(255,215,0,0.25)",
              border: "1px solid rgba(255,215,0,0.7)",
              borderRadius: 8, color: "#FFD700", padding: "8px 22px",
              fontSize: 13, cursor: "pointer",
              backdropFilter: "blur(8px)", fontFamily: "Georgia, serif", letterSpacing: 1,
              animation: "pulse 1s ease-in-out infinite",
            }}
          >
            {nearTaskDef.label.toUpperCase()}
          </button>
        </div>
      )}

      {/* Bottom action area (stealth mode) */}
      {!isTaskMode && hasDecoyItems && (
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
