import { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapPin {
  id: number | string
  lat: number
  lon: number
  label: string
  detail?: string
  /** A pin whose position is not live, drawn faded. */
  faded?: boolean
  colour?: string
}

interface Props {
  pins?: MapPin[]
  /** A route drawn as a line, in order. */
  route?: { lat: number; lon: number }[]
  height?: number
}

const PIN_COLOUR = '#7C3AED'

/**
 * OpenStreetMap through Leaflet. Pins are plain circles (no marker images to
 * bundle) with the name on hover. Refits only when the set of pins or the
 * route changes, so a refresh does not throw away a pan or zoom.
 */
const TrackingMap = ({ pins = [], route = [], height = 340 }: Props) => {
  const element = useRef<HTMLDivElement | null>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const fittedFor = useRef('')

  useEffect(() => {
    if (!element.current) return undefined
    const created = L.map(element.current, { zoomControl: true, attributionControl: true }).setView([30.3753, 69.3451], 5)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(created)
    layer.current = L.layerGroup().addTo(created)
    map.current = created
    return () => {
      created.remove()
      map.current = null
      layer.current = null
      fittedFor.current = ''
    }
  }, [])

  useEffect(() => {
    const current = map.current
    const group = layer.current
    if (!current || !group) return
    group.clearLayers()
    const bounds: L.LatLngExpression[] = []
    if (route.length > 1) {
      const line = route.map((point) => [point.lat, point.lon] as L.LatLngTuple)
      L.polyline(line, { color: PIN_COLOUR, weight: 4, opacity: 0.75 }).addTo(group)
      L.circleMarker(line[0], { radius: 6, color: '#059669', fillColor: '#10B981', fillOpacity: 1 }).bindTooltip('Start').addTo(group)
      bounds.push(...line)
    }
    pins.forEach((pin) => {
      L.circleMarker([pin.lat, pin.lon], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: pin.colour || PIN_COLOUR,
        fillOpacity: pin.faded ? 0.45 : 1,
      })
        .bindTooltip(pin.detail ? `<strong>${escapeHtml(pin.label)}</strong><br/>${escapeHtml(pin.detail)}` : escapeHtml(pin.label))
        .addTo(group)
      bounds.push([pin.lat, pin.lon])
    })
    const signature = JSON.stringify([pins.map((pin) => pin.id), route.length])
    if (bounds.length && signature !== fittedFor.current) {
      fittedFor.current = signature
      current.fitBounds(L.latLngBounds(bounds), { padding: [32, 32], maxZoom: 15 })
    }
  }, [pins, route])

  return (
    <Box
      ref={element}
      data-testid="tracking-map"
      sx={{ height, width: '100%', borderRadius: '18px', overflow: 'hidden', border: '1px solid #E9E5FF', zIndex: 0 }}
    />
  )
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string))

export default TrackingMap
