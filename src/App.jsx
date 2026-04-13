
import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default Leaflet icon paths
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
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
  availabilityClass = 'normal'
) => {
  const backgroundColor =
    status === 'occupied'
      ? '#dc2626' // red
      : availabilityClass === 'orange'
      ? '#f97316' // orange
      : '#16a34a' // green

  return new L.DivIcon({
    className: '',
    html: `
      <div style="
        width: ${isHighlighted ? '24px' : '18px'};
        height: ${isHighlighted ? '24px' : '18px'};
        border-radius: 999px;
        background: ${backgroundColor};
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.28);
        outline: ${isHighlighted ? '3px solid #f59e0b' : 'none'};
      "></div>
    `,
    iconSize: [isHighlighted ? 24 : 18, isHighlighted ? 24 : 18],
    iconAnchor: [isHighlighted ? 12 : 9, isHighlighted ? 12 : 9],
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

  const icon = new L.DivIcon({
    className: '',
    html: `
      <div style="
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: #2563eb;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.28);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })

  return <Marker position={[userLocation.lat, userLocation.lng]} icon={icon} />
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
      zoom={11}
      style={{ height: mapHeight, width: '100%', borderRadius: '16px' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapClickHandler />
      <UserLocationMarker userLocation={userLocation} />

      {pins
        .filter((pin) => pin.lat != null && pin.lng != null)
        .map((pin) => {
          const isHighlighted =
            highlightedPinIds.includes(pin.id) || selectedPinId === pin.id

          return (
            <Marker
              key={`${pin.id}-${pin.status}-${pin.availability_class ?? 'normal'}-${isHighlighted}`}
              position={[Number(pin.lat), Number(pin.lng)]}
              icon={makeIcon(
                pin.status,
                isHighlighted,
                pin.availability_class ?? 'normal'
              )}
              eventHandlers={{
                click: () => onSelectPin(pin.id),
              }}
            >
              <Popup>
                <div style={{ minWidth: '180px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                    {pin.mooring_code || 'NO-CODE'} - {pin.title || 'Untitled'}
                  </div>
                  <div>Status: {pin.status || '-'}</div>
                  <div>
                    Availability class: {pin.availability_class || 'normal'}
                  </div>
                  {pin.current_vessel_name ? (
                    <div>Vessel: {pin.current_vessel_name}</div>
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

function HistoryItem({ item }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        marginBottom: '8px',
        background: 'white',
      }}
    >
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
        {item.changed_at ? new Date(item.changed_at).toLocaleString() : ''}
      </div>
      <div style={{ fontWeight: 600, marginBottom: '4px' }}>
        {item.old_status || '-'} → {item.new_status}
      </div>
      <div style={{ fontSize: '14px', marginBottom: '4px' }}>
        Vessel: {item.vessel_name || 'None'}
      </div>
      <div style={{ fontSize: '14px' }}>Note: {item.note || '-'}</div>
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
  const [editStatus, setEditStatus] = useState('available')
  const [editVesselName, setEditVesselName] = useState('')
  const [editNote, setEditNote] = useState('')
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
  const mapHeight = isMobile ? '420px' : '100%'
  const boardGridColumns = isMobile
    ? '1fr'
    : 'minmax(620px, 1.45fr) minmax(320px, 0.9fr) minmax(280px, 0.82fr)'

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

      if (nextPins.length > 0) {
        const currentSelected =
          nextPins.find((pin) => pin.id === selectedPinId) || nextPins[0]
        setSelectedPinId(currentSelected.id)
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
    if (selectedPin) {
      setEditStatus(selectedPin.status || 'available')
      setEditVesselName(selectedPin.current_vessel_name || '')
      setEditNote(selectedPin.note || '')
    }
  }, [selectedPin])

  const nearestAvailable = useMemo(() => {
    if (!userLocation) return []

    return pins
      .filter(
        (pin) =>
          pin.status === 'available' && pin.lat != null && pin.lng != null
      )
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

  async function saveStatusChange(newStatus, vesselName, note) {
    if (!selectedPin) return false

    const vesselNameToSave =
      newStatus === 'available' ? null : vesselName || null

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

    const note = window.prompt(
      'Enter a note or reason for release (optional).',
      ''
    )
    if (note === null) return

    const ok = await saveStatusChange('available', null, note.trim())
    if (ok) alert('Marked as available.')
  }

  async function handleDetailedUpdate() {
    const ok = await saveStatusChange(
      editStatus,
      editVesselName.trim(),
      editNote.trim()
    )
    if (ok) alert('Detailed update saved.')
  }

  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0]
    if (!file || !selectedPin) return

    setUploadingPhoto(true)

    const ext = file.name.split('.').pop()
    const fileName = `${selectedPin.id}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('pin-photos')
      .upload(fileName, file)

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

  const detailCard = (
    <div
      style={{
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '16px',
      }}
    >
      {selectedPin ? (
        <>
          <h3 style={{ marginTop: 0, marginBottom: '8px' }}>
            {selectedPin.mooring_code || 'NO-CODE'} -{' '}
            {selectedPin.title || 'Untitled'}
          </h3>

          <div style={{ fontSize: '14px', color: '#4b5563', marginBottom: '8px' }}>
            lat {Number(selectedPin.lat || 0).toFixed(5)} / lng{' '}
            {Number(selectedPin.lng || 0).toFixed(5)}
          </div>

          <div style={{ fontSize: '0.9em', color: '#374151' }}>
            {toDegreeMinutes(Number(selectedPin.lat), true)} /{' '}
            {toDegreeMinutes(Number(selectedPin.lng), false)}
          </div>

          <div style={{ fontSize: '14px', marginBottom: '8px' }}>
            <strong>Status:</strong> {selectedPin.status}
          </div>

          <div style={{ fontSize: '14px', marginBottom: '8px' }}>
            <strong>Availability class:</strong>{' '}
            {selectedPin.availability_class || 'normal'}
          </div>

          <div style={{ fontSize: '14px', marginBottom: '16px' }}>
            <strong>Last updated:</strong>{' '}
            {selectedPin.last_updated_at
              ? new Date(selectedPin.last_updated_at).toLocaleString()
              : '-'}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '16px',
            }}
          >
            <button
              onClick={handleQuickOccupied}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: 'none',
                background: '#dc2626',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Mark Occupied
            </button>

            <button
              onClick={handleQuickAvailable}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: 'none',
                background: '#16a34a',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Mark Available
            </button>
          </div>

          <button
            onClick={loadData}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              fontWeight: 600,
              marginBottom: '16px',
            }}
          >
            Refresh Moorings
          </button>

          <h4 style={{ marginBottom: '12px' }}>Detailed Update</h4>

          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
            Status
          </label>
          <select
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value)}
            style={{
              width: '100%',
              padding: isMobile ? '12px' : '10px',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              marginBottom: '12px',
            }}
          >
            <option value="available">available</option>
            <option value="occupied">occupied</option>
          </select>

          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
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

          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
            Note
          </label>
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
              padding: '10px 14px',
              borderRadius: '10px',
              border: 'none',
              background: '#111827',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
              marginBottom: '20px',
            }}
          >
            Save Detailed Update
          </button>

          <h4 style={{ marginBottom: '12px' }}>Photos</h4>

          <label
            style={{
              display: 'inline-block',
              marginBottom: '12px',
              padding: '10px 12px',
              borderRadius: '10px',
              background: '#2563eb',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              style={{ display: 'none' }}
            />
          </label>

          {selectedPhotos.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No photos uploaded yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: '10px', marginBottom: '20px' }}>
              {selectedPhotos.map((photo) => (
                <div
                  key={photo.id}
                  style={{
                    padding: '10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    background: 'white',
                  }}
                >
                  <img
                    src={photo.file_path}
                    alt="Mooring"
                    style={{
                      width: '100%',
                      borderRadius: '10px',
                      marginBottom: '8px',
                    }}
                  />
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '8px',
                    }}
                  >
                    {photo.created_at
                      ? new Date(photo.created_at).toLocaleString()
                      : ''}
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
                      fontWeight: 600,
                    }}
                  >
                    Delete Photo
                  </button>
                </div>
              ))}
            </div>
          )}

          <h4 style={{ marginBottom: '12px' }}>Status History</h4>

          {selectedLogs.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No status history yet.</p>
          ) : (
            <div>
              {selectedLogs.map((item) => (
                <HistoryItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </>
      ) : (
        <p>Select a mooring to view details.</p>
      )}
    </div>
  )

  return (
    <div
      style={{
        padding: isMobile ? '16px' : '24px',
        maxWidth: isMobile ? '1400px' : '1680px',
        margin: '0 auto',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: '8px' }}>Emergency Mooring Board</h2>

      <p style={{ color: '#4b5563', marginTop: 0, marginBottom: '16px' }}>
        Green = Available / Red = Occupied / Orange = Special Available / Blue =
        My Location / Orange outline = Nearest available moorings
      </p>

      <button
        onClick={loadData}
        style={{
          padding: '10px 12px',
          borderRadius: '10px',
          border: '1px solid #d1d5db',
          background: 'white',
          cursor: 'pointer',
          fontWeight: 600,
          marginBottom: '16px',
        }}
      >
        Refresh Moorings
      </button>

      <div
        style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '16px',
          marginBottom: '20px',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Nearest Available Moorings</h3>

        <button
          onClick={getCurrentLocation}
          style={{
            padding: '10px 12px',
            borderRadius: '10px',
            border: 'none',
            background: '#2563eb',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 600,
            marginBottom: '10px',
          }}
        >
          {locating ? 'Getting location...' : 'Use my current location'}
        </button>

        {locationError && (
          <div style={{ color: '#b91c1c', marginBottom: '8px' }}>
            {locationError}
          </div>
        )}

        {!userLocation ? (
          <div style={{ color: '#6b7280' }}>
            Allow location access to see the 3 nearest available moorings.
          </div>
        ) : nearestAvailable.length === 0 ? (
          <div style={{ color: '#6b7280' }}>
            There are currently no available moorings.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {nearestAvailable.map((pin, index) => (
              <button
                key={pin.id}
                onClick={() => setSelectedPinId(pin.id)}
                style={{
                  textAlign: 'left',
                  padding: '10px',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  background: index === 0 ? '#eff6ff' : 'white',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {index + 1}. {pin.mooring_code || 'NO-CODE'} -{' '}
                  {pin.title || 'Untitled'}
                </div>
                <div style={{ fontSize: '14px', color: '#4b5563' }}>
                  {pin.distanceKm.toFixed(2)} km away
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {isMobile && (
        <div style={{ marginBottom: '20px' }}>
          <LeafletMap
            pins={pins}
            selectedPinId={selectedPinId}
            onSelectPin={setSelectedPinId}
            highlightedPinIds={highlightedPinIds}
            userLocation={userLocation}
            mapHeight={mapHeight}
          />
        </div>
      )}

      {isMobile && <div style={{ marginBottom: '20px' }}>{detailCard}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: boardGridColumns,
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {!isMobile && (
          <div
            style={{
              width: 'min(100%, 80vh)',
              aspectRatio: '1 / 1',
              justifySelf: 'start',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
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
        )}

        {!isMobile && <div style={{ alignSelf: 'start' }}>{detailCard}</div>}

        <div
          style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '16px',
            padding: '16px',
            maxHeight: isMobile ? 'none' : 'min(80vh, 860px)',
            overflowY: isMobile ? 'visible' : 'auto',
          }}
        >
          <h3 style={{ marginTop: 0 }}>Mooring List</h3>

          {loading ? (
            <div>Loading...</div>
          ) : pins.length === 0 ? (
            <div>No moorings found.</div>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {pins.map((pin) => (
                <button
                  key={pin.id}
                  onClick={() => setSelectedPinId(pin.id)}
                  style={{
                    textAlign: 'left',
                    padding: '12px',
                    borderRadius: '12px',
                    border:
                      selectedPinId === pin.id
                        ? '1px solid #111827'
                        : '1px solid #e5e7eb',
                    background: selectedPinId === pin.id ? '#111827' : 'white',
                    color: selectedPinId === pin.id ? 'white' : '#111',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {pin.mooring_code || 'NO-CODE'} - {pin.title || 'Untitled'}
                  </div>
                  <div style={{ fontSize: '14px', marginTop: '4px' }}>
                    Status: {pin.status}
                  </div>
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>
                    Availability class: {pin.availability_class || 'normal'}
                  </div>
                  <div style={{ fontSize: '13px', marginTop: '4px', opacity: 0.85 }}>
                    {pin.current_vessel_name
                      ? `Vessel: ${pin.current_vessel_name}`
                      : 'No vessel attached'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
