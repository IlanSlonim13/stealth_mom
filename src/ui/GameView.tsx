import { useEffect, useRef, useCallback, useState } from "react";
import { Game } from "../engine/Game";
import { useGameStore } from "../state/gameStore";
import { LEVELS } from "../world/levels";
import { INTRO_QUOTES } from "../world/introData";
import { HUD } from "./HUD";

export function GameView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  const levelIdx    = useGameStore((s) => s.levelIdx);
  const decoyMode   = useGameStore((s) => s.decoyMode);
  const inventory   = useGameStore((s) => s.inventory);
  const introActive = useGameStore((s) => s.introActive);
  const setCaughtLine = useGameStore((s) => s.setCaughtLine);
  const setWinText    = useGameStore((s) => s.setWinText);
  const setScreen     = useGameStore((s) => s.setScreen);
  const setNearPickup = useGameStore((s) => s.setNearPickup);
  const throwDecoyFn  = useGameStore((s) => s.throwDecoy);
  const setIntroActive = useGameStore((s) => s.setIntroActive);

  const [bubbleFading, setBubbleFading] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;
    const el = mountRef.current;
    setBubbleFading(false);

    let rafId: number;
    const tryInit = () => {
      if (!el.isConnected) return;
      if (el.clientWidth === 0 || el.clientHeight === 0) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      const level = LEVELS[levelIdx];
      const game = new Game(el, level, {
        onCaught: (line) => { setCaughtLine(line); setScreen("caught"); },
        onWon: (text)   => { setWinText(text);    setScreen("relax");  },
        onNearPickup: (itemName) => setNearPickup(itemName),
      });
      game.setIntroCompleteCallback(() => {
        setBubbleFading(true);
        setTimeout(() => setIntroActive(false), 600);
      });
      gameRef.current = game;
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

  const level = LEVELS[levelIdx];
  const quote = INTRO_QUOTES[level.id] ?? "";

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#000" }}>
      <div
        ref={mountRef}
        onClick={handleInput}
        onTouchStart={handleInput}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      />
      <HUD />

      {/* Intro speech bubble overlay */}
      {introActive && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "flex-start",
          paddingTop: "12%",
          pointerEvents: "none",
          opacity: bubbleFading ? 0 : 1,
          transition: "opacity 0.6s ease-out",
        }}>
          <style>{`
            @keyframes bubbleIn {
              from { opacity:0; transform:translateY(10px) scale(0.9); }
              to   { opacity:1; transform:translateY(0) scale(1); }
            }
          `}</style>

          {/* Level label */}
          <p style={{
            fontFamily: "Georgia, serif", fontSize: 10, letterSpacing: 4,
            color: "#FFF", opacity: 0.4, textTransform: "uppercase",
            margin: "0 0 6px", animation: "bubbleIn 0.5s ease-out",
          }}>
            Level {level.id}
          </p>
          <p style={{
            fontFamily: "Georgia, serif", fontSize: 16, fontStyle: "italic",
            color: "#FFF", opacity: 0.7, margin: "0 0 16px",
            animation: "bubbleIn 0.5s ease-out 0.1s both",
          }}>
            {level.name}
          </p>

          {/* Speech bubble */}
          <div style={{
            position: "relative",
            background: "rgba(255,255,255,0.95)",
            borderRadius: 16,
            padding: "12px 20px",
            maxWidth: 260,
            animation: "bubbleIn 0.4s ease-out 0.3s both",
          }}>
            <p style={{
              fontFamily: "Georgia, serif", fontSize: 14,
              color: "#2A1A2A", margin: 0, textAlign: "center",
              fontStyle: "italic", lineHeight: 1.5,
            }}>
              {quote}
            </p>
            {/* Triangle pointer */}
            <div style={{
              position: "absolute", bottom: -8, left: "50%", marginLeft: -8,
              width: 0, height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: "8px solid rgba(255,255,255,0.95)",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
