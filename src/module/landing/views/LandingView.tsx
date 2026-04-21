import Link from "next/link";

export function LandingView() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-white icon-filled">
          book_2
        </span>
      </div>
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
        NotebookLM
      </h1>
      <p className="max-w-xl text-gray-600 dark:text-gray-400 mb-8">
        Upload your sources, ask questions, and generate studio outputs —
        grounded entirely in your own material.
      </p>
      <Link
        href="/notebooks"
        className="px-6 py-3 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
      >
        Open my notebooks
      </Link>
    </main>
  );
}
