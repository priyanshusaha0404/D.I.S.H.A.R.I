"use client";
/** The assistant's face: a Royal Bengal tiger that breathes, blinks, twitches its ears and roars. */
import { useEffect, useId, useState } from "react";

export function Tiger({ size = 48, roar = 0, className = "" }: { size?: number; roar?: number; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const [roaring, setRoaring] = useState(false);
  useEffect(() => {
    if (!roar) return;
    setRoaring(true);
    const t = setTimeout(() => setRoaring(false), 1500);
    return () => clearTimeout(t);
  }, [roar]);
  const id = (k: string) => `${k}${uid}`;
  const u = (k: string) => `url(#${k}${uid})`;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={`tiger ${roaring ? "roaring" : ""} ${className}`} aria-hidden="true">
      <defs>
        <radialGradient id={id("fur")} cx="50%" cy="38%" r="65%"><stop offset="0" stopColor="#f6a24a" /><stop offset=".45" stopColor="#e57f22" /><stop offset=".8" stopColor="#c4600f" /><stop offset="1" stopColor="#8f3f08" /></radialGradient>
        <radialGradient id={id("ear")} cx="50%" cy="60%" r="60%"><stop offset="0" stopColor="#d9731c" /><stop offset="1" stopColor="#6b2e06" /></radialGradient>
        <radialGradient id={id("iris")} cx="45%" cy="40%" r="60%"><stop offset="0" stopColor="#fff3b0" /><stop offset=".45" stopColor="#f5c542" /><stop offset="1" stopColor="#b9770e" /></radialGradient>
        <linearGradient id={id("white")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fffdf8" /><stop offset="1" stopColor="#ece3d4" /></linearGradient>
        <linearGradient id={id("nose")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9786d" /><stop offset="1" stopColor="#8e3b35" /></linearGradient>
        <filter id={id("rough")} x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" /><feDisplacementMap in="SourceGraphic" scale="2.6" /></filter>
        <filter id={id("soft")} x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="2" /><feDisplacementMap in="SourceGraphic" scale="1.6" /></filter>
      </defs>
      <g className="tg-rings"><circle cx="60" cy="64" r="50" /><circle cx="60" cy="64" r="50" /></g>
      <g className="tg-head">
        {/* ears: dark backs with the white spot, pale fur inside */}
        <g className="tg-ear tg-ear-l" filter={u("soft")}>
          <path d="M14 38 C8 24 14 10 28 9 C38 9 44 16 44 22 C36 24 24 30 14 38Z" fill={u("ear")} />
          <path d="M20 31 C17 22 21 15 29 15 C35 15 38 19 38 22 C31 24 25 27 20 31Z" fill="#f4e6cf" />
          <path d="M15 37 C9 24 15 10 28 9" fill="none" stroke="#1a0d05" strokeWidth="3" strokeLinecap="round" />
        </g>
        <g className="tg-ear tg-ear-r" filter={u("soft")}>
          <path d="M106 38 C112 24 106 10 92 9 C82 9 76 16 76 22 C84 24 96 30 106 38Z" fill={u("ear")} />
          <path d="M100 31 C103 22 99 15 91 15 C85 15 82 19 82 22 C89 24 95 27 100 31Z" fill="#f4e6cf" />
          <path d="M105 37 C111 24 105 10 92 9" fill="none" stroke="#1a0d05" strokeWidth="3" strokeLinecap="round" />
        </g>
        {/* white cheek ruff behind the face */}
        <path filter={u("rough")} fill={u("white")} d="M14 56 C4 66 2 80 10 90 C8 82 14 80 16 84 C16 94 26 104 38 108 C34 102 36 100 40 103 C48 110 72 110 80 103 C84 100 86 102 82 108 C94 104 104 94 104 84 C106 80 112 82 110 90 C118 80 116 66 106 56 Z" />
        {/* face */}
        <path filter={u("soft")} fill={u("fur")} d="M60 15 C84 15 100 28 104 46 C108 56 108 70 102 80 C96 92 84 100 72 103 L60 105 L48 103 C36 100 24 92 18 80 C12 70 12 56 16 46 C20 28 36 15 60 15Z" />
        {/* white above the eyes, on the muzzle and chin */}
        <g fill={u("white")} filter={u("soft")}>
          <path d="M33 40 C38 34 48 34 53 41 C47 41 40 42 33 46Z" />
          <path d="M87 40 C82 34 72 34 67 41 C73 41 80 42 87 46Z" />
          <path d="M26 68 C30 62 38 62 42 66 C40 74 34 80 26 80 C24 76 24 72 26 68Z" />
          <path d="M94 68 C90 62 82 62 78 66 C80 74 86 80 94 80 C96 76 96 72 94 68Z" />
        </g>
        {/* stripes */}
        <g fill="#140a04" filter={u("rough")}>
          <path d="M54 18 C56 24 64 24 66 18 C63 21 57 21 54 18Z" />
          <path d="M50 24 C54 32 66 32 70 24 C65 28 55 28 50 24Z" />
          <path d="M53 31 C56 37 64 37 67 31 C63 34 57 34 53 31Z" />
          <path d="M57 37 C58 41 62 41 63 37 C61 39 59 39 57 37Z" />
          <path d="M40 22 C44 26 46 32 44 37 C42 32 38 28 34 26Z" /><path d="M80 22 C76 26 74 32 76 37 C78 32 82 28 86 26Z" />
          <path d="M30 30 C34 34 36 39 34 44 C32 40 28 36 24 35Z" /><path d="M90 30 C86 34 84 39 86 44 C88 40 92 36 96 35Z" />
          <path d="M13 52 C22 52 30 56 34 62 C27 59 20 58 13 59Z" /><path d="M107 52 C98 52 90 56 86 62 C93 59 100 58 107 59Z" />
          <path d="M13 64 C20 64 25 67 27 71 C22 69 17 69 13 70Z" /><path d="M107 64 C100 64 95 67 93 71 C98 69 103 69 107 70Z" />
          <path d="M18 78 C24 77 29 80 30 84 C26 82 22 82 19 83Z" /><path d="M102 78 C96 77 91 80 90 84 C94 82 98 82 101 83Z" />
          <path d="M44 62 C42 66 38 69 34 70 C38 66 40 63 41 59Z" /><path d="M76 62 C78 66 82 69 86 70 C82 66 80 63 79 59Z" />
        </g>
        {/* eyes: amber with round pupils and dark lining */}
        <g className="tg-eyes">
          <path d="M37 51 C41 46 50 46 54 51 C50 55 42 56 37 51Z" fill={u("iris")} />
          <path d="M83 51 C79 46 70 46 66 51 C70 55 78 56 83 51Z" fill={u("iris")} />
          <g className="tg-iris">
            <circle cx="46" cy="50.6" r="2.7" fill="#0a0503" /><circle cx="74" cy="50.6" r="2.7" fill="#0a0503" />
            <circle cx="47.2" cy="49.4" r=".9" fill="#fff" /><circle cx="75.2" cy="49.4" r=".9" fill="#fff" />
          </g>
          <g fill="none" stroke="#0a0503" strokeLinecap="round">
            <path d="M36 51 C41 45.5 50 45.5 55 51 C50 56 42 56.5 36 51Z" strokeWidth="1.6" />
            <path d="M84 51 C79 45.5 70 45.5 65 51 C70 56 78 56.5 84 51Z" strokeWidth="1.6" />
            <path d="M54 52 C55 56 55 60 54 63" strokeWidth="1.4" /><path d="M66 52 C65 56 65 60 66 63" strokeWidth="1.4" />
          </g>
          <g className="tg-lid"><path d="M35 51 C40 44.5 51 44.5 56 51 C50 50 42 50 35 51Z" fill="#d06f1a" transform="scale(1 1)" /><path d="M85 51 C80 44.5 69 44.5 64 51 C70 50 78 50 85 51Z" fill="#d06f1a" /></g>
        </g>
        {/* nose bridge and nose */}
        <path d="M54 44 C56 52 55 62 52 70 L68 70 C65 62 64 52 66 44 C62 46 58 46 54 44Z" fill="#f0a35a" opacity=".55" />
        <path d="M50 69 C55 65.5 65 65.5 70 69 C69 74 64 78 60 79 C56 78 51 74 50 69Z" fill={u("nose")} stroke="#3a1a10" strokeWidth="1" />
        <path d="M54 69 C57 67.6 63 67.6 66 69" fill="none" stroke="#f2a99f" strokeWidth="1.2" strokeLinecap="round" opacity=".8" />
        <path className="tg-chin" filter={u("soft")} fill={u("white")} d="M50 88 C54 92 66 92 70 88 C70 95 66 99 60 99 C54 99 50 95 50 88Z" />
        {/* the roar: open mouth with fangs */}
        <g className="tg-jaw">
          <path d="M41 85 C46 104 74 104 79 85 C72 88 48 88 41 85Z" fill="#5b0f12" />
          <path d="M48 96 C54 100 66 100 72 96 C66 94 54 94 48 96Z" fill="#c2414b" />
          <path d="M46 86 L48.5 95 L51 87Z M74 86 L71.5 95 L69 87Z" fill="#fffaf0" stroke="#d6cbb8" strokeWidth=".4" />
          <path d="M50 100 L51.5 94.5 L53.5 100.5Z M70 100 L68.5 94.5 L66.5 100.5Z" fill="#fffaf0" />
        </g>
        {/* muzzle pads, chin, whisker spots and whiskers */}
        <g className="tg-muzzle">
          <path filter={u("soft")} fill={u("white")} d="M60 79 C56 84 46 86 42 83 C36 80 36 72 42 70 C48 68 54 72 60 79 C66 72 72 68 78 70 C84 72 84 80 78 83 C74 86 64 84 60 79Z" />
          <g fill="#2a160c"><circle cx="45" cy="75" r=".8" /><circle cx="48" cy="78" r=".8" /><circle cx="44" cy="79" r=".8" /><circle cx="49" cy="74" r=".8" /><circle cx="75" cy="75" r=".8" /><circle cx="72" cy="78" r=".8" /><circle cx="76" cy="79" r=".8" /><circle cx="71" cy="74" r=".8" /></g>
          <path d="M60 79 L60 83 M60 83 C56 86 51 86 48 84 M60 83 C64 86 69 86 72 84" fill="none" stroke="#1a0d05" strokeWidth="1.3" strokeLinecap="round" className="tg-smile" />
          <g stroke="#fffaf0" strokeWidth=".55" strokeLinecap="round" opacity=".85" fill="none">
            <path d="M40 76 C30 73 20 72 8 74" /><path d="M40 79 C30 79 20 80 9 83" /><path d="M41 82 C33 84 24 87 14 92" />
            <path d="M80 76 C90 73 100 72 112 74" /><path d="M80 79 C90 79 100 80 111 83" /><path d="M79 82 C87 84 96 87 106 92" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** a short synthesised tiger roar (a low growl) — plays only after the person has tapped something */
let ctx: AudioContext | null = null;
export function roarSound(volume = 0.35) {
  try {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const c = ctx, t0 = c.currentTime + 0.02, dur = 1.25;
    const out = c.createGain(); out.gain.value = volume; out.connect(c.destination);
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(520, t0); lp.frequency.linearRampToValueAtTime(1100, t0 + 0.25); lp.frequency.exponentialRampToValueAtTime(300, t0 + dur); lp.Q.value = 6; lp.connect(out);
    const env = c.createGain(); env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(1, t0 + 0.12); env.gain.setValueAtTime(1, t0 + 0.45); env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); env.connect(lp);
    // two detuned saws for the voice, a slow wobble for the growl
    for (const [f, type] of [[92, "sawtooth"], [138, "square"]] as [number, OscillatorType][]) {
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f * 0.8, t0); o.frequency.linearRampToValueAtTime(f * 1.25, t0 + 0.28); o.frequency.exponentialRampToValueAtTime(f * 0.62, t0 + dur);
      const wob = c.createOscillator(); wob.frequency.value = 23; const wg = c.createGain(); wg.gain.value = f * 0.18; wob.connect(wg); wg.connect(o.frequency);
      const g = c.createGain(); g.gain.value = type === "square" ? 0.25 : 0.6; o.connect(g); g.connect(env);
      o.start(t0); wob.start(t0); o.stop(t0 + dur + 0.05); wob.stop(t0 + dur + 0.05);
    }
    // breath noise
    const n = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    const src = c.createBufferSource(); src.buffer = n; const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 380; bp.Q.value = 0.8;
    const ng = c.createGain(); ng.gain.value = 0.55; src.connect(bp); bp.connect(ng); ng.connect(env); src.start(t0); src.stop(t0 + dur);
  } catch { /* no audio on this device */ }
}
