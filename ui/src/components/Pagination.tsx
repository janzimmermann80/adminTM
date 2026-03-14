interface Props {
  total: number
  limit: number
  offset: number
  onChange: (offset: number) => void
}

export const Pagination = ({ total, limit, offset, onChange }: Props) => {
  const pages = Math.ceil(total / limit)
  const current = Math.floor(offset / limit)

  if (pages <= 1) return null

  const pageNums: (number | '...')[] = []
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - current) <= 2) {
      pageNums.push(i)
    } else if (pageNums[pageNums.length - 1] !== '...') {
      pageNums.push('...')
    }
  }

  return (
    <div className="flex items-center gap-1 mt-4 flex-wrap">
      <button
        onClick={() => onChange(Math.max(0, offset - limit))}
        disabled={current === 0}
        className="px-2 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-100"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {pageNums.map((p, i) =>
        p === '...' ? (
          <span key={`e${i}`} className="px-2 py-1 text-sm text-gray-400">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange((p as number) * limit)}
            className={`px-3 py-1 rounded border text-sm ${
              p === current
                ? 'bg-[#0a6b6b] text-white border-[#0a6b6b]'
                : 'hover:bg-gray-100'
            }`}
          >
            {(p as number) + 1}
          </button>
        )
      )}

      <button
        onClick={() => onChange(Math.min((pages - 1) * limit, offset + limit))}
        disabled={current >= pages - 1}
        className="px-2 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-100"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <span className="ml-2 text-sm text-gray-500">
        {offset + 1}–{Math.min(offset + limit, total)} z {total}
      </span>
    </div>
  )
}
