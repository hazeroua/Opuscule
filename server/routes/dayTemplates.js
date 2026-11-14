const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { getDb } = require('../db')

const router = express.Router()
const HEX = /^#[0-9a-f]{6}$/i

function cleanSegments(value) {
  if (!Array.isArray(value) || !value.length || value.length > 48) return null
  const segments = value.map((segment, index) => ({
    id: String(segment?.id || `segment-${index + 1}`).slice(0, 80),
    name: String(segment?.name || '').trim().slice(0, 80),
    minutes: Math.round(Number(segment?.minutes)),
    color: HEX.test(String(segment?.color || '')) ? String(segment.color).toUpperCase() : '#6B8AFD',
  }))
  if (segments.some(segment => !segment.name || !Number.isInteger(segment.minutes) || segment.minutes < 1)) return null
  return segments.reduce((sum, segment) => sum + segment.minutes, 0) === 1440 ? segments : null
}

function rowPayload(row) {
  let segments = []
  try { segments = JSON.parse(row.segments_json) } catch (_) {}
  return { id: row.id, title: row.title, segments, created_at: row.created_at, updated_at: row.updated_at }
}

router.get('/', (req, res) => {
  const db = getDb()
  res.json(db.prepare('SELECT * FROM day_templates WHERE user_id = ? ORDER BY updated_at DESC, created_at ASC').all(req.user.id).map(rowPayload))
})

router.post('/', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120)
  const segments = cleanSegments(req.body?.segments)
  if (!title || !segments) return res.status(400).json({ error: 'Un nom et des segments couvrant exactement 24 heures sont requis.' })
  const id = uuidv4()
  const now = new Date().toISOString()
  const db = getDb()
  db.prepare('INSERT INTO day_templates (id, title, segments_json, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, title, JSON.stringify(segments), req.user.id, now, now)
  res.status(201).json(rowPayload(db.prepare('SELECT * FROM day_templates WHERE id = ? AND user_id = ?').get(id, req.user.id)))
})

router.get('/assignment/today', (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10))
  const db = getDb()
  const row = db.prepare(`SELECT t.* FROM day_template_assignments a JOIN day_templates t ON t.id = a.template_id WHERE a.entry_date = ? AND a.user_id = ? AND t.user_id = ?`).get(date, req.user.id, req.user.id)
  res.json(row ? { date, template: rowPayload(row) } : { date, template: null })
})

router.put('/assignment/today', (req, res) => {
  const date = String(req.body?.date || new Date().toISOString().slice(0, 10))
  const templateId = String(req.body?.template_id || '')
  const db = getDb()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !db.prepare('SELECT id FROM day_templates WHERE id = ? AND user_id = ?').get(templateId, req.user.id)) return res.status(400).json({ error: 'Journée type ou date invalide.' })
  db.prepare('INSERT INTO day_template_assignments (entry_date, template_id, user_id, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(entry_date, user_id) DO UPDATE SET template_id = excluded.template_id, updated_at = excluded.updated_at').run(date, templateId, req.user.id, new Date().toISOString())
  res.json({ date, template: rowPayload(db.prepare('SELECT * FROM day_templates WHERE id = ? AND user_id = ?').get(templateId, req.user.id)) })
})

router.put('/:id', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120)
  const segments = cleanSegments(req.body?.segments)
  if (!title || !segments) return res.status(400).json({ error: 'Un nom et des segments couvrant exactement 24 heures sont requis.' })
  const db = getDb()
  const result = db.prepare('UPDATE day_templates SET title = ?, segments_json = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(title, JSON.stringify(segments), new Date().toISOString(), req.params.id, req.user.id)
  if (!result.changes) return res.status(404).json({ error: 'Journée type introuvable.' })
  res.json(rowPayload(db.prepare('SELECT * FROM day_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)))
})

router.delete('/:id', (req, res) => {
  const result = getDb().prepare('DELETE FROM day_templates WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
  if (!result.changes) return res.status(404).json({ error: 'Journée type introuvable.' })
  res.json({ ok: true })
})

module.exports = router
