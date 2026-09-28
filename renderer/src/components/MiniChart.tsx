import React from 'react'

function buildPath(data: number[], w: number, h: number) {
  if (!data.length) return ''
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  return data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * w
    const y = h - ((v - min) / range) * h
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

export default function MiniChart({ data = [] as number[] }: { data?: number[] }) {
  const w = 120
  const h = 40
  const d = buildPath(data, w, h)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
      <path d={d} fill="none" stroke="#ff7a1a" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
