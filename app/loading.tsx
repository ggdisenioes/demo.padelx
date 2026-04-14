export default function Loading() {
  return (
    <main className="min-h-[60vh] bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-8 w-48 rounded-lg bg-gray-200 animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 rounded-2xl bg-white shadow-sm border border-gray-100 p-4">
              <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
              <div className="mt-4 h-8 w-14 rounded bg-gray-200 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-80 rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
          <div className="h-5 w-32 rounded bg-gray-200 animate-pulse" />
          <div className="mt-6 space-y-3">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
