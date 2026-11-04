/**
 * One-off generator: synthesizes a loud, cheerful celebration fanfare and
 * writes it as a 16-bit PCM WAV to assets/sounds/streak-fanfare.wav.
 * The clip is designed to loop cleanly while the streak popup is open.
 * Run once, then delete.
 */
const fs = require("fs");
const path = require("path");

const SR = 44100; // sample rate
const DUR = 3.84; // seconds — loops back to the pickup cleanly
const N = Math.floor(SR * DUR);
const buf = new Float32Array(N);

// Additive synth note: attack + exponential decay envelope.
function note(freq, start, len, gain, type) {
    const s0 = Math.floor(start * SR);
    const s1 = Math.min(N, Math.floor((start + len) * SR));
    for (let i = s0; i < s1; i++) {
        const t = (i - s0) / SR;
        const tt = t / len;
        const env = Math.min(1, t * 80) * Math.exp(-2.6 * tt);
        let v;
        if (type === "bass") {
            v = Math.sin(2 * Math.PI * freq * t) * 0.85 + Math.sin(4 * Math.PI * freq * t) * 0.15;
        } else if (type === "sparkle") {
            v = Math.sin(2 * Math.PI * freq * t) * (0.6 + 0.4 * Math.sin(40 * Math.PI * t));
        } else {
            // bell-ish lead: fundamental + harmonics
            v =
                Math.sin(2 * Math.PI * freq * t) * 0.62 +
                Math.sin(4 * Math.PI * freq * t) * 0.24 +
                Math.sin(6 * Math.PI * freq * t) * 0.1;
        }
        buf[i] += v * gain * env;
    }
}

const C3 = 130.81, E3 = 164.81, G3 = 196.0;
const C5 = 523.25, E5 = 659.25, G5 = 783.99;
const C6 = 1046.5, E6 = 1318.5, G6 = 1568.0;

// --- Melody: rising fanfare ---
note(C5, 0.0, 0.18, 0.5, "lead");
note(E5, 0.18, 0.18, 0.5, "lead");
note(G5, 0.36, 0.18, 0.52, "lead");
note(C6, 0.36, 0.44, 0.6, "lead");
note(G5, 0.86, 0.18, 0.5, "lead");
note(C6, 1.04, 0.18, 0.55, "lead");
note(E6, 1.22, 0.44, 0.6, "lead");
note(C6, 1.7, 0.18, 0.55, "lead");
note(E6, 1.88, 0.18, 0.55, "lead");
note(G6, 2.06, 0.6, 0.62, "lead");
// Final sustained tonic chord
note(C6, 2.74, 1.05, 0.4, "lead");
note(E6, 2.74, 1.05, 0.34, "lead");
note(G6, 2.74, 1.05, 0.3, "lead");

// --- Bass line ---
note(C3, 0.0, 0.5, 0.5, "bass");
note(G3, 0.5, 0.5, 0.45, "bass");
note(E3, 1.0, 0.5, 0.45, "bass");
note(G3, 1.5, 0.5, 0.45, "bass");
note(C3, 2.0, 0.7, 0.5, "bass");
note(C3, 2.74, 1.05, 0.55, "bass");

// --- Sparkle blips (high bells) ---
const sparkles = [
    [0.42, 2093], [0.78, 2637], [1.12, 2093], [1.52, 2794],
    [1.98, 2093], [2.34, 3136], [2.86, 2093], [3.12, 2637],
];
for (const [st, f] of sparkles) note(f, st, 0.12, 0.12, "sparkle");

// Normalize to a loud (but clip-free) peak.
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
const norm = 0.92 / peak;
for (let i = 0; i < N; i++) buf[i] *= norm;

// --- Write 16-bit mono PCM WAV ---
const dataSize = N * 2;
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + dataSize, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16); // PCM chunk size
header.writeUInt16LE(1, 20); // PCM format
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write("data", 36);
header.writeUInt32LE(dataSize, 40);

const pcm = Buffer.alloc(dataSize);
for (let i = 0; i < N; i++) {
    const s = Math.max(-1, Math.min(1, buf[i]));
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
}

const outDir = path.join(__dirname, "..", "assets", "sounds");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "streak-fanfare.wav"), Buffer.concat([header, pcm]));
console.log("Wrote assets/sounds/streak-fanfare.wav (" + DUR + "s, " + (dataSize / 1024).toFixed(0) + " KB)");