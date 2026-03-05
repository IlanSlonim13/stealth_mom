import { useEffect, useState, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import { useGameStore } from "../state/gameStore";
import { LEVELS } from "../world/levels";
import { RELAX_DATA } from "../world/relaxData";
import { AudioManager } from "../engine/AudioManager";
import { RELAX_BUTTON_DELAY_MS } from "../utils/constants";

interface ClickFeedback {
  id: string;
  text: string;
  x: number;
  y: number;
  key: number;
}

export function RelaxScreen() {
  const levelIdx   = useGameStore((s) => s.levelIdx);
  const startLevel = useGameStore((s) => s.startLevel);
  const setScreen  = useGameStore((s) => s.setScreen);

  const isLast = levelIdx >= LEVELS.length - 1;
  const data = RELAX_DATA[levelIdx + 1]; // levels are 1-indexed

  const [consumed, setConsumed] = useState<Set<string>>(new Set());
  const [feedbacks, setFeedbacks] = useState<ClickFeedback[]>([]);
  const [showButton, setShowButton] = useState(false);
  const [quoteVisible, setQuoteVisible] = useState(false);
  const feedbackKey = useRef(0);

  // Play sigh on mount, show quote
  useEffect(() => {
    AudioManager.preload(["mom-sigh"]);
    AudioManager.stopAmbient();
    const sighTimer = setTimeout(() => {
      AudioManager.play("mom-sigh");
    }, 400);

    const quoteTimer = setTimeout(() => setQuoteVisible(true), 200);
    const btnTimer = setTimeout(() => setShowButton(true), RELAX_BUTTON_DELAY_MS);

    return () => {
      clearTimeout(sighTimer);
      clearTimeout(quoteTimer);
      clearTimeout(btnTimer);
    };
  }, []);

  const handleItemClick = useCallback((itemId: string, clickEmoji: string, consumable: boolean | undefined, e: React.MouseEvent) => {
    if (consumed.has(itemId)) return;

    // Create floating feedback at click position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    feedbackKey.current++;
    const fb: ClickFeedback = { id: itemId, text: clickEmoji, x, y, key: feedbackKey.current };
    setFeedbacks(prev => [...prev, fb]);
    setTimeout(() => {
      setFeedbacks(prev => prev.filter(f => f.key !== fb.key));
    }, 1200);

    if (consumable) {
      setConsumed(prev => new Set(prev).add(itemId));
    }
  }, [consumed]);

  if (!data) return null;

  return (
    <div style={{
      width: "100%", height: "100%",
      background: data.bgGradient,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "Georgia, serif", color: "#FFF",
      position: "relative", overflow: "hidden",
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

      {/* Mom's quote */}
      <p style={{
        fontSize: 22, fontStyle: "italic", margin: "0 0 40px",
        opacity: quoteVisible ? 0.8 : 0,
        transition: "opacity 1.5s ease-in",
        textAlign: "center", padding: "0 32px",
        letterSpacing: 1,
      }}>
        {data.momQuote}
      </p>

      {/* Interactive items */}
      <div style={{
        display: "flex", gap: 24, flexWrap: "wrap",
        justifyContent: "center", alignItems: "center",
        padding: "0 24px", maxWidth: 340,
      }}>
        {data.items.map((item, i) => {
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
        {showButton && (
          <button
            onClick={() => isLast ? setScreen("menu") : startLevel(levelIdx + 1)}
            style={{
              ...btnStyle("rgba(255,255,255,0.12)"),
              animation: "buttonReveal 0.8s ease-out both",
            }}
          >
            {isLast ? "You Win!" : "Next Level"}
          </button>
        )}
        <button
          onClick={() => setScreen("menu")}
          style={{
            ...btnStyle("transparent"),
            opacity: 0.3, fontSize: 11,
            animation: `relaxFadeIn 0.6s ease-out 1.5s both`,
          }}
        >
          Menu
        </button>
      </div>
    </div>
  );
}

function btnStyle(bg: string): CSSProperties {
  return {
    background: bg,
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8, padding: "10px 28px",
    color: "#FFF", cursor: "pointer", fontSize: 13,
    fontFamily: "Georgia, serif",
  };
}
