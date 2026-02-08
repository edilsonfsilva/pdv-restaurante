import { useState, useEffect, useCallback } from 'react'

export default function usePagination(fetchFn, initialLimit = 20) {
  const [page, setPage] = useState(1)
  const [limit] = useState(initialLimit)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const result = await fetchFn({ page, limit })

      // Support both { data, total, totalPages } and { rows, total, totalPages } response shapes
      const items = result.data || result.rows || result.items || []
      const totalCount = result.total || 0
      const pages = result.totalPages || result.total_pages || Math.ceil(totalCount / limit)

      setData(items)
      setTotal(totalCount)
      setTotalPages(pages)
    } catch (err) {
      console.error('Erro ao carregar dados paginados:', err)
      setData([])
    } finally {
      setLoading(false)
    }
  }, [fetchFn, page, limit])

  // Re-fetch when page changes
  useEffect(() => {
    fetchData()
  }, [fetchData])

  const goToPage = useCallback((newPage) => {
    setPage(Math.max(1, Math.min(newPage, totalPages || 1)))
  }, [totalPages])

  const nextPage = useCallback(() => {
    setPage((prev) => Math.min(prev + 1, totalPages || 1))
  }, [totalPages])

  const prevPage = useCallback(() => {
    setPage((prev) => Math.max(prev - 1, 1))
  }, [])

  const refresh = useCallback(() => {
    fetchData()
  }, [fetchData])

  return {
    page,
    limit,
    total,
    totalPages,
    data,
    loading,
    goToPage,
    nextPage,
    prevPage,
    refresh,
  }
}
