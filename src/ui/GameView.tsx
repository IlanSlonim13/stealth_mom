import { useEffect, useRef, useState } from "react";
import { Game } from "../engine/Game";
import { useGameStore } from "../state/gameStore";
import { useProgressStore } from "../state/progressStore";
import { LEVELS } from "../world/levels";
import { getTheme } from "../world/themes";
import { RELAX_QUOTE_DELAY_MS, RELAX_BUTTON_DELAY_MS } from "../utils/constants";
import { HUD } from "./HUD";

interface Feedback { text: string; x: number; y: number; key: number }

export function GameView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  const levelIdx = useGameStore((s) => s.levelIdx);
  const throwMode = useGameStore((s) => s.throwMode);
  const introActive = useGameStore((s) => s.introActive);
  const relaxActive = useGameStore((s) => s.relaxActive);
  const tokens = useGameStore((s) => s.tokens);
  const setScreen = useGameStore((s) => s.setScreen);
  const setCaughtLine = useGameStore((s) => s.setCaughtLine);
  const setTokens = useGameStore((s) => s.setTokens);
  const setHeldItem = useGameStore((s) => s.setHeldItem);
  const setThrowMode = useGameStore((s) => s.setThrowMode);
  const setNearPickup = useGameStore((s) => s.setNearPickup);
  const setIntroActive = useGameStore((s) => s.setIntroActive);
  const setRelaxActive = useGameStore((s) => s.setRelaxActive);
  const startLevel = useGameStore((s) => s.startLevel);
  const markComplete = useProgressStore((s) => s.markComplete);

  const [won, setWon] = useState(false);
  const [momPos, setMomPos] = useState<{ x: number; y: number } | null>(null);
  const [bubbleFading, setBubbleFading] = useState(false);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [quoteVisible, setQuoteVisible] = useState(false);
  const [starsVisible, setStarsVisible] = useState(false);
  const [buttonsVisible, setButtonsVisible] = useState(false);
  const feedbackKey = useRef(0);

  const level = LEVELS[levelIdx];
  const theme = getTheme(level.theme);
  const isLast = levelIdx >= LEVELS.length - 1;

  // ── Game lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;
    const el = mountRef.current;
    setWon(false);
    setBubbleFading(false);
    setFeedbacks([]);
    setQuoteVisible(false);
    setStarsVisible(false);
    setButtonsVisible(false);

    let rafId: number;
    const tryInit = () => {
      if (!el.isConnected) return;
      if (el.clientWidth === 0 || el.clientHeight === 0) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      const lvl = LEVELS[levelIdx];
      const game = new Game(el, lvl, {
        onIntroDone: () => {
          setBubbleFading(true);
          setTimeout(() => useGameStore.getState().setIntroActive(false), 600);
        },
        onCaught: (line) => {
          setCaughtLine(line);
          setScreen("caught");
        },
        onWon: (tk) => {
          setWon(true);
          markComplete(lvl.id, tk);
        },
        onRelaxStarted: () => setRelaxActive(true),
        onToken: (count) => setTokens(count),
        onNearPickup: (item) => setNearPickup(item),
        onDecoyThrown: () => {
          setHeldItem(null);
          setThrowMode(false);
        },
        onRelaxFeedback: (text, x, y) => {
          feedbackKey.current++;
          const fb = { text, x, y, key: feedbackKey.current };
          setFeedbacks((prev) => [...prev, fb]);
          setTimeout(
            () => setFeedbacks((prev) => prev.filter((f) => f.key !== fb.key)),
            1300,
          );
        },
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

  // keep Game's throw mode in sync
  useEffect(() => {
    gameRef.current?.setThrowMode(throwMode);
  }, [throwMode]);

  // track Mom for the intro speech bubble
  useEffect(() => {
    if (!introActive) { setMomPos(null); return; }
    let id: number;
    const tick = () => {
      if (gameRef.current) setMomPos(gameRef.current.getMomScreenPos());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [introActive]);

  // relax overlay reveal sequence
  useEffect(() => {
    if (!relaxActive) return;
    const q = setTimeout(() => setQuoteVisible(true), RELAX_QUOTE_DELAY_MS);
    const s = setTimeout(() => setStarsVisible(true), RELAX_QUOTE_DELAY_MS + 1100);
    const b = setTimeout(() => setButtonsVisible(true), RELAX_BUTTON_DELAY_MS);
    return () => { clearTimeout(q); clearTimeout(s); clearTimeout(b); };
  }, [relaxActive]);

  const sky = `linear-gradient(168deg, ${theme.sky[0]} 0%, ${theme.sky[1]} 55%, ${theme.sky[2]} 100%)`;

  return (
    <div style={{
      width: "100%", height: "100%", position: "relative", overflow: "hidden",
      background: sky,
    }}>
      <style>{`
        @keyframes smFadeUp {
          from { opacity:0; transform:translateY(14px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes smBubbleIn {
          from { opacity:0; transform:translate(-50%,-100%) scale(0.85); }
          to   { opacity:1; transform:translate(-50%,-100%) scale(1); }
        }
        @keyframes smFloatUp {
          from { opacity:1; transform:translate(-50%,0); }
          to   { opacity:0; transform:translate(-50%,-46px); }
        }
        @keyframes smStarPop {
          0%   { opacity:0; transform:scale(0.2) rotate(-30deg); }
          70%  { opacity:1; transform:scale(1.25) rotate(6deg); }
          100% { opacity:1; transform:scale(1) rotate(0); }
        }
      `}</style>

      {/* soft vignette over the diorama */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
        background: "radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(30,16,40,0.22) 100%)",
      }} />

      <div ref={mountRef} style={{ position: "absolute", inset: 0, touchAction: "none" }} />

      {!introActive && !won && <HUD gameRef={gameRef} />}

      {/* ── Intro overlay ── */}
      {introActive && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2,
          opacity: bubbleFading ? 0 : 1, transition: "opacity 0.6s ease-out",
          fontFamily: "Georgia, serif",
        }}>
          <div style={{ position: "absolute", top: "7%", left: 0, right: 0, textAlign: "center" }}>
            <p style={{
              margin: "0 0 6px", fontSize: 11, letterSpacing: 5, textTransform: "uppercase",
              color: theme.uiText, opacity: 0.55, animation: "smFadeUp 0.6s ease-out",
            }}>
              Level {level.id} · {level.name}
            </p>
            <p style={{
              margin: 0, fontSize: 15, fontStyle: "italic", color: theme.uiText,
              opacity: 0.75, animation: "smFadeUp 0.6s ease-out 0.15s both",
            }}>
              {level.subtitle}
            </p>
          </div>

          {momPos && (
            <div style={{
              position: "absolute", left: momPos.x, top: momPos.y,
              transform: "translate(-50%, -100%)",
              animation: "smBubbleIn 0.5s ease-out 0.4s both",
            }}>
              <div style={{
                position: "relative", background: "rgba(255,252,246,0.96)",
                borderRadius: 16, padding: "13px 20px", maxWidth: 280,
                boxShadow: "0 6px 24px rgba(40,20,50,0.18)",
              }}>
                <p style={{
                  margin: 0, fontSize: 16, fontStyle: "italic", lineHeight: 1.45,
                  color: "#3A2A3E", textAlign: "center",
                }}>
                  {level.intro}
                </p>
                <div style={{
                  position: "absolute", bottom: -9, left: "50%", marginLeft: -9,
                  width: 0, height: 0,
                  borderLeft: "9px solid transparent", borderRight: "9px solid transparent",
                  borderTop: "9px solid rgba(255,252,246,0.96)",
                }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Relax overlay (win) ── */}
      {relaxActive && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2,
          fontFamily: "Georgia, serif", color: "#FFF9F0",
        }}>
          <p style={{
            position: "absolute", top: "9%", left: 0, right: 0, margin: 0,
            textAlign: "center", fontSize: 22, fontStyle: "italic",
            letterSpacing: 1, padding: "0 32px",
            textShadow: "0 2px 14px rgba(30,10,40,0.45)",
            opacity: quoteVisible ? 0.95 : 0,
            transition: "opacity 1.6s ease-in",
          }}>
            {level.relax.quote}
          </p>

          {/* stars */}
          {starsVisible && (
            <div style={{
              position: "absolute", top: "17%", left: 0, right: 0,
              display: "flex", justifyContent: "center", gap: 14,
            }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  fontSize: 30,
                  filter: i < tokens ? "drop-shadow(0 0 8px rgba(255,214,120,0.8))" : "none",
                  color: i < tokens ? "#FFD678" : "rgba(255,255,255,0.28)",
                  animation: `smStarPop 0.5s ease-out ${i * 0.28}s both`,
                }}>
                  ★
                </span>
              ))}
            </div>
          )}

          {/* floating prop feedback */}
          {feedbacks.map((fb) => (
            <div key={fb.key} style={{
              position: "fixed", left: fb.x, top: fb.y,
              fontSize: 15, fontStyle: "italic", whiteSpace: "nowrap",
              textShadow: "0 1px 6px rgba(30,10,40,0.6)",
              animation: "smFloatUp 1.3s ease-out forwards",
            }}>
              {fb.text}
            </div>
          ))}

          <div style={{
            position: "absolute", bottom: 36, left: 0, right: 0,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
            pointerEvents: "auto",
          }}>
            {buttonsVisible && (
              <button
                onClick={() => (isLast ? setScreen("menu") : startLevel(levelIdx + 1))}
                style={{
                  background: "rgba(255,252,246,0.92)", border: "none",
                  borderRadius: 24, padding: "13px 38px", cursor: "pointer",
                  fontSize: 15, fontFamily: "Georgia, serif", color: "#3A2A3E",
                  letterSpacing: 1, boxShadow: "0 6px 24px rgba(30,10,40,0.3)",
                  animation: "smFadeUp 0.7s ease-out both",
                }}
              >
                {isLast ? "🎉  You Did It, Mom" : "Next Level  →"}
              </button>
            )}
            <button
              onClick={() => setScreen("menu")}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                color: "rgba(255,252,246,0.5)", fontSize: 12,
                fontFamily: "Georgia, serif", letterSpacing: 2,
                animation: "smFadeUp 0.7s ease-out 1.6s both",
              }}
            >
              MENU
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
