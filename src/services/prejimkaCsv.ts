export type PrejimkaEvent = {
  type: string
  time: string
  position: string | null
  spz: string | null
}

export type PrejimkaPoint = {
  time: string
  position: string | null
}

function wgs(position: string | null): string {
  const match = position?.match(/^\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*\)$/)
  if (!match) throw new Error('Chybí platné GPS souřadnice.')
  return `N${match[1]},E${match[2]}`
}

export function createPrejimkaCsv(orderNumber: string, events: PrejimkaEvent[], points: PrejimkaPoint[], distance: string | number) {
  if (!events.length) throw new Error('Chybí servisní body zakázky.')
  const fields = [orderNumber, orderNumber, events[0].spz ?? '']
  for (const event of events) {
    if (event.type === 'L') fields.push(event.time, wgs(event.position))
    if (event.type === 'U') fields.push(event.time)
  }
  fields.push(String(distance))
  const gps1 = fields.join(';')
  const gps2 = [`H;${orderNumber};${orderNumber}`, ...points.map(point => `${wgs(point.position)};${point.time}`)].join('\r\n')
  return { gps1, gps2 }
}
