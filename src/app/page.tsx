import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Voice Interview Agent</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          A low-latency, speech-to-speech agent that answers job interviews on
          Rithwik&apos;s behalf — grounded in his real resume — and improves itself
          after every session.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/interview"
          className="rounded-xl border border-neutral-200 p-6 transition hover:border-black dark:border-neutral-800 dark:hover:border-white"
        >
          <h2 className="text-lg font-semibold">🎙️ Start an interview →</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Open the call UI, allow your mic, and talk to the agent in real time.
          </p>
        </Link>
        <Link
          href="/review"
          className="rounded-xl border border-neutral-200 p-6 transition hover:border-black dark:border-neutral-800 dark:hover:border-white"
        >
          <h2 className="text-lg font-semibold">📈 Review &amp; improve →</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Analyze past sessions and apply self-improvement prompt patches.
          </p>
        </Link>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        <p className="font-medium text-neutral-800 dark:text-neutral-200">How it works</p>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>Browser connects directly to OpenAI Realtime over WebRTC (lowest latency).</li>
          <li>Your prompt + resume are bound to a server-minted ephemeral token.</li>
          <li>Both sides are transcribed; the transcript is saved on end.</li>
          <li>A coach agent critiques it and proposes a versioned prompt upgrade.</li>
        </ol>
      </div>
    </main>
  );
}
