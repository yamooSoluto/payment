export default function AdminLoading() {
  return (
    <div className="animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-40 bg-gray-200 rounded" />
        <div className="flex gap-2">
          <div className="h-9 w-24 bg-gray-200 rounded-lg" />
          <div className="h-9 w-24 bg-gray-200 rounded-lg" />
        </div>
      </div>

      {/* Search & Filter Skeleton */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-64 bg-gray-200 rounded-lg" />
        <div className="h-10 w-20 bg-gray-200 rounded-lg" />
      </div>

      {/* Table Skeleton */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="flex items-center gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200">
          {[80, 120, 160, 100, 80, 100, 80].map((w, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded" style={{ width: w }} />
          ))}
        </div>

        {/* Table Rows */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100">
            {[80, 120, 160, 100, 80, 100, 80].map((w, j) => (
              <div key={j} className="h-4 bg-gray-200 rounded" style={{ width: w }} />
            ))}
          </div>
        ))}

        {/* Pagination Skeleton */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="flex gap-2">
            <div className="h-8 w-8 bg-gray-200 rounded" />
            <div className="h-8 w-8 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
