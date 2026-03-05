import { useGameStore } from "./state/gameStore";
import { MainMenu } from "./ui/MainMenu";
import { GameView } from "./ui/GameView";
import { CaughtScreen } from "./ui/CaughtScreen";
import { LevelComplete } from "./ui/LevelComplete";

export default function App() {
  const screen = useGameStore((s) => s.screen);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {screen === "menu"   && <MainMenu />}
      {screen === "game"   && <GameView />}
      {screen === "caught" && <CaughtScreen />}
      {screen === "win"    && <LevelComplete />}
    </div>
  );
}
