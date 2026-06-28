import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowRight, Loader2, Sparkles, Edit3 } from 'lucide-react'
import { createManualProduct, createPin, generateVariants, getStylePresets, parseProduct } from '../lib/api'

const errorMessage = (error) => error.response?.data?.detail || error.message

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

  useEffect(() => {
    getStylePresets().then(({ data }) => setStyles(data.styles || [])).catch(() => {})
  }, [])

  const handleParse = async (event) => {
    event.preventDefault()
    if (!url.trim()) return toast.error('Paste an Etsy product URL first')
    if (!url.includes('etsy.com')) return toast.error('v1 only supports Etsy product URLs')

    setParsing(true)
    try {
      const { data } = await parseProduct(url.trim())
      setProduct(data.product)
      toast.success(data.cached ? 'Loaded cached product' : 'Product parsed')
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
      toast.success('Manual product created')
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setParsing(false)
    }
  }

  const handleGenerate = async () => {
    if (!product) return

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
          pinterest_link: variant.pinterest_link || product.source_url,
          model_used_text: variant.model_used_text,
          model_used_image: variant.model_used_image,
        })
        created.push(pin)
      }
      toast.success(`Generated ${created.length} pin variants`)
      navigate(`/review/${created[0].id}`)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
      <section className="overflow-hidden rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-[#E60023]">
          <Sparkles size={16} /> Etsy to Pinterest in one flow
        </div>
        <h1 className="max-w-3xl font-serif text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl">
          Turn product links into 3 Pinterest pin variants.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
          Parse one Etsy listing, choose a visual style, then generate benefit, gift, and lifestyle pin angles.
        </p>

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
            <button type="submit" disabled={parsing} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#E60023] px-6 font-bold text-white shadow-lg shadow-red-100 transition hover:bg-red-700 disabled:opacity-70">
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
            <button type="submit" disabled={parsing} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#E60023] px-6 font-bold text-white shadow-lg shadow-red-100 transition hover:bg-red-700 disabled:opacity-70">
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

      <section className="rounded-[2rem] bg-slate-950 p-4 text-white shadow-xl shadow-slate-200">
        {product ? (
          <div className="overflow-hidden rounded-[1.5rem] bg-white text-slate-950">
            <img src={product.original_images?.[0] || 'https://placehold.co/900x1200/f1f5f9/0f172a?text=PinFlow'} alt={product.title || 'Parsed product'} className="h-80 w-full object-cover" />
            <div className="space-y-4 p-6">
              <div>
                <p className="text-sm font-semibold text-[#E60023]">{product.shop_name || (product.source_marketplace === 'manual' ? 'Manual Entry' : 'Etsy shop')}</p>
                <h2 className="mt-1 text-2xl font-bold">{product.title}</h2>
              </div>
              <p className="line-clamp-4 text-sm leading-6 text-slate-600">{product.description_raw}</p>
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
          <div className="flex min-h-[28rem] flex-col items-center justify-center rounded-[1.5rem] border border-white/10 bg-white/5 p-8 text-center">
            <div className="mb-4 h-20 w-20 rounded-full bg-[#E60023]" />
            <h2 className="font-serif text-3xl font-bold">Your product preview appears here.</h2>
            <p className="mt-3 max-w-sm text-slate-300">Paste a product URL and parse it, or enter product details manually.</p>
          </div>
        )}
      </section>
    </div>
  )
}

export default Home
