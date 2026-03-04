import { useEffect, useRef, useCallback } from "react";
import { Game } from "../engine/Game";
import { useGameStore } from "../state/gameStore";
import { LEVELS } from "../world/levels";
import { HUD } from "./HUD";

export function GameView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  const levelIdx    = useGameStore((s) => s.levelIdx);
  const decoyMode   = useGameStore((s) => s.decoyMode);
  const inventory   = useGameStore((s) => s.inventory);
  const setCaughtLine = useGameStore((s) => s.setCaughtLine);
  const setWinText    = useGameStore((s) => s.setWinText);
  const setScreen     = useGameStore((s) => s.setScreen);
  const setNearPickup = useGameStore((s) => s.setNearPickup);
  const throwDecoyFn  = useGameStore((s) => s.throwDecoy);

  useEffect(() => {
    if (!mountRef.current) return;
    const el = mountRef.current;

    let rafId: number;
    const tryInit = () => {
      if (!el.isConnected) return;
      if (el.clientWidth === 0 || el.clientHeight === 0) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      const level = LEVELS[levelIdx];
      gameRef.current = new Game(el, level, {
        onCaught: (line) => { setCaughtLine(line); setScreen("caught"); },
        onWon: (text)   => { setWinText(text);    setScreen("win");    },
        onNearPickup: (itemName) => setNearPickup(itemName),
      });
    };
    rafId = requestAnimationFrame(tryInit);

    return () => {
      cancelAnimationFrame(rafId);
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [levelIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // When inventory changes, tell Game which item is currently held
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    const level = LEVELS[levelIdx];
    if (inventory.length > 0) {
      const def = level.decoyItems?.find((d) => d.itemName === inventory[0]);
      game.setDecoyItem(def ?? null);
    } else {
      game.setDecoyItem(null);
    }
  }, [inventory, levelIdx]);

  const handleInput = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const game = gameRef.current;
      if (!game) return;
      const clientX = "touches" in e ? e.touches[0]?.clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0]?.clientY : e.clientY;
      if (clientX == null || clientY == null) return;

      const result = game.handleTap(clientX, clientY, decoyMode);
      if (result === "thrown") {
        throwDecoyFn();
      }
    },
    [decoyMode, throwDecoyFn]
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#000" }}>
      <div
        ref={mountRef}
        onClick={handleInput}
        onTouchStart={handleInput}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      />
      <HUD />
    </div>
  );
}
