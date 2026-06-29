import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Image, Loader2, RefreshCw, Send, Sparkles, Type, TrendingUp, LayoutGrid } from 'lucide-react'
import { generateAll, generateImage, generateText, getBoardRecommendation, getPin, getSEOScore, getSettings, schedulePin, syncAccounts, syncBoards, updatePin } from '../lib/api'

const errorMessage = (error) => {
  const detail = error.response?.data?.detail || error.response?.data?.error || error.message
  if (Array.isArray(detail)) return detail.map((item) => item.msg || JSON.stringify(item)).join(', ')
  if (detail && typeof detail === 'object') return detail.msg || JSON.stringify(detail)
  return detail || 'Request failed'
}
const tagList = (tags) => (Array.isArray(tags) ? tags : String(tags || '').split(',').map((tag) => tag.trim()).filter(Boolean))
const accountLabel = (account) => account.displayName || account.platformUsername || account.username || account.name || account.id || 'Pinterest account'
const boardLabel = (board) => board.name || board.title || board.boardName || board.boardId || board.id || 'Pinterest board'
const boardId = (board) => board.boardId || board.id || board.board_id || ''

function Review() {
  const { pinId } = useParams()
  const navigate = useNavigate()
  const [pin, setPin] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', tags: [], pinterest_link: '', image_url: '' })
  const [tagDraft, setTagDraft] = useState('')
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  // SEO Score
  const [seoScore, setSeoScore] = useState(null)
  const [seoLoading, setSeoLoading] = useState(false)

  // Board Recommendation
  const [accounts, setAccounts] = useState([])
  const [boards, setBoards] = useState([])
  const [recommendedBoard, setRecommendedBoard] = useState(null)
  const [recLoading, setRecLoading] = useState(false)
  const [scheduleMetaLoading, setScheduleMetaLoading] = useState(false)

  // Schedule form
  const [schedule, setSchedule] = useState({ social_media_id: '', board_id: '', scheduled_at: '' })

  useEffect(() => {
    const loadPin = async () => {
      setLoading(true)
      try {
        const { data } = await getPin(pinId)
        setPin(data)
        setForm({
          title: data.title || '',
          description: data.description || '',
          tags: tagList(data.tags),
          pinterest_link: data.pinterest_link || '',
          image_url: data.generated_image_url || data.image_url || data.image || '',
        })
        if (data.social_media_id) setSchedule(s => ({ ...s, social_media_id: data.social_media_id }))
        if (data.board_id) setSchedule(s => ({ ...s, board_id: data.board_id }))
        const { data: settings } = await getSettings()
        const defaultSocialId = data.social_media_id || settings.default_social_media_id || ''
        const defaultBoardId = data.board_id || settings.default_board_id || ''
        setSchedule(s => ({
          ...s,
          social_media_id: defaultSocialId || s.social_media_id,
          board_id: defaultBoardId || s.board_id,
        }))
        await loadScheduleOptions(defaultSocialId, defaultBoardId)
      } catch (error) {
        toast.error(errorMessage(error))
      } finally {
        setLoading(false)
      }
    }
    loadPin()
  }, [pinId])

  const loadScheduleOptions = async (socialMediaId = '', fallbackBoardId = '') => {
    setScheduleMetaLoading(true)
    try {
      const { data: accountData } = await syncAccounts()
      const accountList = accountData.accounts || []
      setAccounts(accountList)
      const activeSocialId = socialMediaId || accountList[0]?.id || ''
      if (!activeSocialId) return

      const { data: boardData } = await syncBoards(activeSocialId)
      const boardList = boardData.boards || []
      setBoards(boardList)
      const activeBoardId = fallbackBoardId || boardId(boardList[0])
      setSchedule((current) => ({
        ...current,
        social_media_id: current.social_media_id || activeSocialId,
        board_id: current.board_id || activeBoardId || '',
      }))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setScheduleMetaLoading(false)
    }
  }

  const handleScheduleAccountChange = async (socialMediaId) => {
    setSchedule((current) => ({ ...current, social_media_id: socialMediaId, board_id: '' }))
    if (!socialMediaId) return setBoards([])
    setScheduleMetaLoading(true)
    try {
      const { data } = await syncBoards(socialMediaId)
      const boardList = data.boards || []
      setBoards(boardList)
      setSchedule((current) => ({ ...current, board_id: boardId(boardList[0]) || '' }))
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setScheduleMetaLoading(false)
    }
  }

  const saveDraft = async (extra = {}) => {
    const merged = { ...form, ...extra }
    const body = { ...merged, tags: merged.tags || form.tags, generated_image_url: merged.generated_image_url || merged.image_url || form.image_url }
    const { data } = await updatePin(pinId, body)
    setPin(data)
    return data
  }

  const applyGeneratedText = async (type, data, successMessage) => {
    const next = { ...form }

    if (type === 'all' || type === 'title' || type === 'title-description') next.title = data.title || form.title
    if (type === 'all' || type === 'description' || type === 'title-description') next.description = data.description || form.description
    if (type === 'all' || type === 'tags') next.tags = data.tags ? tagList(data.tags) : form.tags
    if (type === 'all') next.pinterest_link = data.pinterest_link || form.pinterest_link
    if (type === 'all' || type === 'image') {
      next.image_url = data.image_b64 ? `data:image/jpeg;base64,${data.image_b64}` : (data.generated_image_url || data.image_url || form.image_url)
    }

    setForm(next)
    await updatePin(pinId, { ...next, generated_image_url: next.image_url })
    toast.success(successMessage)
  }

  const regenerate = async (type) => {
    if (!pin) return
    setBusy(type)
    try {
      const productId = pin.product_id || pin.product?.id
      const request = type === 'image' ? generateImage : type === 'all' ? generateAll : generateText
      const { data } = await request(productId, instruction)
      await applyGeneratedText(type, data, `${type === 'all' ? 'Pin' : type} regenerated`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const recommendTitleDescription = async () => {
    if (!pin) return
    setBusy('title-description')
    try {
      const productId = pin.product_id || pin.product?.id
      const extraInstruction = [
        instruction,
        'Recommend and rewrite only the Pinterest title and description using the AI text model configured in Settings. Keep title under 100 characters and description under 800 characters. Keep existing image and tags unchanged.',
      ].filter(Boolean).join('\n')
      const { data } = await generateText(productId, extraInstruction)
      await applyGeneratedText('title-description', data, 'AI title and description recommended')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const handleSEOScore = async () => {
    setSeoLoading(true)
    try {
      const { data } = await getSEOScore(
        pin.product_id || pin.product?.id,
        form.title,
        form.description,
        form.tags.join(', ')
      )
      setSeoScore(data)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSeoLoading(false)
    }
  }

  const handleBoardRec = async () => {
    if (!schedule.social_media_id) return toast.error('Select a social media account first')
    setRecLoading(true)
    try {
      const { data } = await getBoardRecommendation(pin.product_id || pin.product?.id, schedule.social_media_id)
      setBoards(data.boards || [])
      setRecommendedBoard(data.recommendation)
      if (data.recommendation?.board_id) {
        setSchedule(s => ({ ...s, board_id: data.recommendation.board_id }))
      }
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setRecLoading(false)
    }
  }

  const addTag = (event) => {
    event.preventDefault()
    const value = tagDraft.trim().replace(/^#/, '')
    if (value && !form.tags.includes(value)) setForm({ ...form, tags: [...form.tags, value] })
    setTagDraft('')
  }

  const approve = async () => {
    setBusy('approve')
    try {
      await saveDraft({ status: 'ready' })
      toast.success('Pin approved and ready to schedule')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const handleSaveImage = async () => {
    if (!form.image_url.trim()) return toast.error('Paste product image URL first')
    setBusy('image-save')
    try {
      const data = await saveDraft({ generated_image_url: form.image_url.trim() })
      setForm((current) => ({ ...current, image_url: data.generated_image_url || current.image_url }))
      toast.success('Image URL saved')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const handleSaveDraft = async () => {
    setBusy('draft')
    try {
      await saveDraft({ status: 'draft' })
      toast.success('Draft saved without scheduling')
      navigate('/calendar')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const submitSchedule = async (event) => {
    event.preventDefault()
    if (!schedule.social_media_id) return toast.error('Select Pinterest account first')
    if (!schedule.board_id) return toast.error('Select Pinterest board first')
    setBusy('schedule')
    try {
      await saveDraft()
      await schedulePin(pinId, schedule)
      toast.success('Pin scheduled')
      navigate('/calendar')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin text-[#E60023]" size={36} /></div>

  const seoColor = seoScore
    ? seoScore.score >= 85 ? 'text-emerald-600' : seoScore.score >= 70 ? 'text-yellow-600' : seoScore.score >= 50 ? 'text-orange-500' : 'text-red-600'
    : ''

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Pin Preview */}
        <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
          <div className="mx-auto max-w-sm overflow-hidden rounded-[2rem] bg-white text-slate-950 shadow-2xl">
            <div className="aspect-[2/3] bg-slate-100">
              <img src={form.image_url || 'https://placehold.co/800x1200/f1f5f9/0f172a?text=Pin'} alt={form.title} className="h-full w-full object-cover" />
            </div>
            <div className="space-y-2 p-5">
              <h2 className="text-xl font-bold leading-tight">{form.title || 'Untitled pin'}</h2>
              <p className="line-clamp-3 text-sm leading-6 text-slate-600">{form.description}</p>
            </div>
          </div>
        </section>

        {/* Edit Panel */}
        <section className="rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 space-y-6">
          {/* SEO Score */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <TrendingUp size={16} /> Pinterest SEO Score
              </div>
              <button onClick={handleSEOScore} disabled={seoLoading} className="text-xs font-bold text-[#E60023] hover:underline disabled:opacity-50">
                {seoLoading ? 'Calculating...' : seoScore ? 'Recalculate' : 'Calculate'}
              </button>
            </div>
            {seoScore ? (
              <div className="space-y-2">
                <div className="flex items-end gap-3">
                  <span className={`text-5xl font-bold ${seoColor}`}>{seoScore.score}</span>
                  <span className="text-xl font-bold text-slate-400">/100</span>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${seoScore.score >= 85 ? 'bg-emerald-100 text-emerald-700' : seoScore.score >= 70 ? 'bg-yellow-100 text-yellow-700' : seoScore.score >= 50 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>{seoScore.grade}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all ${seoScore.score >= 85 ? 'bg-emerald-500' : seoScore.score >= 70 ? 'bg-yellow-500' : seoScore.score >= 50 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${seoScore.score}%` }} />
                </div>
                {seoScore.suggestions?.length > 0 && (
                  <ul className="space-y-1 mt-2">
                    {seoScore.suggestions.map((s, i) => <li key={i} className="text-xs text-orange-600">• {s}</li>)}
                  </ul>
                )}
                <div className="flex gap-4 text-xs text-slate-500 mt-1">
                  <span>Title: {seoScore.title_len}/100</span>
                  <span>Desc: {seoScore.desc_len}/800</span>
                  <span>Tags: {seoScore.tag_count}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Click "Calculate" to analyze SEO score</p>
            )}
          </div>

          {/* Board Recommendation */}
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <LayoutGrid size={16} /> Board Recommendation
              </div>
              <button onClick={handleBoardRec} disabled={recLoading || !schedule.social_media_id} className="text-xs font-bold text-[#E60023] hover:underline disabled:opacity-50">
                {recLoading ? 'Finding...' : recommendedBoard ? 'Re-recommend' : 'Get Recommendation'}
              </button>
            </div>
            {recommendedBoard ? (
              <div className="space-y-2">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                  <p className="font-bold text-emerald-800">{recommendedBoard.board_name}</p>
                  <p className="text-xs text-emerald-600 mt-1">{recommendedBoard.reason}</p>
                </div>
                {boards.length > 0 && (
                  <select value={schedule.board_id} onChange={e => setSchedule(s => ({ ...s, board_id: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <option value="">-- Select board --</option>
                    {boards.map(b => <option key={boardId(b)} value={boardId(b)}>{boardLabel(b)}</option>)}
                  </select>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Enter a social media ID and click "Get Recommendation"</p>
            )}
          </div>

          {/* AI Title + Description Recommendation */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-bold text-emerald-900">AI Title + Description Recommendation</p>
                <p className="mt-1 text-xs text-emerald-700">Uses the text model from Settings. Keeps tags and image unchanged.</p>
              </div>
              <button
                type="button"
                onClick={recommendTitleDescription}
                disabled={busy === 'title-description'}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy === 'title-description' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                Recommend
              </button>
            </div>
          </div>

          {/* Title */}
          <label className="block space-y-2">
            <div className="flex justify-between text-sm font-semibold"><span>Title</span><span>{form.title.length}/100</span></div>
            <input maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-[#E60023] focus:ring-4 focus:ring-red-100" />
          </label>

          {/* Description */}
          <label className="block space-y-2">
            <div className="flex justify-between text-sm font-semibold"><span>Description</span><span>{form.description.length}/800</span></div>
            <textarea maxLength={800} rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-[#E60023] focus:ring-4 focus:ring-red-100" />
          </label>

          {/* Tags */}
          <div className="space-y-2">
            <span className="text-sm font-semibold">Tags</span>
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 p-3">
              {form.tags.map((tag) => <button key={tag} onClick={() => setForm({ ...form, tags: form.tags.filter((item) => item !== tag) })} className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-[#E60023]">#{tag} x</button>)}
              <form onSubmit={addTag}><input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="add tag" className="px-2 py-1 outline-none" /></form>
            </div>
          </div>

          {/* Pinterest Link */}
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Pinterest link</span>
            <input value={form.pinterest_link} onChange={(e) => setForm({ ...form, pinterest_link: e.target.value })} className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-[#E60023] focus:ring-4 focus:ring-red-100" />
          </label>

          {/* Image URL */}
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Product image URL</span>
            <div className="flex gap-2">
              <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://...jpg" className="min-h-12 flex-1 rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-[#E60023] focus:ring-4 focus:ring-red-100" />
              <button type="button" onClick={handleSaveImage} disabled={busy === 'image-save'} className="rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-60">{busy === 'image-save' ? 'Saving...' : 'Save'}</button>
            </div>
            {!form.image_url && <span className="text-xs font-semibold text-amber-600">Add image here before scheduling.</span>}
          </label>

          {/* Extra instruction */}
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Extra instruction before regenerate</span>
            <input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Make it warmer, seasonal, more concise..." className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-[#E60023] focus:ring-4 focus:ring-red-100" />
          </label>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <Action busy={busy === 'title'} onClick={() => regenerate('title')} icon={Type} label="Title only" />
            <Action busy={busy === 'description'} onClick={() => regenerate('description')} icon={Type} label="Description only" />
            <Action busy={busy === 'tags'} onClick={() => regenerate('tags')} icon={Type} label="Tags only" />
            <Action busy={busy === 'image'} onClick={() => regenerate('image')} icon={Image} label="Image only" />
            <Action busy={busy === 'all'} onClick={() => regenerate('all')} icon={RefreshCw} label="All" />
            <button onClick={handleSaveDraft} disabled={busy === 'draft'} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{busy === 'draft' ? 'Saving...' : 'Save Draft'}</button>
            <button onClick={approve} disabled={busy === 'approve'} className="rounded-full bg-[#E60023] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">Approve</button>
          </div>
        </section>
      </div>

      {/* Schedule Form */}
      <form onSubmit={submitSchedule} className="grid gap-4 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-slate-200 md:grid-cols-4">
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Pinterest account</span>
          <select value={schedule.social_media_id} onChange={(e) => handleScheduleAccountChange(e.target.value)} disabled={scheduleMetaLoading || accounts.length === 0} className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:opacity-60">
            <option value="">{scheduleMetaLoading ? 'Loading accounts...' : 'Select Pinterest account'}</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Pinterest board</span>
          <select value={schedule.board_id} onChange={(e) => setSchedule({ ...schedule, board_id: e.target.value })} disabled={scheduleMetaLoading || boards.length === 0} className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 py-3 disabled:opacity-60">
            <option value="">{scheduleMetaLoading ? 'Loading boards...' : 'Select board'}</option>
            {boards.map((board) => <option key={boardId(board)} value={boardId(board)}>{boardLabel(board)}</option>)}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Schedule time</span>
          <input type="datetime-local" value={schedule.scheduled_at} onChange={(e) => setSchedule({ ...schedule, scheduled_at: e.target.value })} className="min-h-12 w-full rounded-2xl border border-slate-200 px-4 py-3" />
        </label>
        <button disabled={busy === 'schedule' || !schedule.social_media_id || !schedule.board_id} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-60"><Send size={16} /> {busy === 'schedule' ? 'Scheduling...' : 'Schedule'}</button>
      </form>
    </div>
  )
}

function Action({ busy, onClick, icon: Icon, label }) {
  return <button onClick={onClick} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-bold hover:bg-slate-50 disabled:opacity-60">{busy ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}{label}</button>
}

export default Review
