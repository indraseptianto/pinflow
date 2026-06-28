import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import dayjs from 'dayjs'
import { CalendarClock, Loader2, RefreshCw, Trash2, XCircle } from 'lucide-react'
import { cancelPin, deletePin, getSettings, listPins, schedulePin, syncPinStatus } from '../lib/api'

const errorMessage = (error) => error.response?.data?.detail || error.message
const badgeColors = {
  draft: 'bg-gray-100 text-gray-700',
  reviewed: 'bg-blue-100 text-blue-700',
  ready: 'bg-yellow-100 text-yellow-800',
  scheduled: 'bg-green-100 text-green-700',
  published: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
}

function Calendar() {
  const [pins, setPins] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [selected, setSelected] = useState([])
  const [batch, setBatch] = useState({ start_at: '', interval_hours: 24, social_media_id: '', board_id: '' })

  const loadPins = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await listPins()
      setPins(Array.isArray(data) ? data : data.items || [])
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPins()
    getSettings().then(({ data }) => setBatch((current) => ({
      ...current,
      social_media_id: data.default_social_media_id || current.social_media_id,
      board_id: data.default_board_id || current.board_id,
    }))).catch(() => {})
    const interval = setInterval(() => loadPins(true), 30000)
    return () => clearInterval(interval)
  }, [])

  const handleCancel = async (id) => {
    setBusy(`cancel-${id}`)
    try {
      await cancelPin(id)
      toast.success('Schedule canceled')
      loadPins(true)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const handleDelete = async (id) => {
    setBusy(`delete-${id}`)
    try {
      await deletePin(id)
      toast.success('Pin deleted')
      setPins((current) => current.filter((pin) => (pin.id || pin.pin_id) !== id))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const handleSync = async () => {
    setBusy('sync')
    try {
      await syncPinStatus()
      toast.success('Statuses synced')
      loadPins(true)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const toggleSelected = (id) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const scheduleBatch = async (event) => {
    event.preventDefault()
    if (!selected.length) return toast.error('Select at least one draft pin')
    if (!batch.social_media_id || !batch.board_id) return toast.error('Social media ID and board ID are required')
    const start = batch.start_at ? dayjs(batch.start_at) : dayjs().add(10, 'minute')
    if (!start.isValid()) return toast.error('Start time is invalid')

    setBusy('batch')
    try {
      for (const [index, id] of selected.entries()) {
        const scheduledAt = start.add(index * Number(batch.interval_hours || 24), 'hour').toISOString()
        await schedulePin(id, {
          social_media_id: batch.social_media_id,
          board_id: batch.board_id,
          scheduled_at: scheduledAt,
        })
      }
      toast.success(`Batch scheduled ${selected.length} pins`)
      setSelected([])
      loadPins(true)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-4xl font-black tracking-tight">Publishing Calendar</h1>
          <p className="mt-2 text-slate-600">Track drafts, scheduled pins, and live publishing results.</p>
        </div>
        <button onClick={handleSync} disabled={busy === 'sync'} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#E60023] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
          {busy === 'sync' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Sync status
        </button>
      </div>

      <form onSubmit={scheduleBatch} className="mb-6 grid gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.1fr_1.1fr_1fr_0.7fr_auto] md:items-end">
        <label className="text-sm font-bold text-slate-700">
          Social media ID
          <input value={batch.social_media_id} onChange={(event) => setBatch({ ...batch, social_media_id: event.target.value })} placeholder="PostFast account ID" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-normal" />
        </label>
        <label className="text-sm font-bold text-slate-700">
          Board ID
          <input value={batch.board_id} onChange={(event) => setBatch({ ...batch, board_id: event.target.value })} placeholder="Pinterest board ID" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-normal" />
        </label>
        <label className="text-sm font-bold text-slate-700">
          Start time
          <input type="datetime-local" value={batch.start_at} onChange={(event) => setBatch({ ...batch, start_at: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-normal" />
        </label>
        <label className="text-sm font-bold text-slate-700">
          Interval hours
          <input type="number" min="1" max="168" value={batch.interval_hours} onChange={(event) => setBatch({ ...batch, interval_hours: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-normal" />
        </label>
        <button disabled={busy === 'batch'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
          {busy === 'batch' ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
          Batch Schedule {selected.length ? `(${selected.length})` : ''}
        </button>
      </form>

      {loading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-[#E60023]" size={32} /></div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200">
          {pins.length === 0 ? <p className="p-8 text-center text-slate-500">No pins yet.</p> : pins.map((pin) => {
            const id = pin.id || pin.pin_id
            const status = pin.status || 'draft'
            return (
              <div key={id} className="grid gap-4 border-b border-slate-100 p-4 last:border-b-0 md:grid-cols-[32px_64px_1fr_130px_180px_190px] md:items-center">
                <input type="checkbox" checked={selected.includes(id)} onChange={() => toggleSelected(id)} disabled={status === 'scheduled' || status === 'published'} className="h-5 w-5 rounded border-slate-300 accent-[#E60023] disabled:opacity-30" />
                <img src={pin.generated_image_url || pin.image_url || pin.image || 'https://placehold.co/120x120/f1f5f9/0f172a?text=Pin'} alt={pin.title} className="h-16 w-16 rounded-2xl object-cover" />
                <div>
                  <h2 className="font-bold text-slate-950">{pin.title || 'Untitled pin'}</h2>
                  <p className="mt-1 text-sm text-slate-500">ID: {id}</p>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${badgeColors[status] || badgeColors.draft}`}>{status}</span>
                <span className="text-sm text-slate-600">{pin.scheduled_at ? dayjs(pin.scheduled_at).format('MMM D, YYYY h:mm A') : 'Not scheduled'}</span>
                <div className="flex gap-2">
                  <button onClick={() => handleCancel(id)} disabled={status !== 'scheduled' || busy === `cancel-${id}`} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40"><XCircle size={14} /> Cancel</button>
                  <button onClick={() => handleDelete(id)} disabled={busy === `delete-${id}`} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40"><Trash2 size={14} /> Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default Calendar
