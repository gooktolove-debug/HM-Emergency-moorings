
import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default Leaflet icon paths
// eslint-disable-next-line no-underscore-dangle
// @ts-ignore

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

/**
 * Marker color rules
 * occupied -> red
 * available + availability_class=orange -> orange
 * available + normal -> green
 */
const makeIcon = (
  status,
  isHighlighted = false,
  availabilityClass = 'normal',
  isUserLocation = false
) => {
  if (isUserLocation) {
    return new L.DivIcon({
      className: '',
      html: `
        <div style="
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: #2563eb;
          border: 3px solid #ffffff;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25);
        "></div>
      `,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    })
  }

  const backgroundColor =
    status === 'occupied'
      ? '#dc2626'
      : availabilityClass === 'orange'
        ? '#f97316'
        : '#16a34a'

  const size = isHighlighted ? 24 : 18
  const border = isHighlighted ? '3px solid #fb923c' : '2px solid #ffffff'

  return new L.DivIcon({
    className: '',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 999px;
        background: ${backgroundColor};
        border: ${border};
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.28);
      "></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function MapClickHandler() {
  useMapEvents({
    click() {
      // disabled
    },
  })
  return null
}

function UserLocationMarker({ userLocation }) {
  if (!userLocation) return null

  return (
    <Marker
      position={[userLocation.lat, userLocation.lng]}
      icon={makeIcon('available', false, 'normal', true)}
    >
      <Popup>My current location</Popup>
    </Marker>
  )
}

function LeafletMap({
  pins,
  selectedPinId,
  onSelectPin,
  highlightedPinIds,
  userLocation,
  mapHeight,
}) {
  const defaultCenter = [-36.85, 174.76]

  return (
    <MapContainer
      center={defaultCenter}
      zoom={10}
      scrollWheelZoom
      style={{
        height: mapHeight,
        minHeight: mapHeight,
        width: '100%',
        borderRadius: '16px',
      }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler />
      <UserLocationMarker userLocation={userLocation} />

      {pins
        .filter((pin) => pin.lat != null && pin.lng != null)
        .map((pin) => {
          const isHighlighted = highlightedPinIds.includes(pin.id) || selectedPinId === pin.id
          return (
            <Marker
              key={pin.id}
              position={[Number(pin.lat), Number(pin.lng)]}
              icon={makeIcon(pin.status, isHighlighted, pin.availability_class || 'normal')}
              eventHandlers={{
                click: () => onSelectPin(pin.id),
              }}
            >
              <Popup>
                <div style={{ minWidth: '180px' }}>
                  <strong>
                    {pin.mooring_code || 'NO-CODE'} - {pin.title || 'Untitled'}
                  </strong>
                  <br />
                  Status: {pin.status || '-'}
                  <br />
                  Availability class: {pin.availability_class || 'normal'}
                  <br />
                  {pin.current_vessel_name ? (
                    <>
                      Vessel: {pin.current_vessel_name}
                      <br />
                    </>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          )
        })}
    </MapContainer>
  )
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function safeNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function safeFixed(value, digits = 5) {
  const n = safeNumber(value)
  return n === null ? '-' : n.toFixed(digits)
}

function toDegreeMinutes(value, isLat = true) {
  const n = safeNumber(value)
  if (n === null) return '-'

  const abs = Math.abs(n)
  const degrees = Math.floor(abs)
  const minutes = ((abs - degrees) * 60).toFixed(3)
  const direction = isLat ? (n >= 0 ? 'N' : 'S') : n >= 0 ? 'E' : 'W'

  return `${degrees}° ${minutes}' ${direction}`
}

function HistoryItem({ item }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        background: '#ffffff',
        fontSize: '13px',
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '4px' }}>
        {item.changed_at ? new Date(item.changed_at).toLocaleString() : ''}
      </div>
      <div>
        {item.old_status || '-'} → {item.new_status}
      </div>
      <div>Vessel: {item.vessel_name || 'None'}</div>
      <div>Note: {item.note || '-'}</div>
    </div>
  )
}

function SummaryCard({ title, value, subtitle, accent, badgeBg, badgeColor, icon, isMobile }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: `1px solid ${accent}22`,
        borderRadius: '22px',
        padding: isMobile ? '18px' : '22px',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: isMobile ? '46px' : '54px',
          height: isMobile ? '46px' : '54px',
          borderRadius: '16px',
          background: badgeBg,
          color: badgeColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isMobile ? '22px' : '26px',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: '14px',
            color: '#64748b',
            marginBottom: '4px',
            fontWeight: 600,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: isMobile ? '32px' : '40px',
            lineHeight: 1,
            color: '#0f172a',
            fontWeight: 800,
            marginBottom: '6px',
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: '13px', color: '#64748b' }}>{subtitle}</div>
      </div>
    </div>
  )
}

function MooringList({ pins, selectedPinId, setSelectedPinId, loading, isMobile }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '18px',
        padding: isMobile ? '18px' : '20px',
        maxHeight: isMobile ? 'none' : '360px',
        overflow: 'auto',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: '14px', color: '#475569' }}>Mooring List</h3>

      {loading ? (
        <div>Loading...</div>
      ) : pins.length === 0 ? (
        <div>No moorings found.</div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {pins.map((pin) => (
            <button
              key={pin.id}
              onClick={() => setSelectedPinId(pin.id)}
              style={{
                textAlign: 'left',
                padding: '12px',
                borderRadius: '12px',
                border: selectedPinId === pin.id ? '1px solid #111827' : '1px solid #e5e7eb',
                background: selectedPinId === pin.id ? '#111827' : 'white',
                color: selectedPinId === pin.id ? 'white' : '#111827',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: '4px' }}>
                {pin.mooring_code || 'NO-CODE'} - {pin.title || 'Untitled'}
              </div>
              <div style={{ fontSize: '13px', opacity: 0.95 }}>Status: {pin.status}</div>
              <div style={{ fontSize: '13px', opacity: 0.95 }}>
                Availability class: {pin.availability_class || 'normal'}
              </div>
              <div style={{ fontSize: '13px', opacity: 0.95 }}>
                {pin.current_vessel_name ? `Vessel: ${pin.current_vessel_name}` : 'No vessel attached'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [pins, setPins] = useState([])
  const [photos, setPhotos] = useState([])
  const [logs, setLogs] = useState([])
  const [selectedPinId, setSelectedPinId] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [editStatus, setEditStatus] = useState('')
  const [editVesselName, setEditVesselName] = useState('')
  const [editNote, setEditNote] = useState('')
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [userLocation, setUserLocation] = useState(null)
  const [locationError, setLocationError] = useState('')
  const [locating, setLocating] = useState(false)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isMobile = windowWidth < 900
  const mapHeight = isMobile ? '420px' : '620px'

  async function loadData() {
    setLoading(true)

    const [
      { data: pinsData, error: pinsError },
      { data: photosData, error: photosError },
      { data: logsData, error: logsError },
    ] = await Promise.all([
      supabase.from('pins').select('*').order('mooring_code', { ascending: true }),
      supabase.from('photos').select('*').order('created_at', { ascending: false }),
      supabase.from('status_logs').select('*').order('changed_at', { ascending: false }),
    ])

    if (pinsError) {
      alert('Failed to load moorings: ' + pinsError.message)
    } else {
      const nextPins = pinsData || []
      setPins(nextPins)

      // Do not automatically select the first mooring on initial page load.
      // If a mooring is already selected, keep it selected after refresh; otherwise leave details blank.
      if (selectedPinId) {
        const currentSelected = nextPins.find((pin) => pin.id === selectedPinId)
        setSelectedPinId(currentSelected ? currentSelected.id : '')
      }
    }

    if (photosError) {
      alert('Failed to load photos: ' + photosError.message)
    } else {
      setPhotos(photosData || [])
    }

    if (logsError) {
      alert('Failed to load status logs: ' + logsError.message)
    } else {
      setLogs(logsData || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedPin = useMemo(() => {
    return pins.find((pin) => pin.id === selectedPinId) || null
  }, [pins, selectedPinId])

  const selectedPhotos = useMemo(() => {
    return photos.filter((photo) => photo.pin_id === selectedPinId)
  }, [photos, selectedPinId])

  const selectedLogs = useMemo(() => {
    return logs.filter((log) => log.pin_id === selectedPinId).slice(0, 10)
  }, [logs, selectedPinId])

  useEffect(() => {
    // Keep the Detailed Update form blank when a mooring is selected.
    // This avoids showing the last saved vessel/note as if it were a cached draft.
    setEditStatus('')
    setEditVesselName('')
    setEditNote('')
    setShowHistoryModal(false)
  }, [selectedPinId])

  const nearestAvailable = useMemo(() => {
    if (!userLocation) return []

    return pins
      .filter((pin) => pin.status === 'available' && pin.lat != null && pin.lng != null)
      .map((pin) => ({
        ...pin,
        distanceKm: getDistanceKm(
          userLocation.lat,
          userLocation.lng,
          Number(pin.lat),
          Number(pin.lng)
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3)
  }, [pins, userLocation])

  const highlightedPinIds = useMemo(() => {
    return nearestAvailable.map((pin) => pin.id)
  }, [nearestAvailable])

  const mooringSummary = useMemo(() => {
    const available = pins.filter((pin) => pin.status === 'available').length
    const occupied = pins.filter((pin) => pin.status === 'occupied').length
    return {
      available,
      occupied,
      total: pins.length,
    }
  }, [pins])

  async function saveStatusChange(newStatus, vesselName, note) {
    if (!selectedPin) return false

    const vesselNameToSave = newStatus === 'available' ? null : vesselName || null

    const { error: updateError } = await supabase
      .from('pins')
      .update({
        status: newStatus,
        current_vessel_name: vesselNameToSave,
        note: note || null,
        last_updated_at: new Date().toISOString(),
      })
      .eq('id', selectedPin.id)

    if (updateError) {
      alert('Failed to update status: ' + updateError.message)
      return false
    }

    const { error: logError } = await supabase.from('status_logs').insert({
      pin_id: selectedPin.id,
      old_status: selectedPin.status || 'available',
      new_status: newStatus,
      vessel_name: vesselNameToSave,
      note: note || null,
    })

    if (logError) {
      alert('Failed to save status log: ' + logError.message)
      return false
    }

    await loadData()
    return true
  }

  async function handleQuickOccupied() {
    if (!selectedPin) return

    const vesselName = window.prompt(
      'Enter the vessel name currently using this mooring.',
      editVesselName || ''
    )
    if (vesselName === null) return

    const note = window.prompt('Enter a note (optional).', editNote || '')
    if (note === null) return

    const ok = await saveStatusChange('occupied', vesselName.trim(), note.trim())
    if (ok) alert('Marked as occupied.')
  }

  async function handleQuickAvailable() {
    if (!selectedPin) return

    const note = window.prompt('Enter a note or reason for release (optional).', '')
    if (note === null) return

    const ok = await saveStatusChange('available', null, note.trim())
    if (ok) alert('Marked as available.')
  }

  async function handleDetailedUpdate() {
    if (!editStatus) {
      alert('Please select a status before saving the detailed update.')
      return
    }

    const ok = await saveStatusChange(editStatus, editVesselName.trim(), editNote.trim())
    if (ok) alert('Detailed update saved.')
  }

  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0]
    if (!file || !selectedPin) return

    setUploadingPhoto(true)

    const ext = file.name.split('.').pop()
    const fileName = `${selectedPin.id}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage.from('pin-photos').upload(fileName, file)

    if (uploadError) {
      alert('Failed to upload photo: ' + uploadError.message)
      setUploadingPhoto(false)
      return
    }

    const { data } = supabase.storage.from('pin-photos').getPublicUrl(fileName)
    const { error: insertError } = await supabase.from('photos').insert({
      pin_id: selectedPin.id,
      file_path: data.publicUrl,
    })

    if (insertError) {
      alert('Failed to save photo record: ' + insertError.message)
      setUploadingPhoto(false)
      return
    }

    event.target.value = ''
    await loadData()
    setUploadingPhoto(false)
  }

  async function handleDeletePhoto(photo) {
    const url = photo.file_path
    const marker = '/object/public/pin-photos/'
    const idx = url.indexOf(marker)

    if (idx !== -1) {
      const storagePath = url.slice(idx + marker.length)
      await supabase.storage.from('pin-photos').remove([storagePath])
    }

    const { error } = await supabase.from('photos').delete().eq('id', photo.id)
    if (error) {
      alert('Failed to delete photo: ' + error.message)
      return
    }

    await loadData()
  }

  function getCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError('Location services are not available on this device.')
      return
    }

    setLocating(true)
    setLocationError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        setLocating(false)
      },
      (error) => {
        if (error.code === 1) {
          setLocationError('Location permission was denied.')
        } else if (error.code === 2) {
          setLocationError('Unable to determine current location.')
        } else if (error.code === 3) {
          setLocationError('Location request timed out.')
        } else {
          setLocationError('Failed to get location.')
        }
        setLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    )
  }

  const buttonBase = {
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#0f172a',
    padding: isMobile ? '12px 14px' : '10px 14px',
    borderRadius: '10px',
    fontWeight: 700,
    cursor: 'pointer',
  }

  const detailCard = (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '18px',
        padding: isMobile ? '18px' : '22px',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
      }}
    >
      {selectedPin ? (
        <>
          <h3
            style={{
              marginTop: 0,
              marginBottom: '12px',
              color: '#475569',
              textAlign: 'center',
              fontSize: isMobile ? '24px' : '34px',
              lineHeight: 1.2,
            }}
          >
            {selectedPin.mooring_code || 'NO-CODE'} - {selectedPin.title || 'Untitled'}
          </h3>

          <div style={{ textAlign: 'center', color: '#64748b', marginBottom: '8px' }}>
            lat {safeFixed(selectedPin.lat)} / lng {safeFixed(selectedPin.lng)}
          </div>
          <div style={{ textAlign: 'center', color: '#475569', marginBottom: '18px' }}>
            {toDegreeMinutes(selectedPin.lat, true)} / {toDegreeMinutes(selectedPin.lng, false)}
          </div>

          <div style={{ textAlign: 'center', marginBottom: '12px' }}>
            <div style={{ marginBottom: '8px', color: '#475569' }}>
              <strong>Status:</strong> {selectedPin.status}
            </div>
            <div style={{ marginBottom: '8px', color: '#475569' }}>
              <strong>Availability class:</strong> {selectedPin.availability_class || 'normal'}
            </div>
            <div style={{ color: '#64748b' }}>
              <strong>Last updated:</strong>{' '}
              {selectedPin.last_updated_at
                ? new Date(selectedPin.last_updated_at).toLocaleString()
                : '-'}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: '14px',
            }}
          >
            <button
              onClick={handleQuickOccupied}
              style={{
                ...buttonBase,
                background: '#ef4444',
                borderColor: '#ef4444',
                color: 'white',
              }}
            >
              Mark Occupied
            </button>
            <button
              onClick={handleQuickAvailable}
              style={{
                ...buttonBase,
                background: '#22c55e',
                borderColor: '#22c55e',
                color: 'white',
              }}
            >
              Mark Available
            </button>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <button onClick={loadData} style={buttonBase}>
              Refresh Moorings
            </button>
          </div>

          <h4 style={{ marginBottom: '14px', color: '#475569', textAlign: 'center' }}>
            Detailed Update
          </h4>

          <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>Status</label>
          <select
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value)}
            style={{
              width: '100%',
              padding: isMobile ? '12px' : '10px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              marginBottom: '12px',
              boxSizing: 'border-box',
            }}
          >
            <option value="" disabled>
              Select status
            </option>
            <option value="available">available</option>
            <option value="occupied">occupied</option>
          </select>

          <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>
            Current Vessel Name
          </label>
          <input
            value={editVesselName}
            onChange={(e) => setEditVesselName(e.target.value)}
            placeholder="e.g. MV Southern Star"
            style={{
              width: '100%',
              padding: isMobile ? '12px' : '10px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              marginBottom: '12px',
              boxSizing: 'border-box',
            }}
          />

          <label style={{ display: 'block', fontWeight: 700, marginBottom: '6px' }}>Note</label>
          <textarea
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            placeholder="Enter a note"
            style={{
              width: '100%',
              minHeight: '90px',
              padding: isMobile ? '12px' : '10px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              marginBottom: '12px',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />

          <button
            onClick={handleDetailedUpdate}
            style={{
              ...buttonBase,
              width: '100%',
              marginBottom: '24px',
              background: '#0f172a',
              borderColor: '#0f172a',
              color: 'white',
            }}
          >
            Save Detailed Update
          </button>

          <h4 style={{ marginBottom: '12px', color: '#475569' }}>Photos</h4>
          <label
            style={{
              ...buttonBase,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
            }}
          >
            {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
            <input type="file" accept="image/*" onChange={handlePhotoUpload} hidden />
          </label>

          {selectedPhotos.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
              No photos uploaded yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
              {selectedPhotos.map((photo) => (
                <div
                  key={photo.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '14px',
                    padding: '12px',
                    background: '#ffffff',
                  }}
                >
                  <img
                    src={photo.file_path}
                    alt="Mooring"
                    style={{
                      width: '100%',
                      display: 'block',
                      borderRadius: '12px',
                      marginBottom: '10px',
                    }}
                  />
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
                    {photo.created_at ? new Date(photo.created_at).toLocaleString() : ''}
                  </div>
                  <button
                    onClick={() => handleDeletePhoto(photo)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #fca5a5',
                      background: 'white',
                      color: '#b91c1c',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    Delete Photo
                  </button>
                </div>
              ))}
            </div>
          )}

          <h4 style={{ marginBottom: '12px', color: '#475569' }}>Status History</h4>
          {selectedLogs.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '14px' }}>No status history yet.</div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                background: '#f8fafc',
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 700 }}>
                  Latest update
                </div>
                <div style={{ color: '#0f172a', fontSize: '14px', fontWeight: 800 }}>
                  {selectedLogs[0].changed_at
                    ? new Date(selectedLogs[0].changed_at).toLocaleString()
                    : '-'}
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(true)}
                style={{
                  ...buttonBase,
                  padding: '9px 14px',
                  background: '#111827',
                  color: 'white',
                  borderColor: '#111827',
                  whiteSpace: 'nowrap',
                }}
              >
                History
              </button>
            </div>
          )}

          {showHistoryModal && (
            <div
              onClick={() => setShowHistoryModal(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.55)',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 'min(520px, 100%)',
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  background: 'white',
                  borderRadius: '18px',
                  padding: '18px',
                  boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '14px',
                  }}
                >
                  <h3 style={{ margin: 0, color: '#334155' }}>History</h3>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    style={{
                      border: '1px solid #cbd5e1',
                      background: 'white',
                      color: '#0f172a',
                      borderRadius: '999px',
                      width: '34px',
                      height: '34px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                    aria-label="Close history popup"
                  >
                    ×
                  </button>
                </div>

                <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '12px' }}>
                  Previous status updates for {selectedPin.mooring_code || 'NO-CODE'} -{' '}
                  {selectedPin.title || 'Untitled'}
                </div>

                {selectedLogs.slice(1).length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '14px' }}>
                    No previous status history yet.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {selectedLogs.slice(1).map((item) => (
                      <HistoryItem key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ color: '#64748b' }}>Select a mooring to view details.</div>
      )}
    </div>
  )

  return (
    <div
      style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: isMobile ? '16px' : '24px',
        color: '#0f172a',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ marginBottom: '8px' }}>Emergency Mooring Board</h1>
        <div style={{ color: '#475569', marginBottom: '16px' }}>
        
        </div>
        <button onClick={loadData} style={buttonBase}>
          Refresh Moorings
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(220px, 1fr))',
          gap: '18px',
          marginBottom: '24px',
        }}
      >
        <SummaryCard
          title="Available Moorings"
          value={mooringSummary.available}
          subtitle={`Out of ${mooringSummary.total} total moorings`}
          accent="#22c55e"
          badgeBg="#dcfce7"
          badgeColor="#16a34a"
          icon="⚓"
          isMobile={isMobile}
        />
        <SummaryCard
          title="Occupied Moorings"
          value={mooringSummary.occupied}
          subtitle="Currently attached / in use"
          accent="#ef4444"
          badgeBg="#fee2e2"
          badgeColor="#dc2626"
          icon="⛔"
          isMobile={isMobile}
        />
      </div>

      <section
        style={{
          background: '#f8fafc',
          border: '1px solid #e5e7eb',
          borderRadius: '24px',
          padding: isMobile ? '18px' : '24px',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ textAlign: 'center', color: '#475569', marginTop: 0, marginBottom: '16px' }}>
          Nearest Available Moorings
        </h2>

        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <button
            onClick={getCurrentLocation}
            style={{
              ...buttonBase,
              background: '#2563eb',
              borderColor: '#2563eb',
              color: 'white',
            }}
          >
            {locating ? 'Getting location...' : 'Use my current location'}
          </button>
        </div>

        {locationError && (
          <div style={{ textAlign: 'center', color: '#b91c1c', marginBottom: '12px' }}>
            {locationError}
          </div>
        )}

        {!userLocation ? (
          <div style={{ textAlign: 'center', color: '#64748b' }}>
            Allow location access to see the 3 nearest available moorings.
          </div>
        ) : nearestAvailable.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748b' }}>
            There are currently no available moorings.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {nearestAvailable.map((pin, index) => (
              <button
                key={pin.id}
                onClick={() => setSelectedPinId(pin.id)}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #dbe4f0',
                  background: index === 0 ? '#eff6ff' : 'white',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 800, color: '#0f172a' }}>
                  {index + 1}. {pin.mooring_code || 'NO-CODE'} - {pin.title || 'Untitled'}
                </div>
                <div style={{ color: '#475569' }}>{pin.distanceKm.toFixed(2)} km away</div>
              </button>
            ))}
          </div>
        )}
      </section>

      {isMobile ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '18px' }}>
          <div
            style={{
              minWidth: 0,
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '18px',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
            }}
          >
            <LeafletMap
              pins={pins}
              selectedPinId={selectedPinId}
              onSelectPin={setSelectedPinId}
              highlightedPinIds={highlightedPinIds}
              userLocation={userLocation}
              mapHeight={mapHeight}
            />
          </div>

          <div>{detailCard}</div>

          <MooringList
            pins={pins}
            selectedPinId={selectedPinId}
            setSelectedPinId={setSelectedPinId}
            loading={loading}
            isMobile={isMobile}
          />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(760px, 1.5fr) minmax(340px, 0.9fr)',
            gap: '18px',
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'grid', gap: '18px', minWidth: 0 }}>
            <div
              style={{
                minWidth: 0,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '18px',
                overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
              }}
            >
              <LeafletMap
                pins={pins}
                selectedPinId={selectedPinId}
                onSelectPin={setSelectedPinId}
                highlightedPinIds={highlightedPinIds}
                userLocation={userLocation}
                mapHeight={mapHeight}
              />
            </div>

            <MooringList
              pins={pins}
              selectedPinId={selectedPinId}
              setSelectedPinId={setSelectedPinId}
              loading={loading}
              isMobile={isMobile}
            />
          </div>

          <div>{detailCard}</div>
        </div>
      )}
    </div>
  )
}
