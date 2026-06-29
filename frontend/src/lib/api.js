import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({ baseURL: BASE })

export const parseProduct    = (url) => api.post('/products/parse', { url })
export const listProducts    = () => api.get('/products')
export const updateProductImages = (id, original_images) => api.put(`/products/${id}/images`, { original_images })

export const getStylePresets = () => api.get('/ai/style-presets')
export const generateAll     = (product_id, extra_instruction = '', style_preset = 'minimal-clean') =>
  api.post('/ai/generate/all', { product_id, extra_instruction, style_preset })
export const generateVariants = (product_id, extra_instruction = '', style_preset = 'minimal-clean', count = 3) =>
  api.post('/ai/generate/variants', { product_id, extra_instruction, style_preset, count })
export const generateText    = (product_id, extra_instruction = '', style_preset = 'minimal-clean', angle_instruction = '') =>
  api.post('/ai/generate/text', { product_id, extra_instruction, style_preset, angle_instruction })
export const generateImage   = (product_id, extra_instruction = '', style_preset = 'minimal-clean', angle_instruction = '') =>
  api.post('/ai/generate/image', { product_id, extra_instruction, style_preset, angle_instruction })

export const createPin       = (body) => api.post('/pins', body)
export const listPins        = () => api.get('/pins')
export const getPin          = (id) => api.get(`/pins/${id}`)
export const updatePin       = (id, body) => api.put(`/pins/${id}`, body)
export const deletePin       = (id) => api.delete(`/pins/${id}`)
export const schedulePin     = (id, body) => api.post(`/pins/${id}/schedule`, body)
export const cancelPin       = (id) => api.delete(`/pins/${id}/cancel`)
export const syncPinStatus   = () => api.post('/pins/sync-status')

export const getSettings     = () => api.get('/settings')
export const updateSettings  = (body) => api.put('/settings', body)
export const testAI          = () => api.post('/settings/test-ai')
export const syncAccounts    = () => api.post('/settings/sync-accounts')
export const syncBoards      = (id) => api.post(`/settings/sync-boards/${id}`)

export const getSEOScore = (product_id, title, description, tags) =>
  api.post('/ai/seo-score', { product_id, title, description, tags })

export const getBoardRecommendation = (product_id, social_media_id) =>
  api.post('/ai/board-recommendation', { product_id, social_media_id })

export const createManualProduct = (data) => api.post('/products/manual', data)

export default api
