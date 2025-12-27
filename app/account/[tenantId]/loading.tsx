export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header Skeleton */}
      <div className="mb-8 animate-pulse">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 bg-gray-200 rounded" />
          <div className="w-20 h-4 bg-gray-200 rounded" />
        </div>
        <div className="h-8 w-48 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>

      {/* Subscription Card Skeleton */}
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 animate-pulse">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="h-6 w-24 bg-gray-200 rounded mb-2" />
              <div className="h-4 w-16 bg-gray-200 rounded" />
            </div>
            <div className="h-10 w-10 bg-gray-200 rounded-full" />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between">
              <div className="h-4 w-20 bg-gray-200 rounded" />
              <div className="h-4 w-24 bg-gray-200 rounded" />
            </div>
            <div className="flex justify-between">
              <div className="h-4 w-24 bg-gray-200 rounded" />
              <div className="h-4 w-28 bg-gray-200 rounded" />
            </div>
            <div className="flex justify-between">
              <div className="h-4 w-16 bg-gray-200 rounded" />
              <div className="h-4 w-20 bg-gray-200 rounded" />
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 flex gap-3">
            <div className="h-10 flex-1 bg-gray-200 rounded-lg" />
            <div className="h-10 flex-1 bg-gray-200 rounded-lg" />
          </div>
        </div>

        {/* Card List Skeleton */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 animate-pulse">
          <div className="h-6 w-28 bg-gray-200 rounded mb-4" />
          <div className="flex items-center gap-4">
            <div className="w-12 h-8 bg-gray-200 rounded" />
            <div>
              <div className="h-4 w-32 bg-gray-200 rounded mb-1" />
              <div className="h-3 w-20 bg-gray-200 rounded" />
            </div>
          </div>
        </div>

        {/* Payment History Skeleton */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 animate-pulse">
          <div className="h-6 w-24 bg-gray-200 rounded mb-4" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-gray-200 rounded-full" />
                  <div>
                    <div className="h-4 w-32 bg-gray-200 rounded mb-1" />
                    <div className="h-3 w-24 bg-gray-200 rounded" />
                  </div>
                </div>
                <div className="h-4 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
