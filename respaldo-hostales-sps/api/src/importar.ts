import { Hono } from 'hono'
import { instanteHN, sumarDias } from '../../shared/fechas'
import { leerFecha, leerPago, leerPrecio, leerTipo, nombrePropio, normalizar, precioLista, type Pago, type TipoHabitacion } from '../../shared/reglas'
import type { AppEnv } from './env'
import { cargarHostal, historial, soloDueno, subirVersion } from './db'
import { buscarEmpresa, todasLasEmpresas } from './empresas'
import { ahora, cuerpo, fail, texto, uid } from './util'

export const importarRoutes = new Hono<AppEnv>()

type FilaCSV = Partial<Record<'fecha' | 'habitacion' | 'huesped' | 'empresa' | 'tipo' | 'precio' | 'pago', string>>

interface Valida {
  fila: number
  fecha: string
  habitacion: string
  modo: 'noche' | 'hora'
  huesped: string
  empresa: string | null
  empresaClave: string | null
  tipo: TipoHabitacion
  precio: number | null
  pago: Pago | null
}

/**
 * Importa los reportes en papel pasados a CSV. Primero se revisa (aplicar: false) y se muestra qué entra,
 * qué tiene errores y qué está repetido (dos huéspedes en la misma habitación la misma noche); luego se aplica.
 */
importarRoutes.post('/hostales/:h/importar', async (c) => {
  const u = c.get('usuario')
  soloDueno(u)
  const db = c.env.DB
  const h = await cargarHostal(db, c.req.param('h'))
  const body = await cuerpo<{ filas?: unknown; aplicar?: boolean }>(c)
  if (!Array.isArray(body.filas) || !body.filas.length) fail(400, 'El archivo no tiene filas.')
  if (body.filas.length > 5000) fail(400, 'Máximo 5,000 filas por archivo.')
  const empresas = await todasLasEmpresas(db)

  const errores: { fila: number; motivo: string }[] = []
  const duplicados: { fila: number; motivo: string; fecha: string; habitacion: string; huesped: string }[] = []
  const validas: Valida[] = []
  const nuevas = new Map<string, string>()
  const vistas = new Map<string, number>()

  const leidas = (body.filas as FilaCSV[]).map((f, i) => ({ f, fila: i + 2 })) // fila 1 = encabezados
  const fechas = leidas.map(({ f }) => leerFecha(f.fecha ?? '')).filter((x): x is string => Boolean(x)).sort()
  const existentes = new Map<string, string>()
  if (fechas.length) {
    const { results } = await db
      .prepare("SELECT fecha, habitacion, huesped FROM registros WHERE hostal_id = ? AND modo = 'noche' AND anulado_en IS NULL AND fecha BETWEEN ? AND ?")
      .bind(h.id, fechas[0], fechas.at(-1))
      .all<{ fecha: string; habitacion: string; huesped: string }>()
    for (const r of results) existentes.set(`${r.fecha}|${r.habitacion}`, r.huesped)
  }

  for (const { f, fila } of leidas) {
    const err = (motivo: string) => errores.push({ fila, motivo })
    if (Object.values(f).every((v) => !texto(v))) continue // fila vacía
    const fecha = leerFecha(f.fecha ?? '')
    if (!fecha) {
      err(`Fecha no válida: «${f.fecha ?? ''}».`)
      continue
    }
    const numero = texto(f.habitacion, 20).replace(/^(hab(itaci[oó]n)?\.?|#)\s*/i, '').toUpperCase()
    const hab = h.habitaciones.find((x) => x.numero.toUpperCase() === numero)
    if (!hab) {
      err(`La habitación «${f.habitacion ?? ''}» no existe en ${h.nombre}.`)
      continue
    }
    const tipoLeido = texto(f.tipo) ? leerTipo(f.tipo ?? '') : null
    if (tipoLeido === undefined) {
      err(`Tipo desconocido: «${f.tipo}». Usa Sencilla, Doble, Triple o Hora.`)
      continue
    }
    const modo = tipoLeido === 'hora' ? 'hora' : 'noche'
    const tipo: TipoHabitacion = tipoLeido && tipoLeido !== 'hora' ? tipoLeido : hab.tipo
    const huesped = nombrePropio(texto(f.huesped, 120)) || (modo === 'hora' ? 'Por hora' : '')
    if (!huesped) {
      err('Falta el nombre del huésped.')
      continue
    }
    const pago = leerPago(f.pago ?? '')
    if (pago === undefined) {
      err(`Forma de pago desconocida: «${f.pago}». Usa Efectivo, T/C, Transferencia, Crédito u Otros.`)
      continue
    }
    let precio = leerPrecio(f.precio ?? '')
    if (precio === undefined) {
      err(`Precio no válido: «${f.precio}».`)
      continue
    }
    if (pago === 'credito' && precio == null) precio = precioLista(h, tipo)
    const nombreEmpresa = texto(f.empresa, 80)
    let empresa: string | null = null
    let empresaClave: string | null = null
    if (nombreEmpresa) {
      const existente = buscarEmpresa(empresas, nombreEmpresa)
      if (existente) {
        empresa = existente.nombre
        empresaClave = existente.id
      } else {
        empresaClave = 'nueva:' + normalizar(nombreEmpresa)
        if (!nuevas.has(empresaClave)) nuevas.set(empresaClave, nombreEmpresa)
        empresa = nuevas.get(empresaClave)!
      }
    }
    if (pago === 'credito' && !empresa) {
      err('Es crédito pero no dice la empresa.')
      continue
    }
    if (modo === 'noche') {
      const clave = `${fecha}|${hab.numero}`
      const antes = vistas.get(clave)
      if (antes) {
        duplicados.push({ fila, motivo: `La habitación ${hab.numero} ya aparece esa noche en la fila ${antes}.`, fecha, habitacion: hab.numero, huesped })
        continue
      }
      if (existentes.has(clave)) {
        duplicados.push({ fila, motivo: `Ya está registrada en la app (${existentes.get(clave)}).`, fecha, habitacion: hab.numero, huesped })
        continue
      }
      vistas.set(clave, fila)
    }
    validas.push({ fila, fecha, habitacion: hab.numero, modo, huesped, empresa, empresaClave, tipo, precio, pago })
  }

  const resumen = {
    total: leidas.length,
    validas: validas.length,
    noches: validas.filter((v) => v.modo === 'noche').length,
    horas: validas.filter((v) => v.modo === 'hora').length,
    monto: validas.reduce((s, v) => s + (v.precio ?? 0), 0),
    desde: validas.map((v) => v.fecha).sort()[0] ?? null,
    hasta: validas.map((v) => v.fecha).sort().at(-1) ?? null,
    errores,
    duplicados,
    empresas_nuevas: [...nuevas.values()],
    muestra: validas.slice(0, 15),
  }
  if (!body.aplicar) return c.json(resumen)
  if (!validas.length) fail(400, 'No hay filas válidas para importar.')

  // Empresas nuevas primero (las noches las referencian).
  const t = ahora()
  const idsNuevas = new Map<string, string>()
  const sentencias: D1PreparedStatement[] = []
  for (const [clave, nombre] of nuevas) {
    const id = uid()
    idsNuevas.set(clave, id)
    sentencias.push(db.prepare("INSERT INTO empresas (id, nombre, alias, creada_en) VALUES (?, ?, '[]', ?)").bind(id, nombre, t))
  }

  // Noches seguidas del mismo huésped en la misma habitación son una sola estadía.
  const ordenadas = [...validas].sort((a, b) => a.habitacion.localeCompare(b.habitacion) || a.fecha.localeCompare(b.fecha))
  let anterior: Valida | null = null
  let estadia = ''
  for (const v of ordenadas) {
    const sigue = anterior && anterior.modo === 'noche' && v.modo === 'noche' && anterior.habitacion === v.habitacion && normalizar(anterior.huesped) === normalizar(v.huesped) && sumarDias(anterior.fecha, 1) === v.fecha
    if (!sigue) estadia = uid()
    anterior = v
    const empresaId = v.empresaClave ? (idsNuevas.get(v.empresaClave) ?? v.empresaClave) : null
    const entrada = instanteHN(v.fecha, v.modo === 'hora' ? '12:00' : '14:00')
    sentencias.push(
      db
        .prepare(
          `INSERT INTO registros (id, hostal_id, fecha, habitacion, modo, huesped, empresa_id, tipo, precio, pago, estadia_id, entrada_en, salida_en, origen, creado_por, creado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'importado', ?, ?)`,
        )
        .bind(uid(), h.id, v.fecha, v.habitacion, v.modo, v.huesped, empresaId, v.tipo, v.precio, v.pago, estadia, entrada, v.modo === 'hora' ? entrada + 3600_000 : null, u.id, t),
    )
  }
  sentencias.push(
    historial(c, {
      hostal_id: h.id,
      accion: 'importó CSV',
      entidad: 'registro',
      detalle: { filas: resumen.total, importadas: validas.length, errores: errores.length, duplicados: duplicados.length, desde: resumen.desde, hasta: resumen.hasta, empresas_nuevas: resumen.empresas_nuevas },
    }),
    subirVersion(db, h.id),
  )
  // D1 aplica cada lote como una transacción; con archivos grandes se parte en lotes.
  for (let i = 0; i < sentencias.length; i += 400) await db.batch(sentencias.slice(i, i + 400))
  return c.json({ ...resumen, importadas: validas.length })
})
