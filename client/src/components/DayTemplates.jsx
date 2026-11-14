import { useEffect, useMemo, useState } from 'react'
import * as api from '../api'
import { useApp } from '../context/useApp'

const DEFAULT_SEGMENTS = [
  { id: 'sleep', name: 'Sommeil', minutes: 480, color: '#5B6AA8' },
  { id: 'work', name: 'Travail', minutes: 480, color: '#D9895B' },
  { id: 'meals', name: 'Repas', minutes: 120, color: '#8EAE8D' },
  { id: 'free', name: 'Temps libre', minutes: 360, color: '#C3A65B' },
]

function emptyTemplate() { return { title: 'Ma journée type', segments: DEFAULT_SEGMENTS.map(segment => ({ ...segment })) } }
function formatMinutes(value) { const hours = Math.floor(value / 60); const minutes = value % 60; return minutes ? `${hours} h ${minutes} min` : `${hours} h` }
function polar(cx, cy, radius, angle) { const radians = (angle - 90) * Math.PI / 180; return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)] }
function arcPath(start, end) {
  const [sx, sy] = polar(120, 120, 88, start); const [ex, ey] = polar(120, 120, 88, end)
  return `M ${sx} ${sy} A 88 88 0 ${end - start > 180 ? 1 : 0} 1 ${ex} ${ey}`
}

function DayWheel({ segments }) {
  let offset = 0
  return <div className="day-template-wheel-wrap">
    <svg viewBox="0 0 240 240" className="day-template-wheel" role="img" aria-label="Répartition de la journée sur 24 heures">
      <circle cx="120" cy="120" r="88" fill="none" stroke="var(--border)" strokeWidth="36" />
      {segments.map(segment => { const start = offset / 1440 * 360; const end = (offset + segment.minutes) / 1440 * 360; offset += segment.minutes; return <path key={segment.id} d={arcPath(start, end)} fill="none" stroke={segment.color} strokeWidth="36" strokeLinecap="butt" /> })}
      <circle cx="120" cy="120" r="62" fill="var(--panel)" />
      <text x="120" y="116" textAnchor="middle" className="day-template-wheel-number">24 h</text>
      <text x="120" y="137" textAnchor="middle" className="day-template-wheel-label">une journée</text>
    </svg>
  </div>
}

export default function DayTemplates() {
  const { toast } = useApp()
  const [templates, setTemplates] = useState([])
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assignedId, setAssignedId] = useState(null)
  const total = useMemo(() => editing?.segments.reduce((sum, segment) => sum + (Number(segment.minutes) || 0), 0) || 0, [editing])

  const today = new Date().toISOString().slice(0, 10)
  const load = async () => { try { const [rows, assignment] = await Promise.all([api.getDayTemplates(), api.getDayTemplateAssignment(today)]); setTemplates(rows); setAssignedId(assignment.template?.id || null); if (!editing && rows[0]) setEditing(rows[0]) } catch (error) { toast(error.message, 'error') } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const updateSegment = (index, key, value) => setEditing(current => ({ ...current, segments: current.segments.map((segment, i) => i === index ? { ...segment, [key]: key === 'minutes' ? Math.max(1, Number(value) || 1) : value } : segment) }))
  const save = async () => { if (!editing || total !== 1440 || !editing.title.trim()) return; setSaving(true); try { const saved = editing.id ? await api.updateDayTemplate(editing.id, editing) : await api.createDayTemplate(editing); setTemplates(current => editing.id ? current.map(row => row.id === saved.id ? saved : row) : [saved, ...current]); setEditing(saved); toast('Journée type enregistrée') } catch (error) { toast(error.message, 'error') } finally { setSaving(false) } }
  const remove = async () => { if (!editing?.id || !window.confirm(`Supprimer « ${editing.title} » ?`)) return; try { await api.deleteDayTemplate(editing.id); const next = templates.filter(row => row.id !== editing.id); setTemplates(next); setEditing(next[0] || null); toast('Journée type supprimée') } catch (error) { toast(error.message, 'error') } }
  const assignToday = async (id) => { try { await api.setDayTemplateAssignment(today, id); setAssignedId(id); toast('Cercle choisi pour aujourd’hui') } catch (error) { toast(error.message, 'error') } }

  return <section className="page day-templates-page">
    <header className="page-header"><div><p className="eyebrow">ORGANISER</p><h1>Journées types</h1><p className="page-subtitle">Dessinez vos rythmes de 24 heures, selon le moment.</p></div><button className="button primary" onClick={() => setEditing(emptyTemplate())}>+ Nouveau cercle</button></header>
    <div className="day-templates-layout">
      <aside className="day-template-list panel"><h2>Mes rythmes</h2><p className="muted">Aujourd’hui : <strong>{templates.find(row => row.id === assignedId)?.title || 'aucun cercle choisi'}</strong></p>{loading ? <p>Chargement...</p> : templates.length ? templates.map(template => <div key={template.id} className="day-template-list-entry"><button className={`day-template-list-item ${editing?.id === template.id ? 'active' : ''}`} onClick={() => setEditing(template)}><span className="day-template-dot" style={{ background: template.segments[0]?.color }} />{template.title}<small>{template.segments.length} temps</small></button><button className="day-template-assign" onClick={() => assignToday(template.id)}>{assignedId === template.id ? 'Choisi aujourd’hui' : 'Choisir aujourd’hui'}</button></div>) : <p className="muted">Créez votre premier cercle.</p>}</aside>
      {editing ? <div className="day-template-editor panel"><div className="day-template-preview"><DayWheel segments={editing.segments} /><div><h2>{editing.title || 'Sans titre'}</h2><p className="muted">Chaque couleur représente une partie de votre journée.</p><strong className={total === 1440 ? 'day-total-ok' : 'day-total-warn'}>{formatMinutes(total)} / 24 h</strong><p className="muted">{total === 1440 ? 'Le cercle est complet.' : `Il reste ${formatMinutes(Math.abs(1440 - total))} à répartir.`}</p></div></div><label>Nom du cercle<input value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} placeholder="Semaine, Weekend, Jour épuisé..." /></label><div className="day-segments-header"><h3>Découpage</h3><button className="button secondary" onClick={() => setEditing({ ...editing, segments: [...editing.segments, { id: `segment-${Date.now()}`, name: 'Nouveau temps', minutes: 60, color: '#7C8CFF' }] })}>+ Ajouter un temps</button></div><div className="day-segments">{editing.segments.map((segment, index) => <div className="day-segment-row" key={segment.id}><input type="color" value={segment.color} onChange={event => updateSegment(index, 'color', event.target.value)} title="Couleur" /><input value={segment.name} onChange={event => updateSegment(index, 'name', event.target.value)} aria-label="Nom du temps" /><input type="number" min="1" max="1440" value={segment.minutes} onChange={event => updateSegment(index, 'minutes', event.target.value)} aria-label="Durée en minutes" /><span>min</span><button className="icon-button" onClick={() => setEditing({ ...editing, segments: editing.segments.filter((_, i) => i !== index) })} aria-label="Supprimer ce temps">×</button></div>)}</div><div className="day-template-actions"><button className="button primary" disabled={saving || total !== 1440 || !editing.title.trim()} onClick={save}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>{editing.id && <button className="button danger" onClick={remove}>Supprimer</button>}</div></div> : <div className="day-template-empty panel"><h2>Un cercle pour chaque énergie</h2><p>Créez un rythme pour la semaine, le weekend ou les jours où vous avez besoin de ralentir.</p><button className="button primary" onClick={() => setEditing(emptyTemplate())}>Créer ma première journée</button></div>}
    </div>
  </section>
}
