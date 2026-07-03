import { Howl, Howler } from "howler";

const SOUNDS = {
  "footstep-soft":   "/assets/audio/footstep-soft.mp3",
  "squeak":          "/assets/audio/squeak.mp3",
  "caught-mommy":    "/assets/audio/caught-mommy.mp3",
  "caught-dog":      "/assets/audio/caught-dog.mp3",
  "caught-husband":  "/assets/audio/caught-husband.mp3",
  "success":         "/assets/audio/success-confetti.mp3",
  "decoy-throw":     "/assets/audio/decoy-throw.mp3",
  "ambient-hum":     "/assets/audio/ambient-hum.mp3",
  "mom-sigh":        "/assets/audio/mom-sigh.mp3",
  "token-pickup":    "/assets/audio/token-pickup.mp3",
} as const;

type SoundKey = keyof typeof SOUNDS;

class AudioManagerClass {
  private pool: Partial<Record<SoundKey, Howl>> = {};
  private ambientId: number | null = null;

  preload(keys: SoundKey[]) {
    for (const key of keys) {
      if (!this.pool[key]) {
        this.pool[key] = new Howl({
          src: [SOUNDS[key]],
          preload: true,
          volume: 0.7,
        });
      }
    }
  }

  play(key: SoundKey) {
    const h = this.pool[key];
    if (h) {
      h.play();
    }
    // If not loaded yet (audio files are stubs), silently ignore
  }

  startAmbient() {
    const h = this.pool["ambient-hum"];
    if (h && this.ambientId === null) {
      this.ambientId = h.play() as number;
      h.loop(true);
      h.volume(0.25);
    }
  }

  stopAmbient() {
    const h = this.pool["ambient-hum"];
    if (h && this.ambientId !== null) {
      h.stop(this.ambientId);
      this.ambientId = null;
    }
  }

  setMasterVolume(v: number) {
    Howler.volume(v);
  }
}

export const AudioManager = new AudioManagerClass();
