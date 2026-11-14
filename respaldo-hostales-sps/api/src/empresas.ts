import { Hono, type Context } from 'hono'
import { normalizar, type Empresa } from '../../shared/reglas'
import type { AppEnv } from './env'
import { historial, soloDueno } from './db'
import { ahora, cuerpo, fail, texto, uid } from './util'

type FilaEmpresa = { id: string; nombre: string; alias: string; activa: number; noches?: number }

const aEmpresa = (f: FilaEmpresa): Empresa => ({ id: f.id, nombre: f.nombre, alias: leerAlias(f.alias), activa: Boolean(f.activa), noches: f.noches })

function leerAlias(valor: string): string[] {
  try {
    const a = JSON.parse(valor)
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function limpiarAlias(valor: unknown, nombre: string): string[] {
  const lista = Array.isArray(valor) ? valor : typeof valor === 'string' ? valor.split(',') : []
  const vistos = new Set([normalizar(nombre)])
  const out: string[] = []
  for (const a of lista) {
    const t = texto(a, 80)
    const n = normalizar(t)
    if (n && !vistos.has(n)) {
      vistos.add(n)
      out.push(t)
    }
  }
  return out
}

export async function todasLasEmpresas(db: D1Database) {
  const { results } = await db.prepare('SELECT id, nombre, alias, activa FROM empresas').all<FilaEmpresa>()
  return results.map(aEmpresa)
}

/** Busca por nombre o por alias, sin importar mayúsculas ni acentos («pepsi» → Emsula). */
export function buscarEmpresa(empresas: Empresa[], nombre: string) {
  const n = normalizar(nombre)
  if (!n) return null
  return empresas.find((e) => normalizar(e.nombre) === n) ?? empresas.find((e) => e.alias.some((a) => normalizar(a) === n)) ?? null
}

/**
 * La empresa de un registro: por id, o por nombre (si no existe, se crea y queda en el historial
 * para que el dueño la revise o la una con otra).
 */
export async function resolverEmpresa(c: Context<AppEnv>, hostalId: string, entrada: { empresa_id?: unknown; empresa?: unknown }) {
  const db = c.env.DB
  if (typeof entrada.empresa_id === 'string' && entrada.empresa_id) {
    const e = await db.prepare('SELECT id FROM empresas WHERE id = ?').bind(entrada.empresa_id).first<{ id: string }>()
    if (!e) fail(404, 'Esa empresa no existe.')
    return { id: e.id, sentencias: [] as D1PreparedStatement[] }
  }
  const nombre = texto(entrada.empresa, 80)
  if (!nombre) return { id: null, sentencias: [] as D1PreparedStatement[] }
  const existente = buscarEmpresa(await todasLasEmpresas(db), nombre)
  if (existente) return { id: existente.id, sentencias: [] as D1PreparedStatement[] }
  const id = uid()
  return {
    id,
    sentencias: [
      db.prepare("INSERT INTO empresas (id, nombre, alias, creada_en) VALUES (?, ?, '[]', ?)").bind(id, nombre, ahora()),
      historial(c, { hostal_id: hostalId, accion: 'agregó empresa', entidad: 'empresa', entidad_id: id, detalle: { nombre } }),
    ],
  }
}

export const empresaRoutes = new Hono<AppEnv>()

empresaRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT e.id, e.nombre, e.alias, e.activa, COUNT(r.id) AS noches
     FROM empresas e LEFT JOIN registros r ON r.empresa_id = e.id AND r.anulado_en IS NULL
     GROUP BY e.id ORDER BY e.nombre COLLATE NOCASE`,
  ).all<FilaEmpresa>()
  return c.json({ empresas: results.map(aEmpresa) })
})

empresaRoutes.post('/', async (c) => {
  const body = await cuerpo<{ nombre?: string; alias?: unknown }>(c)
  const nombre = texto(body.nombre, 80)
  if (!nombre) fail(400, 'Escribe el nombre de la empresa.')
  const empresas = await todasLasEmpresas(c.env.DB)
  const repetida = buscarEmpresa(empresas, nombre)
  if (repetida) fail(409, `Ya existe: ${repetida.nombre}.`)
  const id = uid()
  const alias = limpiarAlias(body.alias, nombre)
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO empresas (id, nombre, alias, creada_en) VALUES (?, ?, ?, ?)').bind(id, nombre, JSON.stringify(alias), ahora()),
    historial(c, { hostal_id: null, accion: 'agregó empresa', entidad: 'empresa', entidad_id: id, detalle: { nombre, alias } }),
  ])
  return c.json({ id, nombre, alias, activa: true }, 201)
})

empresaRoutes.patch('/:id', async (c) => {
  soloDueno(c.get('usuario'))
  const id = c.req.param('id')
  const antes = await c.env.DB.prepare('SELECT * FROM empresas WHERE id = ?').bind(id).first<FilaEmpresa>()
  if (!antes) fail(404, 'Esa empresa no existe.')
  const body = await cuerpo<{ nombre?: string; alias?: unknown; activa?: boolean }>(c)
  const nombre = body.nombre === undefined ? antes.nombre : texto(body.nombre, 80)
  if (!nombre) fail(400, 'Escribe el nombre de la empresa.')
  const otra = buscarEmpresa((await todasLasEmpresas(c.env.DB)).filter((e) => e.id !== id), nombre)
  if (otra) fail(409, `Ya existe otra empresa con ese nombre: ${otra.nombre}. Puedes unirlas.`)
  const alias = body.alias === undefined ? leerAlias(antes.alias) : limpiarAlias(body.alias, nombre)
  const activa = body.activa === undefined ? antes.activa : body.activa ? 1 : 0
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE empresas SET nombre = ?, alias = ?, activa = ? WHERE id = ?').bind(nombre, JSON.stringify(alias), activa, id),
    historial(c, { hostal_id: null, accion: 'editó empresa', entidad: 'empresa', entidad_id: id, detalle: { antes: aEmpresa(antes), despues: { nombre, alias, activa: Boolean(activa) } } }),
  ])
  return c.json({ id, nombre, alias, activa: Boolean(activa) })
})

/** Une una empresa duplicada en otra: sus noches y facturas pasan a la que queda, y su nombre queda como alias. */
empresaRoutes.post('/:id/unir', async (c) => {
  soloDueno(c.get('usuario'))
  const id = c.req.param('id')
  const body = await cuerpo<{ de?: string }>(c)
  if (typeof body.de !== 'string' || body.de === id) fail(400, 'Elige la empresa duplicada.')
  const db = c.env.DB
  const [queda, sale] = await Promise.all([
    db.prepare('SELECT * FROM empresas WHERE id = ?').bind(id).first<FilaEmpresa>(),
    db.prepare('SELECT * FROM empresas WHERE id = ?').bind(body.de).first<FilaEmpresa>(),
  ])
  if (!queda || !sale) fail(404, 'Esa empresa no existe.')
  const alias = limpiarAlias([...leerAlias(queda.alias), sale.nombre, ...leerAlias(sale.alias)], queda.nombre)
  const movidas = await db.prepare('SELECT COUNT(*) AS n FROM registros WHERE empresa_id = ?').bind(sale.id).first<{ n: number }>()
  await db.batch([
    db.prepare('UPDATE registros SET empresa_id = ? WHERE empresa_id = ?').bind(queda.id, sale.id),
    db.prepare('UPDATE facturas SET empresa_id = ? WHERE empresa_id = ?').bind(queda.id, sale.id),
    db.prepare('UPDATE empresas SET alias = ? WHERE id = ?').bind(JSON.stringify(alias), queda.id),
    db.prepare('DELETE FROM empresas WHERE id = ?').bind(sale.id),
    historial(c, { hostal_id: null, accion: 'unió empresas', entidad: 'empresa', entidad_id: queda.id, detalle: { queda: queda.nombre, unida: sale.nombre, registros: movidas?.n ?? 0 } }),
  ])
  return c.json({ id: queda.id, nombre: queda.nombre, alias, registros_movidos: movidas?.n ?? 0 })
})
