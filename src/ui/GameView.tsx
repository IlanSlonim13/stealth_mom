import { useEffect, useRef, useCallback, useState } from "react";
import type { CSSProperties } from "react";
import { Game } from "../engine/Game";
import { useGameStore } from "../state/gameStore";
import { LEVELS } from "../world/levels";
import { INTRO_QUOTES } from "../world/introData";
import { RELAX_DATA } from "../world/relaxData";
import { LEVEL1_TUTORIAL } from "../world/tutorialData";
import { AudioManager } from "../engine/AudioManager";
import { RELAX_BUTTON_DELAY_MS } from "../utils/constants";
import type { TaskStatus } from "../state/gameStore";
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
  const setNearTask    = useGameStore((s) => s.setNearTask);
  const setTaskStatuses = useGameStore((s) => s.setTaskStatuses);
  const setCoffeeTimer = useGameStore((s) => s.setCoffeeTimer);
  const setTaskItem    = useGameStore((s) => s.setTaskItem);

  const [bubbleFading, setBubbleFading] = useState(false);
  const [momScreenPos, setMomScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialFading, setTutorialFading] = useState(false);
  const decoyModeRef = useRef(decoyMode);
  decoyModeRef.current = decoyMode;
  const throwDecoyRef = useRef(throwDecoyFn);
  throwDecoyRef.current = throwDecoyFn;

  // Relaxation state
  const [consumed, setConsumed] = useState<Set<string>>(new Set());
  const [feedbacks, setFeedbacks] = useState<ClickFeedback[]>([]);
  const [showNextBtn, setShowNextBtn] = useState(false);
  const [relaxQuoteVisible, setRelaxQuoteVisible] = useState(false);
  const feedbackKey = useRef(0);

  // Animation debug overlay — polls Game.animDebug each frame
  const [animDebug, setAnimDebug] = useState("");
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(1.0);
  useEffect(() => {
    let id: number;
    const tick = () => {
      const g = gameRef.current;
      if (g) setAnimDebug(g.animDebug);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  // Sync toggle and speed to Game instance
  useEffect(() => {
    const g = gameRef.current;
    if (g) { g.animDebugEnabled = debugEnabled; if (!debugEnabled) g.animDebug = ""; }
  }, [debugEnabled]);
  useEffect(() => {
    const g = gameRef.current;
    if (g) g.animSpeed = animSpeed;
  }, [animSpeed]);

  useEffect(() => {
    if (!mountRef.current) return;
    const el = mountRef.current;
    setBubbleFading(false);
    setTutorialStep(0);
    setTutorialFading(false);
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
      const skipToRelax = useGameStore.getState().skipToEnd;
      if (skipToRelax) useGameStore.getState().setSkipToEnd(false);
      const game = new Game(el, level, {
        onCaught: (line) => { setCaughtLine(line); setScreen("caught"); },
        onWon: (text)   => { setWinText(text); },
        onNearPickup: (itemName) => setNearPickup(itemName),
        onNearTask: (taskId) => setNearTask(taskId),
        onCoffeeTimer: (fraction) => setCoffeeTimer(fraction),
        onTaskUpdate: (statuses) => setTaskStatuses(statuses as Record<string, TaskStatus>),
        onTaskItem: (item) => setTaskItem(item),
      });
      // if (level.id === 1) game.setIntroPaused(true); // tutorial disabled for dev
      game.setIntroCompleteCallback(() => {
        setBubbleFading(true);
        setTimeout(() => setIntroActive(false), 600);
      });
      game.setDeferredTapHandler((x, y) => {
        const result = game.handleTap(x, y, decoyModeRef.current);
        if (result === "thrown") throwDecoyRef.current();
      });
      game.setRelaxZoomCallback(() => {
        setRelaxActive(true);
        AudioManager.preload(["mom-sigh"]);
        // Delay sigh until after the sit + head settle phases (~2.6s into the animation)
        setTimeout(() => AudioManager.play("mom-sigh"), 2800);
        // Enter 3D relax scene for levels that support it
        const rd = RELAX_DATA[level.id];
        if (rd?.sceneMode === "3d") {
          game.enterRelaxScene();
        }
      });
      // Dev shortcut: jump straight to level-end win sequence
      if (skipToRelax) {
        game.jumpToWinSequence();
      }
      game.setRelaxClickCallback((itemId, feedback, screenX, screenY) => {
        feedbackKey.current++;
        const fb: ClickFeedback = { text: feedback, x: screenX, y: screenY - 30, key: feedbackKey.current };
        setFeedbacks(prev => [...prev, fb]);
        setTimeout(() => {
          setFeedbacks(prev => prev.filter(f => f.key !== fb.key));
        }, 1200);
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

  // Track Mom's screen position during intro for speech bubble placement
  useEffect(() => {
    if (!introActive) { setMomScreenPos(null); return; }
    let id: number;
    const tick = () => {
      const game = gameRef.current;
      if (game) setMomScreenPos(game.getMomScreenPos());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [introActive]);

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

  const relaxActiveRef = useRef(relaxActive);
  relaxActiveRef.current = relaxActive;

  const handleInput = useCallback(
    (e: React.MouseEvent) => {
      const game = gameRef.current;
      if (!game) return;
      // During 3D relax scene, forward clicks to the relax handler
      if (relaxActiveRef.current) {
        const level = LEVELS[useGameStore.getState().levelIdx];
        const rd = RELAX_DATA[level.id];
        if (rd?.sceneMode === "3d") {
          game.handleRelaxClick(e.clientX, e.clientY);
          return;
        }
      }
      const result = game.handleTap(e.clientX, e.clientY, decoyMode);
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
        style={{ width: "100%", height: "100%", touchAction: "none" }}
      />

      {/* Debug controls (top-left corner, below HUD) */}
      <div style={{
        position: "absolute", top: 48, right: 14,
        display: "flex", gap: 6, alignItems: "center",
        zIndex: 999, pointerEvents: "auto",
      }}>
        <button
          onClick={() => setDebugEnabled(v => !v)}
          style={{
            background: debugEnabled ? "rgba(0,255,0,0.3)" : "rgba(0,0,0,0.4)",
            border: `1px solid ${debugEnabled ? "#0F0" : "rgba(255,255,255,0.15)"}`,
            borderRadius: 4, color: debugEnabled ? "#0F0" : "#888",
            fontFamily: "monospace", fontSize: 10, padding: "3px 8px", cursor: "pointer",
          }}
        >
          DBG
        </button>
        {debugEnabled && (
          <div style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "rgba(0,0,0,0.6)", borderRadius: 4, padding: "2px 6px",
          }}>
            <span style={{ color: "#0F0", fontFamily: "monospace", fontSize: 9 }}>
              {animSpeed.toFixed(1)}x
            </span>
            <input
              type="range" min="0.05" max="1" step="0.05"
              value={animSpeed}
              onChange={e => setAnimSpeed(parseFloat(e.target.value))}
              style={{ width: 60, accentColor: "#0F0" }}
            />
          </div>
        )}
      </div>

      {/* Animation debug overlay */}
      {debugEnabled && animDebug && (
        <div style={{
          position: "absolute", bottom: 8, left: 8, right: 8,
          background: "rgba(0,0,0,0.75)", color: "#0F0",
          fontFamily: "monospace", fontSize: 11, padding: "6px 10px",
          borderRadius: 4, pointerEvents: "none", whiteSpace: "pre-wrap",
          zIndex: 999,
        }}>
          {animDebug}
        </div>
      )}

      {/* HUD — hidden during intro and relaxation */}
      {!introActive && !relaxActive && (
        <HUD onPerformTask={(taskId) => gameRef.current?.performTask(taskId)} />
      )}

      {/* Intro speech bubble overlay */}
      {introActive && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: "none",
          opacity: bubbleFading ? 0 : 1,
          transition: "opacity 0.6s ease-out",
        }}>
          <style>{`
            @keyframes bubbleIn {
              from { opacity:0; transform:scale(0.9); }
              to   { opacity:1; transform:scale(1); }
            }
            @keyframes tutorialFadeIn {
              0%   { opacity:0; transform:translateY(12px) scale(0.95); }
              100% { opacity:1; transform:translateY(0) scale(1); }
            }
            @keyframes tutorialFadeOut {
              0%   { opacity:1; transform:translateY(0) scale(1); }
              100% { opacity:0; transform:translateY(-12px) scale(0.95); }
            }
          `}</style>

          {/* Level label — top center */}
          <div style={{
            position: "absolute", top: "6%", left: 0, right: 0,
            display: "flex", flexDirection: "column", alignItems: "center",
          }}>
            <p style={{
              fontFamily: "Georgia, serif", fontSize: 10, letterSpacing: 4,
              color: "#FFF", opacity: 0.4, textTransform: "uppercase",
              margin: "0 0 6px", animation: "bubbleIn 0.5s ease-out",
            }}>
              Level {level.id}
            </p>
            <p style={{
              fontFamily: "Georgia, serif", fontSize: 16, fontStyle: "italic",
              color: "#FFF", opacity: 0.7, margin: 0,
              animation: "bubbleIn 0.5s ease-out 0.1s both",
            }}>
              {level.name}
            </p>
          </div>

          {/* Level 1 tutorial cards — commented out for dev iteration
          {level.id === 1 && tutorialStep < LEVEL1_TUTORIAL.length ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (tutorialFading) return;
                setTutorialFading(true);
                setTimeout(() => {
                  const next = tutorialStep + 1;
                  setTutorialStep(next);
                  setTutorialFading(false);
                  if (next >= LEVEL1_TUTORIAL.length) {
                    gameRef.current?.setIntroPaused(false);
                  }
                }, 1800 + 750);
              }}
              style={{
                position: "absolute", bottom: "12%", left: "50%",
                transform: "translateX(-50%)",
                pointerEvents: "auto",
              }}
            >
              <div key={`${tutorialStep}-${tutorialFading}`} style={{
                background: "rgba(255,255,255,0.95)",
                borderRadius: 16,
                padding: "16px 24px",
                maxWidth: 280,
                textAlign: "center",
                animation: tutorialFading
                  ? "tutorialFadeOut 1.8s ease-in-out forwards"
                  : "tutorialFadeIn 1.8s ease-in-out",
              }}>
                <p style={{ fontSize: 28, margin: "0 0 8px" }}>
                  {LEVEL1_TUTORIAL[tutorialStep].emoji}
                </p>
                <p style={{
                  fontFamily: "Georgia, serif", fontSize: 15,
                  color: "#2A1A2A", margin: "0 0 12px",
                  lineHeight: 1.5,
                }}>
                  {LEVEL1_TUTORIAL[tutorialStep].text}
                </p>
                <p style={{
                  fontFamily: "Georgia, serif", fontSize: 11,
                  color: "#999", margin: 0, letterSpacing: 1,
                }}>
                  TAP TO CONTINUE
                </p>
              </div>
            </div>
          ) : ( */}
          {(
            /* Speech bubble — bubble on top, pointer at bottom-left pointing down */
            momScreenPos && (
              <div style={{
                position: "absolute",
                left: momScreenPos.x,
                top: momScreenPos.y,
                transform: "translateY(-100%)",
              }}>
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                  transformOrigin: "bottom left",
                  animation: "bubbleIn 0.4s ease-out 0.3s both",
                }}>
                  <div style={{
                    position: "relative",
                    background: "rgba(255,255,255,0.95)",
                    borderRadius: 18,
                    padding: "16px 26px",
                    maxWidth: 320,
                  }}>
                    <p style={{
                      fontFamily: "Georgia, serif", fontSize: 18,
                      color: "#2A1A2A", margin: 0, textAlign: "center",
                      fontStyle: "italic", lineHeight: 1.5,
                    }}>
                      {quote}
                    </p>
                  </div>
                  {/* Triangle pointer at bottom-left, pointing down */}
                  <div style={{
                    marginLeft: 10,
                    width: 0, height: 0,
                    borderLeft: "10px solid transparent",
                    borderRight: "10px solid transparent",
                    borderTop: "10px solid rgba(255,255,255,0.95)",
                  }} />
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Relaxation overlay — on top of zoomed-in 3D scene */}
      {relaxActive && relaxData && (
        relaxData.sceneMode === "3d" ? (
          /* ── 3D relax scene: minimal overlay with floating feedback + buttons ── */
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            pointerEvents: "none",
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
              @keyframes buttonReveal {
                from { opacity:0; transform:translateY(8px); }
                to   { opacity:1; transform:translateY(0); }
              }
            `}</style>

            {/* Mom's quote — shown briefly at top */}
            <p style={{
              position: "absolute", top: "8%", left: 0, right: 0,
              fontSize: 22, fontStyle: "italic", margin: 0,
              opacity: relaxQuoteVisible ? 0.8 : 0,
              transition: "opacity 1.5s ease-in",
              textAlign: "center", padding: "0 32px",
              letterSpacing: 1,
              textShadow: "0 2px 8px rgba(0,0,0,0.6)",
            }}>
              {relaxData.momQuote}
            </p>

            {/* Floating click feedback */}
            {feedbacks.map(fb => (
              <div key={fb.key} style={{
                position: "fixed",
                left: fb.x,
                top: fb.y,
                transform: "translateX(-50%)",
                fontSize: 15,
                fontStyle: "italic",
                color: "rgba(255,255,255,0.95)",
                pointerEvents: "none",
                animation: "floatUp 1.2s ease-out forwards",
                whiteSpace: "nowrap",
                textShadow: "0 1px 4px rgba(0,0,0,0.5)",
              }}>
                {fb.text}
              </div>
            ))}

            {/* Next level / Menu buttons */}
            <div style={{
              position: "absolute", bottom: 40, left: 0, right: 0,
              display: "flex", gap: 12, justifyContent: "center",
              alignItems: "center", flexDirection: "column",
              pointerEvents: "auto",
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
        ) : (
          /* ── Emoji overlay relax (levels 2-5) ── */
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
        )
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
