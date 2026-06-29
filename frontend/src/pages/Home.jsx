import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, ArrowRight, CheckCircle2, Edit3, Loader2, RefreshCcw, Sparkles } from 'lucide-react'
import { createManualProduct, createPin, generateVariants, getSettings, getStylePresets, parseProduct, syncAccounts, syncBoards, updateProductImages, updateSettings } from '../lib/api'

const errorMessage = (error) => error.response?.data?.detail || error.message
const formatTime = (date) => date ? new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(date) : ''
const sourceLabel = (product) => product?.shop_name || (product?.source_marketplace === 'manual' ? 'Manual entry' : 'Etsy listing')

function Home() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [product, setProduct] = useState(null)
  const [styles, setStyles] = useState([])
  const [stylePreset, setStylePreset] = useState('minimal-clean')
  const [extraInstruction, setExtraInstruction] = useState('')
  const [parsing, setParsing] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Manual product mode
  const [manualMode, setManualMode] = useState(false)
  const [manual, setManual] = useState({ title: '', description_raw: '', price: '', shop_name: '', source_url: '' })
  const [manualImages, setManualImages] = useState('')
  const [productImagesInput, setProductImagesInput] = useState('')
  const [savingImages, setSavingImages] = useState(false)
  const [postfastStatus, setPostfastStatus] = useState({ loading: true, accounts: [], error: '', hasKey: false, lastSynced: null })
  const [boardStatus, setBoardStatus] = useState({ loading: false, boards: [], error: '', defaultBoardId: '', defaultSocialMediaId: '', lastSynced: null })
  const [syncingPostfast, setSyncingPostfast] = useState(false)
  const [syncingBoards, setSyncingBoards] = useState(false)

  useEffect(() => {
    getStylePresets().then(({ data }) => setStyles(data.styles || [])).catch(() => {})
    loadPostfastStatus({ silent: true })
  }, [])

  const summarizePostfastAccounts = (accounts) => {
    const pinterestAccounts = accounts.filter((account) => (account.platform || '').toLowerCase().includes('pinterest'))
    const usableAccounts = pinterestAccounts.length ? pinterestAccounts : accounts
    const connected = usableAccounts.filter((account) => {
      const status = (account.connectionStatus || account.status || '').toUpperCase()
      return status && !['DISABLED', 'FAILED', 'EXPIRED', 'ERROR'].includes(status)
    })
    return { pinterestAccounts, usableAccounts, connected }
  }

  const accountLabel = (account) => account.displayName || account.platformUsername || account.username || account.name || account.id || 'Pinterest account'
  const boardLabel = (board) => board.name || board.title || board.boardName || board.boardId || board.id || 'Pinterest board'
  const boardId = (board) => board.boardId || board.id || board.board_id || ''

  const loadPostfastStatus = async ({ silent = false } = {}) => {
    setPostfastStatus((current) => ({ ...current, loading: true, error: '' }))
    try {
      const { data: settings } = await getSettings()
      setBoardStatus((current) => ({
        ...current,
        defaultBoardId: settings.default_board_id || '',
        defaultSocialMediaId: settings.default_social_media_id || '',
      }))
      if (!settings.postfast_api_key) {
        setPostfastStatus({ loading: false, accounts: [], error: 'PostFast API key belum diset', hasKey: false, lastSynced: null })
        setBoardStatus((current) => ({ ...current, loading: false, boards: [], error: 'PostFast API key belum diset' }))
        if (!silent) toast.error('PostFast API key belum diset')
        return
      }

      const { data } = await syncAccounts()
      if (!data.ok) {
        const message = data.error || 'Gagal sync PostFast account'
        setPostfastStatus({ loading: false, accounts: [], error: message, hasKey: true, lastSynced: null })
        if (!silent) toast.error(message)
        return
      }

      const accounts = data.accounts || []
      const { connected, usableAccounts } = summarizePostfastAccounts(accounts)
      setPostfastStatus({ loading: false, accounts, error: '', hasKey: true, lastSynced: new Date() })

      if (connected.length > 0) {
        if (!silent) toast.success(`Pinterest connected: ${connected.map(accountLabel).join(', ')}`)
        await loadBoardsForAccount(settings.default_social_media_id || connected[0].id, { silent: true, settings })
      } else if (usableAccounts.some((account) => (account.connectionStatus || account.status || '').toUpperCase() === 'DISABLED')) {
        toast.error('Account disabled, reconnect via PostFast')
      } else if (accounts.length === 0) {
        toast.error('Belum ada account Pinterest yang connect di PostFast')
      }
    } catch (error) {
      const message = errorMessage(error)
      setPostfastStatus({ loading: false, accounts: [], error: message, hasKey: true, lastSynced: null })
      if (!silent) toast.error(message)
    }
  }

  const loadBoardsForAccount = async (socialMediaId, { silent = false, settings = null } = {}) => {
    if (!socialMediaId) return
    setBoardStatus((current) => ({ ...current, loading: true, error: '', defaultSocialMediaId: socialMediaId }))
    try {
      const { data } = await syncBoards(socialMediaId)
      if (!data.ok) {
        const message = data.error || 'Gagal sync Pinterest boards'
        setBoardStatus((current) => ({ ...current, loading: false, error: message, boards: [] }))
        if (!silent) toast.error(message)
        return
      }

      const boards = data.boards || []
      const currentDefault = settings?.default_board_id || boardStatus.defaultBoardId || ''
      const detectedDefault = currentDefault || boardId(boards[0])
      if (!currentDefault && detectedDefault) {
        await updateSettings({ default_social_media_id: socialMediaId, default_board_id: detectedDefault })
      }
      setBoardStatus({
        loading: false,
        boards,
        error: '',
        defaultBoardId: detectedDefault,
        defaultSocialMediaId: socialMediaId,
        lastSynced: new Date(),
      })
      if (!silent) toast.success(detectedDefault ? `Default board ready: ${boardLabel(boards.find((board) => boardId(board) === detectedDefault) || boards[0])}` : 'Boards synced')
    } catch (error) {
      const message = errorMessage(error)
      setBoardStatus((current) => ({ ...current, loading: false, error: message, boards: [] }))
      if (!silent) toast.error(message)
    }
  }

  const handleSyncPostfast = async () => {
    setSyncingPostfast(true)
    try {
      await loadPostfastStatus({ silent: false })
    } finally {
      setSyncingPostfast(false)
    }
  }

  const handleSyncBoards = async () => {
    const targetAccount = connectedPostfastAccounts[0] || postfastAccounts[0]
    const socialMediaId = boardStatus.defaultSocialMediaId || targetAccount?.id
    if (!socialMediaId) return toast.error('Sync PostFast account dulu sebelum sync boards')
    setSyncingBoards(true)
    try {
      await loadBoardsForAccount(socialMediaId, { silent: false })
    } finally {
      setSyncingBoards(false)
    }
  }

  const handleDefaultBoardChange = async (nextBoardId) => {
    const targetAccount = connectedPostfastAccounts[0] || postfastAccounts[0]
    const socialMediaId = boardStatus.defaultSocialMediaId || targetAccount?.id
    setBoardStatus((current) => ({ ...current, defaultBoardId: nextBoardId, defaultSocialMediaId: socialMediaId || current.defaultSocialMediaId }))
    await updateSettings({ default_board_id: nextBoardId, default_social_media_id: socialMediaId })
    toast.success('Default board saved')
  }

  const handleParse = async (event) => {
    event.preventDefault()
    if (!url.trim()) return toast.error('Paste an Etsy product URL first')
    if (!url.includes('etsy.com')) return toast.error('v1 only supports Etsy product URLs')

    setParsing(true)
    try {
      const { data } = await parseProduct(url.trim())
      setProduct(data.product)
      setProductImagesInput((data.product.original_images || []).join(', '))
      if ((data.product.original_images || []).length === 0) {
        toast.error('Etsy blocked image scrape. Paste product image URL before generating.')
      } else {
        toast.success(data.cached ? 'Loaded cached product' : 'Product parsed')
      }
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setParsing(false)
    }
  }

  const handleManualSubmit = async (event) => {
    event.preventDefault()
    if (!manual.title.trim()) return toast.error('Title is required')
    setParsing(true)
    try {
      const images = manualImages.split(',').map(s => s.trim()).filter(Boolean)
      const { data } = await createManualProduct({
        title: manual.title.trim(),
        description_raw: manual.description_raw.trim(),
        price: manual.price.trim() || null,
        shop_name: manual.shop_name.trim() || null,
        source_url: manual.source_url.trim() || 'manual',
        original_images: images,
      })
      setProduct(data.product)
      setProductImagesInput((data.product.original_images || []).join(', '))
      toast.success('Manual product created')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setParsing(false)
    }
  }

  const handleSaveProductImages = async () => {
    if (!product) return
    const images = productImagesInput.split(',').map((value) => value.trim()).filter(Boolean)
    setSavingImages(true)
    try {
      const { data } = await updateProductImages(product.id, images)
      setProduct(data.product)
      setProductImagesInput((data.product.original_images || []).join(', '))
      toast.success(images.length ? 'Product image saved' : 'Product image cleared')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setSavingImages(false)
    }
  }

  const handleGenerate = async () => {
    if (!product) return

    if ((product.original_images || []).length === 0) {
      toast.error('Paste product image URL first. AI will only generate title, tags, and description.')
      return
    }

    setGenerating(true)
    try {
      const { data } = await generateVariants(product.id, extraInstruction, stylePreset, 3)
      const created = []
      for (const variant of data.variants || []) {
        const { data: pin } = await createPin({
          product_id: product.id,
          title: variant.title,
          description: variant.description,
          tags: variant.tags || [],
          image_b64: variant.image_b64,
          generated_image_url: variant.image_url,
          pinterest_link: variant.pinterest_link || product.source_url,
          model_used_text: variant.model_used_text,
          model_used_image: variant.model_used_image,
        })
        created.push(pin)
      }
      toast.success(`${created.length} pin variants ready`)
      navigate(`/review/${created[0].id}`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setGenerating(false)
    }
  }

  const { connected: connectedPostfastAccounts, usableAccounts: postfastAccounts } = summarizePostfastAccounts(postfastStatus.accounts)
  const hasDisabledPostfast = postfastAccounts.some((account) => (account.connectionStatus || account.status || '').toUpperCase() === 'DISABLED')
  const postfastReady = connectedPostfastAccounts.length > 0
  const defaultBoard = boardStatus.boards.find((board) => boardId(board) === boardStatus.defaultBoardId)
  const boardReady = Boolean(boardStatus.defaultBoardId)

  return (
    <div className="grid gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white/90 p-6 shadow-[0_20px_80px_-60px_rgba(15,23,42,0.45)] sm:p-8">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700">
          <Sparkles size={15} /> Etsy to Pinterest in one flow
        </div>
        <h1 className="max-w-3xl text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">
          Elegant Pinterest pins, generated from one product.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          Import product details, choose style direction, then review clean pin variants before scheduling.
        </p>

        <div className="mt-6 rounded-3xl border border-stone-200 bg-stone-50/80 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className={`mt-1 rounded-full p-2 ${postfastReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {postfastReady ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">PostFast status</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  {postfastStatus.loading ? 'Checking connected Pinterest account...' : postfastReady ? `Pinterest connected: ${connectedPostfastAccounts.map(accountLabel).join(', ')}` : postfastStatus.error || (hasDisabledPostfast ? 'Account disabled, reconnect via PostFast' : 'Belum ada account Pinterest yang connect')}
                </h2>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                  {postfastAccounts.map((account) => (
                    <span key={account.id || accountLabel(account)} className="rounded-full bg-white px-3 py-1 ring-1 ring-stone-200">
                      {accountLabel(account)} · {account.connectionStatus || account.status || 'UNKNOWN'}
                    </span>
                  ))}
                  {postfastStatus.lastSynced && <span className="rounded-full bg-white px-3 py-1 ring-1 ring-stone-200">Synced {formatTime(postfastStatus.lastSynced)}</span>}
                </div>
              </div>
            </div>
            <button onClick={handleSyncPostfast} disabled={postfastStatus.loading || syncingPostfast} className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60">
              <RefreshCcw size={16} className={(postfastStatus.loading || syncingPostfast) ? 'animate-spin' : ''} />
              Sync Now
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-3xl border border-stone-200 bg-white p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className={`mt-1 rounded-full p-2 ${boardReady ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                {boardReady ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Pinterest board</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">
                  {boardStatus.loading ? 'Checking Pinterest boards...' : boardReady ? `Default board: ${boardLabel(defaultBoard || { boardId: boardStatus.defaultBoardId })}` : boardStatus.error || 'Belum ada default board'}
                </h2>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select value={boardStatus.defaultBoardId} onChange={(event) => handleDefaultBoardChange(event.target.value)} disabled={!boardStatus.boards.length} className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-60">
                    <option value="">Choose default board</option>
                    {boardStatus.boards.map((board) => <option key={boardId(board)} value={boardId(board)}>{boardLabel(board)}</option>)}
                  </select>
                  {boardStatus.lastSynced && <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600 ring-1 ring-black/5">Boards synced {formatTime(boardStatus.lastSynced)}</span>}
                </div>
              </div>
            </div>
            <button onClick={handleSyncBoards} disabled={boardStatus.loading || syncingBoards || !postfastReady} className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60">
              <RefreshCcw size={16} className={(boardStatus.loading || syncingBoards) ? 'animate-spin' : ''} />
              Sync Boards
            </button>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => { setManualMode(false); setProduct(null) }}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${!manualMode ? 'bg-[#E60023] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Parse URL
          </button>
          <button
            onClick={() => { setManualMode(true); setProduct(null) }}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${manualMode ? 'bg-[#E60023] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <span className="inline-flex items-center gap-1"><Edit3 size={14} /> Manual Entry</span>
          </button>
        </div>

        {!manualMode ? (
          /* URL Parse Form */
          <form onSubmit={handleParse} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="paste Etsy product URL"
              className="min-h-14 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-5 text-base outline-none transition focus:border-[#E60023] focus:bg-white focus:ring-4 focus:ring-red-100"
            />
            <button type="submit" disabled={parsing} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#E60023] px-6 font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-70">
              {parsing && <Loader2 size={18} className="animate-spin" />}
              Parse
            </button>
          </form>
        ) : (
          /* Manual Entry Form */
          <form onSubmit={handleManualSubmit} className="mt-6 space-y-3">
            <input
              value={manual.title}
              onChange={e => setManual(m => ({ ...m, title: e.target.value }))}
              placeholder="Product title *"
              className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none transition focus:border-[#E60023] focus:bg-white focus:ring-4 focus:ring-red-100"
            />
            <textarea
              value={manual.description_raw}
              onChange={e => setManual(m => ({ ...m, description_raw: e.target.value }))}
              placeholder="Product description"
              rows={4}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none transition focus:border-[#E60023] focus:bg-white focus:ring-4 focus:ring-red-100"
            />
            <div className="flex gap-3">
              <input
                value={manual.price}
                onChange={e => setManual(m => ({ ...m, price: e.target.value }))}
                placeholder="Price (optional)"
                className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none transition focus:border-[#E60023] focus:bg-white focus:ring-4 focus:ring-red-100"
              />
              <input
                value={manual.shop_name}
                onChange={e => setManual(m => ({ ...m, shop_name: e.target.value }))}
                placeholder="Shop name (optional)"
                className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none transition focus:border-[#E60023] focus:bg-white focus:ring-4 focus:ring-red-100"
              />
            </div>
            <input
              value={manual.source_url}
              onChange={e => setManual(m => ({ ...m, source_url: e.target.value }))}
              placeholder="Product URL (optional)"
              className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none transition focus:border-[#E60023] focus:bg-white focus:ring-4 focus:ring-red-100"
            />
            <input
              value={manualImages}
              onChange={e => setManualImages(e.target.value)}
              placeholder="Image URLs (comma separated, optional)"
              className="min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none transition focus:border-[#E60023] focus:bg-white focus:ring-4 focus:ring-red-100"
            />
            <button type="submit" disabled={parsing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#E60023] px-6 font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-70">
              {parsing && <Loader2 size={18} className="animate-spin" />}
              Create Product
            </button>
          </form>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Style preset</span>
            <select value={stylePreset} onChange={(e) => setStylePreset(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3">
              {styles.map((style) => <option key={style.key} value={style.key}>{style.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Extra image/copy instruction</span>
            <input value={extraInstruction} onChange={(e) => setExtraInstruction(e.target.value)} placeholder="pastel colors, luxury tone, seasonal angle..." className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-3" />
          </label>
        </div>
      </section>

      <section className="rounded-[2rem] border border-stone-200 bg-white/90 p-4 shadow-[0_20px_80px_-60px_rgba(15,23,42,0.45)]">
        {product ? (
          <div className="overflow-hidden rounded-[1.5rem] bg-white text-slate-950">
            <img src={product.original_images?.[0] || 'https://placehold.co/900x1200/f1f5f9/0f172a?text=PinFlow'} alt={product.title || 'Parsed product'} className="h-80 w-full object-cover" />
            <div className="space-y-4 p-6">
              <div>
                <p className="text-sm font-semibold text-rose-700">{sourceLabel(product)}</p>
                <h2 className="mt-1 text-2xl font-black leading-tight tracking-tight">{product.title}</h2>
              </div>
              <p className="line-clamp-4 text-sm leading-6 text-slate-600">{product.description_raw}</p>
              {(product.original_images || []).length === 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-black">Etsy blocked image scrape.</p>
                  <p className="mt-1">Paste product image URL below. AI will only generate title, tags, and description; PinFlow will use this original product image.</p>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Product image URL</label>
                <div className="flex gap-2">
                  <input
                    value={productImagesInput}
                    onChange={(event) => setProductImagesInput(event.target.value)}
                    placeholder="https://...jpg (comma separated if multiple)"
                    className="min-h-11 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-[#E60023] focus:bg-white focus:ring-4 focus:ring-red-100"
                  />
                  <button onClick={handleSaveProductImages} disabled={savingImages} className="rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-60">
                    {savingImages ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="text-xl font-bold">{product.price || 'Price unavailable'}</span>
                <button onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-2 rounded-full bg-[#E60023] px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-70">
                  {generating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                  Generate 3 Variants
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[28rem] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-stone-300 bg-stone-50/70 p-8 text-center text-slate-950">
            <div className="mb-5 h-14 w-14 rounded-2xl bg-gradient-to-br from-rose-500 to-red-700 shadow-lg shadow-rose-200" />
            <h2 className="text-2xl font-black tracking-tight">Your product preview appears here.</h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">Paste a product URL and parse it, or enter product details manually.</p>
          </div>
        )}
      </section>
    </div>
  )
}

export default Home
