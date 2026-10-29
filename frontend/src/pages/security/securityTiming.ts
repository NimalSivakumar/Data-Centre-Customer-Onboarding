import type { SecurityVisitor } from '../../types/api'
import { getSiteSettings } from '../../api/siteSettings'

type ScheduledVisitor = Pick<SecurityVisitor, 'visit_date' | 'expected_arrival_time' | 'expected_departure_time'>

function siteClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: getSiteSettings().site_timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    seconds: Number(part('hour')) * 3600 + Number(part('minute')) * 60 + Number(part('second')) + now.getUTCMilliseconds() / 1000,
  }
}

function seconds(value: string) {
  const [hours, minutes, seconds = '0'] = value.split(':')
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

export function getSiteDate(now = new Date()) {
  return siteClock(now).date
}

export function getCheckInBlockReason(row: ScheduledVisitor, now = new Date()) {
  const clock = siteClock(now)
  if (clock.date !== row.visit_date) return 'Check-in is only allowed on the scheduled visit date'
  if (clock.seconds < seconds(row.expected_arrival_time)) return 'Check-in is not available before the expected arrival time'
  if (clock.seconds > seconds(row.expected_departure_time)) return 'Check-in is not available after the expected departure time'
  return ''
}

export function isScheduledToday(row: Pick<SecurityVisitor, 'visit_date'>, now = new Date()) {
  return getSiteDate(now) === row.visit_date
}
