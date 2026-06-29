import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Eye, EyeOff, RefreshCcw, Save, TestTube2 } from 'lucide-react'
import { getSettings, syncAccounts, syncBoards, testAI, updateSettings } from '../lib/api'

const errorMessage = (error) => {
  const detail = error.response?.data?.detail || error.response?.data?.error || error.message
  if (Array.isArray(detail)) return detail.map((item) => item.msg || JSON.stringify(item)).join(', ')
  if (detail && typeof detail === 'object') return detail.msg || JSON.stringify(detail)
  return detail || 'Request failed'
}
const accountLabel = (account) => account.displayName || account.platformUsername || account.username || account.name || account.id || 'Pinterest account'
const boardLabel = (board) => board.name || board.title || board.boardName || board.boardId || board.id || 'Pinterest board'
const boardId = (board) => board.boardId || board.id || board.board_id || ''

function SecretInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false)

  return (
    <div className="flex rounded-xl border border-slate-200">
      <input
        type={show ? 'text' : 'password'}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-l-xl p-3 outline-none"
      />
      <button type="button" onClick={() => setShow((current) => !current)} className="px-3 text-gray-500">
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncingAccounts, setSyncingAccounts] = useState(false)
  const [syncingBoards, setSyncingBoards] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const { data } = await getSettings()
      setSettings(data)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const updateField = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  async function saveSettings() {
    setLoading(true)
    try {
      await updateSettings(settings)
      toast.success('Settings saved')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  async function testAiConnection() {
    try {
      const { data } = await testAI()
      if (data.ok) {
        toast.success(`AI OK: ${data.models_count || 0} models`)
      } else {
        toast.error(data.detail || data.error || 'AI failed')
      }
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  async function syncPostFastAccounts() {
    setSyncingAccounts(true)
    try {
      const { data } = await syncAccounts()
      const nextAccounts = data.accounts || []
      setAccounts(nextAccounts)
      toast.success('Accounts synced')

      if (!settings.default_social_media_id && nextAccounts[0]?.id) {
        updateField('default_social_media_id', nextAccounts[0].id)
      }
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSyncingAccounts(false)
    }
  }

  async function syncPinterestBoards(socialMediaId = settings.default_social_media_id) {
    if (!socialMediaId) return toast.error('Select a Pinterest account first')
    setSyncingBoards(true)
    try {
      const { data } = await syncBoards(socialMediaId)
      const nextBoards = data.boards || []
      setBoards(nextBoards)
      toast.success('Boards synced')

      if (!settings.default_board_id && boardId(nextBoards[0])) {
        updateField('default_board_id', boardId(nextBoards[0]))
      }
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSyncingBoards(false)
    }
  }

  if (!settings) return null

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h1 className="text-3xl font-black">Settings</h1>
        <p className="text-gray-500">Configure 9Router and PostFast. Keys are stored backend-side.</p>
      </div>

      <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">AI Model (9Router)</h2>
            <p className="text-sm text-slate-500">Used for title, description, tags, SEO, and board recommendations.</p>
          </div>
          <button type="button" onClick={testAiConnection} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold">
            <TestTube2 size={16} /> Test AI
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className="font-bold">Endpoint URL</span>
            <input className="mt-2 w-full rounded-xl border p-3" value={settings.ai_router_endpoint || ''} onChange={(event) => updateField('ai_router_endpoint', event.target.value)} />
          </label>
          <label>
            <span className="font-bold">API Key</span>
            <div className="mt-2"><SecretInput value={settings.ai_router_api_key} onChange={(value) => updateField('ai_router_api_key', value)} placeholder="9Router API key" /></div>
          </label>
          <label>
            <span className="font-bold">Text model</span>
            <input className="mt-2 w-full rounded-xl border p-3" value={settings.ai_text_model || ''} onChange={(event) => updateField('ai_text_model', event.target.value)} />
          </label>
          <label>
            <span className="font-bold">Image model</span>
            <input className="mt-2 w-full rounded-xl border p-3" value={settings.ai_image_model || ''} onChange={(event) => updateField('ai_image_model', event.target.value)} />
          </label>
        </div>
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-black">PostFast / Pinterest</h2>
            <p className="text-sm text-slate-500">Default account and board used by Review and Calendar scheduling.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={syncPostFastAccounts} disabled={syncingAccounts} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold disabled:opacity-60">
              <RefreshCcw size={16} className={syncingAccounts ? 'animate-spin' : ''} /> Sync Accounts
            </button>
            <button type="button" onClick={() => syncPinterestBoards()} disabled={syncingBoards || !settings.default_social_media_id} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold disabled:opacity-60">
              <RefreshCcw size={16} className={syncingBoards ? 'animate-spin' : ''} /> Sync Boards
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className="font-bold">PostFast API Key</span>
            <div className="mt-2"><SecretInput value={settings.postfast_api_key} onChange={(value) => updateField('postfast_api_key', value)} placeholder="PostFast API key" /></div>
          </label>
          <label>
            <span className="font-bold">Default Pinterest account</span>
            <select className="mt-2 w-full rounded-xl border p-3" value={settings.default_social_media_id || ''} onChange={(event) => updateField('default_social_media_id', event.target.value)}>
              <option value="">Select account</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
              {settings.default_social_media_id && !accounts.some((account) => account.id === settings.default_social_media_id) && <option value={settings.default_social_media_id}>{settings.default_social_media_id}</option>}
            </select>
          </label>
          <label>
            <span className="font-bold">Default Pinterest board</span>
            <select className="mt-2 w-full rounded-xl border p-3" value={settings.default_board_id || ''} onChange={(event) => updateField('default_board_id', event.target.value)}>
              <option value="">Select board</option>
              {boards.map((board) => <option key={boardId(board)} value={boardId(board)}>{boardLabel(board)}</option>)}
              {settings.default_board_id && !boards.some((board) => boardId(board) === settings.default_board_id) && <option value={settings.default_board_id}>{settings.default_board_id}</option>}
            </select>
          </label>
        </div>
      </section>

      <button type="button" onClick={saveSettings} disabled={loading} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 font-bold text-white disabled:opacity-60">
        <Save size={18} /> {loading ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
