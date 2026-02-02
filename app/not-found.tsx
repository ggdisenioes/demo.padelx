import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
        <h1 className="text-2xl font-semibold text-white">Página no encontrada</h1>
        <p className="mt-2 text-sm text-white/70">
          La URL que intentaste abrir no existe o fue movida.
        </p>

        <div className="mt-6 flex gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#07fdbb] px-4 py-2 text-sm font-semibold text-[#010e35] hover:opacity-90"
          >
            Ir al inicio
          </Link>

          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            Ir al panel
          </Link>
        </div>
      </div>
    </main>
  );
}