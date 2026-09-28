import React from 'react'

type TrendPoint = {
  date: string
  revenue: number
  costs: number
  profit: number
}

type CostCategory = {
  category: string
  cost: number
  count: number
}

type TrendChartProps = {
  data: TrendPoint[]
}

const chartWidth = 720
const chartHeight = 260
const chartPadding = { top: 18, right: 18, bottom: 38, left: 48 }

function buildSeriesPath(values: number[], maxValue: number) {
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom
  return values.map((value, index) => {
    const x = chartPadding.left + (index / Math.max(values.length - 1, 1)) * plotWidth
    const y = chartPadding.top + plotHeight - (value / maxValue) * plotHeight
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value)
}

export function TrendAnalysisChart({ data }: TrendChartProps) {
  if (!data.length) {
    return <div className="chart-empty">Zaimportuj raporty, aby zobaczyć trend dzienny.</div>
  }

  const maxValue = Math.max(1, ...data.flatMap((point) => [point.revenue, point.costs]))
  const revenuePath = buildSeriesPath(data.map((point) => point.revenue), maxValue)
  const costsPath = buildSeriesPath(data.map((point) => point.costs), maxValue)
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom
  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])]

  return (
    <div className="trend-chart-wrap">
      <div className="chart-legend" aria-label="Legenda wykresu">
        <span><i className="legend-dot legend-revenue" />Przychód</span>
        <span><i className="legend-dot legend-cost" />Koszty netto</span>
      </div>
      <div className="trend-chart-scroll">
        <svg className="trend-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Dzienny trend przychodu i kosztów">
          <defs>
            <linearGradient id="revenue-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ff7a1a" stopOpacity=".22" />
              <stop offset="100%" stopColor="#ff7a1a" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((step) => {
            const y = chartPadding.top + (plotHeight / 3) * step
            const label = formatCurrency(maxValue * (1 - step / 3))
            return (
              <g key={step}>
                <line className="chart-grid-line" x1={chartPadding.left} x2={chartWidth - chartPadding.right} y1={y} y2={y} />
                <text className="chart-axis-label" x={chartPadding.left - 8} y={y + 4} textAnchor="end">{label}</text>
              </g>
            )
          })}
          <path
            className="chart-area-revenue"
            d={`${revenuePath} L ${chartPadding.left + plotWidth} ${chartPadding.top + plotHeight} L ${chartPadding.left} ${chartPadding.top + plotHeight} Z`}
          />
          <path className="chart-line chart-line-revenue" d={revenuePath} />
          <path className="chart-line chart-line-cost" d={costsPath} />
          {data.map((point, index) => {
            const x = chartPadding.left + (index / Math.max(data.length - 1, 1)) * plotWidth
            const revenueY = chartPadding.top + plotHeight - (point.revenue / maxValue) * plotHeight
            const costY = chartPadding.top + plotHeight - (point.costs / maxValue) * plotHeight
            return (
              <g key={`${point.date}-${index}`}>
                <circle className="chart-point chart-point-revenue" cx={x} cy={revenueY} r="3">
                  <title>{`${point.date}: przychód ${point.revenue.toFixed(2)} PLN`}</title>
                </circle>
                <circle className="chart-point chart-point-cost" cx={x} cy={costY} r="3">
                  <title>{`${point.date}: koszty ${point.costs.toFixed(2)} PLN`}</title>
                </circle>
              </g>
            )
          })}
          {labelIndexes.map((index) => {
            const x = chartPadding.left + (index / Math.max(data.length - 1, 1)) * plotWidth
            return <text key={data[index].date} className="chart-axis-label" x={x} y={chartHeight - 10} textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}>{data[index].date.slice(5)}</text>
          })}
        </svg>
      </div>
    </div>
  )
}

type OrderStatusDonutProps = {
  active: number
  cancelled: number
}

export function OrderStatusDonut({ active, cancelled }: OrderStatusDonutProps) {
  const total = active + cancelled
  if (!total) return <div className="chart-empty">Brak zaimportowanych zamówień.</div>

  const radius = 52
  const circumference = 2 * Math.PI * radius
  const activeLength = (active / total) * circumference
  const cancelledLength = circumference - activeLength
  const cancelledPercent = Math.round((cancelled / total) * 100)

  return (
    <div className="status-chart-layout">
      <div className="status-donut-wrap">
        <svg className="status-donut" viewBox="0 0 140 140" role="img" aria-label={`${active} aktywnych i ${cancelled} anulowanych zamówień`}>
          <circle className="donut-track" cx="70" cy="70" r={radius} />
          <circle className="donut-active" cx="70" cy="70" r={radius} strokeDasharray={`${activeLength} ${circumference}`} />
          <circle className="donut-cancelled" cx="70" cy="70" r={radius} strokeDasharray={`${cancelledLength} ${circumference}`} strokeDashoffset={-activeLength} />
          <text className="donut-total" x="70" y="68" textAnchor="middle">{total}</text>
          <text className="donut-caption" x="70" y="87" textAnchor="middle">zamówień</text>
        </svg>
      </div>
      <div className="status-breakdown">
        <div className="status-breakdown-row">
          <span className="legend-dot legend-active" />
          <span>Aktywne</span>
          <strong>{active}</strong>
        </div>
        <div className="status-breakdown-row">
          <span className="legend-dot legend-cancelled" />
          <span>Anulowane</span>
          <strong>{cancelled}</strong>
        </div>
        <div className="status-cancel-rate">{cancelledPercent}% anulowanych</div>
      </div>
    </div>
  )
}

type CostCategoryChartProps = {
  data: CostCategory[]
}

export function CostCategoryChart({ data }: CostCategoryChartProps) {
  const categories = data.filter((category) => category.cost > 0).slice(0, 5)
  if (!categories.length) return <div className="chart-empty">Brak rozpoznanych kosztów do porównania.</div>

  const largestCost = Math.max(...categories.map((category) => category.cost))
  return (
    <div className="cost-category-chart">
      {categories.map((category) => (
        <div className="cost-category-row" key={category.category}>
          <div className="cost-category-heading">
            <span>{category.category || 'Pozostałe'}</span>
            <strong>{category.cost.toFixed(2)} PLN</strong>
          </div>
          <div className="cost-category-track" role="img" aria-label={`${category.category}: ${category.cost.toFixed(2)} zł`}>
            <div className="cost-category-fill" style={{ width: `${Math.max(4, (category.cost / largestCost) * 100)}%` }} />
          </div>
          <div className="cost-category-count">{category.count} operacji</div>
        </div>
      ))}
    </div>
  )
}
