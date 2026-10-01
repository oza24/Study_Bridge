"use client";

import { useState } from "react";
import { BookOpen, Headphones, Loader2, Sparkles, Brain, Code, Settings } from "lucide-react";

export default function Home() {
  const [text, setText] = useState("");
  const [targetLang, setTargetLang] = useState("English");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const samples = [
    {
      title: "Ohm's Law",
      content: "Ohm's law states that the current through a conductor between two points is directly proportional to the voltage across the two points. Introducing the constant of proportionality, the resistance, one arrives at the usual mathematical equation that describes this relationship: I = V/R, where I is the current in amperes, V is the voltage in volts, and R is the resistance in ohms."
    },
    {
      title: "Virtual Memory",
      content: `In computing, virtual memory is a memory management technique that provides an "idealized abstraction of the storage resources that are actually available on a given machine" which "creates the illusion to users of a very large (main) memory". It maps memory addresses used by a program, called virtual addresses, into physical addresses in computer memory.`
    }
  ];

  const handleProcess = async () => {
    if (!text) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLang }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        alert(`Server Error: ${data.error} (${data.name})`);
      }
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Background Decorators */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-900/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/10 blur-[120px]" />
      </div>

      <main className="relative max-w-5xl mx-auto px-6 py-16 flex flex-col gap-12">

        {/* Header */}
        <header className="flex flex-col items-center text-center gap-4 animate-fade-in-up">
          <div className="inline-flex items-center justify-center p-3 sm:p-4 rounded-3xl bg-white/5 border border-white/10 shadow-2xl backdrop-blur-xl mb-2">
            <Brain className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-br from-white via-white/90 to-white/40 bg-clip-text text-transparent">
            StudyBridge
          </h1>
          <p className="text-zinc-400 text-lg sm:text-xl max-w-2xl font-light">
            Deconstruct complex STEM concepts into simplified explanations, interactive flashcards, and native-voice audio.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <section className="flex flex-col gap-6 p-6 sm:p-8 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-md shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative flex justify-between items-center">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                Source Text
              </h2>
              <div className="flex gap-2">
                {samples.map((s, i) => (
                  <button key={i} onClick={() => setText(s.content)} className="text-xs px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 transition-colors">
                    {s.title}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              className="relative w-full h-48 bg-black/40 border border-white/10 rounded-2xl p-4 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all custom-scrollbar"
              placeholder="Paste your dense technical text here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            <div className="relative flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 w-full flex flex-col gap-2">
                <label className="text-sm text-zinc-400 flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Target Language
                </label>
                <div className="relative w-full">
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none"
                  >
                    <option value="English">US English (Ruth)</option>
                    <option value="Spanish">Spanish (Lucia)</option>
                    <option value="Hindi">Hindi (Kajal)</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                    ▼
                  </div>
                </div>
              </div>
              <button
                onClick={handleProcess}
                disabled={!text || loading}
                className="w-full sm:w-auto h-[52px] px-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl font-medium tracking-wide shadow-lg shadow-indigo-500/20 transition-all flex justify-center items-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {loading ? "Processing..." : "Synthesize"}
              </button>
            </div>
            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg border border-red-400/20 break-words">
                {error}
              </div>
            )}
          </section>

          {/* Results Section */}
          <section className="flex flex-col gap-6 p-6 sm:p-8 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-md shadow-2xl relative w-full h-[600px] overflow-y-auto custom-scrollbar">
            {!result && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4">
                <Brain className="w-16 h-16 opacity-20" />
                <p>AI Synthesis will appear here.</p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <p className="animate-pulse">Abstracting concepts...</p>
              </div>
            )}

            {result && !loading && (
              <div className="flex flex-col gap-8 animate-fade-in">
                {/* Audio Player */}
                {result.audioUrl && (
                  <div className="bg-black/40 border border-white/10 p-5 rounded-2xl flex flex-col gap-4">
                    <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                      <Headphones className="w-4 h-4 text-blue-400" />
                      Audio Synthesis
                    </h3>
                    <audio controls className="w-full h-12 rounded-lg opacity-90 invert hue-rotate-180 sepia-0">
                      <source src={result.audioUrl} type="audio/mpeg" />
                    </audio>
                  </div>
                )}

                {/* Explanation */}
                {result.simplifiedExplanation && (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      Simplified Translation
                    </h3>
                    <p className="text-zinc-200 leading-relaxed text-lg bg-white/5 p-5 rounded-2xl border border-white/5">
                      {result.simplifiedExplanation}
                    </p>
                  </div>
                )}

                {/* Flashcards */}
                {result.flashcards && result.flashcards.length > 0 && (
                  <div className="flex flex-col gap-4">
                    <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                      <Code className="w-4 h-4 text-pink-400" />
                      Active Recall Flashcards
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                      {result.flashcards.map((fc: any, i: number) => (
                        <Flashcard key={i} fc={fc} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Flashcard({ fc }: { fc: any }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      onClick={() => setFlipped(!flipped)}
      className="relative w-full min-h-[160px] cursor-pointer group perspective-1000"
    >
      <div className={`w-full h-full transition-all duration-500 transform-style-3d ${flipped ? "rotate-y-180" : ""}`}>
        {/* Front */}
        <div className={`absolute inset-0 w-full h-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl p-6 flex flex-col justify-center items-center text-center backface-hidden transition-colors`}>
          <span className="text-xs uppercase tracking-widest text-indigo-400 mb-4 opacity-70">Question — Click to flip</span>
          <p className="text-zinc-200 font-medium text-lg">{fc.q}</p>
        </div>
        {/* Back */}
        <div className={`absolute inset-0 w-full h-full bg-indigo-600/20 border border-indigo-500/30 rounded-2xl p-6 flex flex-col justify-center items-center text-center backface-hidden rotate-y-180`}>
          <span className="text-xs uppercase tracking-widest text-indigo-300 mb-2 opacity-70">Answer</span>
          <p className="text-white font-medium">{fc.a}</p>
          {fc.hint && <p className="text-indigo-200/60 text-xs mt-3 mt-auto">Hint: {fc.hint}</p>}
        </div>
      </div>
    </div>
  );
}
