import { useEffect, useRef, useCallback, useState } from "react";
import type { CSSProperties } from "react";
import { Game } from "../engine/Game";
import { useGameStore } from "../state/gameStore";
import { LEVELS } from "../world/levels";
import { INTRO_QUOTES } from "../world/introData";
import { RELAX_DATA } from "../world/relaxData";
import { AudioManager } from "../engine/AudioManager";
import { RELAX_BUTTON_DELAY_MS } from "../utils/constants";
import { HUD } from "./HUD";

interface ClickFeedback {
  text: string;
  x: number;
  y: number;
  key: number;
}

export function GameView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  const levelIdx    = useGameStore((s) => s.levelIdx);
  const decoyMode   = useGameStore((s) => s.decoyMode);
  const inventory   = useGameStore((s) => s.inventory);
  const introActive = useGameStore((s) => s.introActive);
  const relaxActive = useGameStore((s) => s.relaxActive);
  const setCaughtLine = useGameStore((s) => s.setCaughtLine);
  const setWinText    = useGameStore((s) => s.setWinText);
  const setScreen     = useGameStore((s) => s.setScreen);
  const setNearPickup = useGameStore((s) => s.setNearPickup);
  const throwDecoyFn  = useGameStore((s) => s.throwDecoy);
  const setIntroActive = useGameStore((s) => s.setIntroActive);
  const setRelaxActive = useGameStore((s) => s.setRelaxActive);
  const startLevel     = useGameStore((s) => s.startLevel);

  const [bubbleFading, setBubbleFading] = useState(false);

  // Relaxation state
  const [consumed, setConsumed] = useState<Set<string>>(new Set());
  const [feedbacks, setFeedbacks] = useState<ClickFeedback[]>([]);
  const [showNextBtn, setShowNextBtn] = useState(false);
  const [relaxQuoteVisible, setRelaxQuoteVisible] = useState(false);
  const feedbackKey = useRef(0);

  useEffect(() => {
    if (!mountRef.current) return;
    const el = mountRef.current;
    setBubbleFading(false);
    setConsumed(new Set());
    setFeedbacks([]);
    setShowNextBtn(false);
    setRelaxQuoteVisible(false);

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
        onWon: (text)   => { setWinText(text); },
        onNearPickup: (itemName) => setNearPickup(itemName),
      });
      game.setIntroCompleteCallback(() => {
        setBubbleFading(true);
        setTimeout(() => setIntroActive(false), 600);
      });
      game.setRelaxZoomCallback(() => {
        setRelaxActive(true);
        AudioManager.preload(["mom-sigh"]);
        setTimeout(() => AudioManager.play("mom-sigh"), 400);
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

  // When relaxActive turns on, start timers for quote and button
  useEffect(() => {
    if (!relaxActive) return;
    const q = setTimeout(() => setRelaxQuoteVisible(true), 200);
    const b = setTimeout(() => setShowNextBtn(true), RELAX_BUTTON_DELAY_MS);
    return () => { clearTimeout(q); clearTimeout(b); };
  }, [relaxActive]);

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

  const handleItemClick = useCallback((itemId: string, clickEmoji: string, consumable: boolean | undefined, e: React.MouseEvent) => {
    if (consumed.has(itemId)) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    feedbackKey.current++;
    const fb: ClickFeedback = { text: clickEmoji, x, y, key: feedbackKey.current };
    setFeedbacks(prev => [...prev, fb]);
    setTimeout(() => {
      setFeedbacks(prev => prev.filter(f => f.key !== fb.key));
    }, 1200);
    if (consumable) {
      setConsumed(prev => new Set(prev).add(itemId));
    }
  }, [consumed]);

  const level = LEVELS[levelIdx];
  const quote = INTRO_QUOTES[level.id] ?? "";
  const isLast = levelIdx >= LEVELS.length - 1;
  const relaxData = RELAX_DATA[level.id];

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#000" }}>
      <div
        ref={mountRef}
        onClick={handleInput}
        onTouchStart={handleInput}
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      />

      {/* HUD — hidden during intro and relaxation */}
      {!introActive && !relaxActive && <HUD />}

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

      {/* Relaxation overlay — on top of zoomed-in 3D scene */}
      {relaxActive && relaxData && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.35)",
          fontFamily: "Georgia, serif", color: "#FFF",
          userSelect: "none",
        }}>
          <style>{`
            @keyframes relaxFadeIn {
              from { opacity:0; transform:translateY(12px); }
              to   { opacity:1; transform:translateY(0); }
            }
            @keyframes floatUp {
              from { opacity:1; transform:translateY(0); }
              to   { opacity:0; transform:translateY(-40px); }
            }
            @keyframes gentleBob {
              0%, 100% { transform:translateY(0); }
              50% { transform:translateY(-4px); }
            }
            @keyframes buttonReveal {
              from { opacity:0; transform:translateY(8px); }
              to   { opacity:1; transform:translateY(0); }
            }
          `}</style>

          {/* Mom's relaxation quote */}
          <p style={{
            fontSize: 22, fontStyle: "italic", margin: "0 0 40px",
            opacity: relaxQuoteVisible ? 0.8 : 0,
            transition: "opacity 1.5s ease-in",
            textAlign: "center", padding: "0 32px",
            letterSpacing: 1,
          }}>
            {relaxData.momQuote}
          </p>

          {/* Interactive items — no labels, just objects that react */}
          <div style={{
            display: "flex", gap: 24, flexWrap: "wrap",
            justifyContent: "center", alignItems: "center",
            padding: "0 24px", maxWidth: 340,
          }}>
            {relaxData.items.map((item, i) => {
              const isConsumed = consumed.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={(e) => handleItemClick(item.id, item.clickEmoji, item.consumable, e)}
                  style={{
                    fontSize: 52,
                    cursor: isConsumed ? "default" : "pointer",
                    opacity: isConsumed ? 0 : 1,
                    transition: "opacity 0.8s ease-out, transform 0.15s ease",
                    animation: `relaxFadeIn 0.6s ease-out ${0.4 + i * 0.15}s both, gentleBob ${2.5 + i * 0.3}s ease-in-out ${i * 0.5}s infinite`,
                    pointerEvents: isConsumed ? "none" : "auto",
                  }}
                  onMouseDown={(e) => {
                    if (!isConsumed) (e.currentTarget as HTMLElement).style.transform = "scale(1.2)";
                  }}
                  onMouseUp={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "";
                  }}
                >
                  {item.emoji}
                </div>
              );
            })}
          </div>

          {/* Floating click feedback */}
          {feedbacks.map(fb => (
            <div key={fb.key} style={{
              position: "fixed",
              left: fb.x,
              top: fb.y,
              transform: "translateX(-50%)",
              fontSize: 13,
              fontStyle: "italic",
              color: "rgba(255,255,255,0.9)",
              pointerEvents: "none",
              animation: "floatUp 1.2s ease-out forwards",
              whiteSpace: "nowrap",
            }}>
              {fb.text}
            </div>
          ))}

          {/* Next level / Menu buttons */}
          <div style={{
            position: "absolute", bottom: 40, left: 0, right: 0,
            display: "flex", gap: 12, justifyContent: "center",
            alignItems: "center", flexDirection: "column",
          }}>
            {showNextBtn && (
              <button
                onClick={() => isLast ? setScreen("menu") : startLevel(levelIdx + 1)}
                style={{
                  ...relaxBtnStyle("rgba(255,255,255,0.12)"),
                  animation: "buttonReveal 0.8s ease-out both",
                }}
              >
                {isLast ? "You Win!" : "Next Level"}
              </button>
            )}
            <button
              onClick={() => setScreen("menu")}
              style={{
                ...relaxBtnStyle("transparent"),
                opacity: 0.3, fontSize: 11,
                animation: "relaxFadeIn 0.6s ease-out 1.5s both",
              }}
            >
              Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function relaxBtnStyle(bg: string): CSSProperties {
  return {
    background: bg,
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8, padding: "10px 28px",
    color: "#FFF", cursor: "pointer", fontSize: 13,
    fontFamily: "Georgia, serif",
  };
}
